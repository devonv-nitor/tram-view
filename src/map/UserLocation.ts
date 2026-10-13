/**
 * The user's own position on the map (TV-0030): a pulsing blue dot with a
 * soft accuracy ring, centered on the user once and tracked thereafter.
 *
 * Data: no new request of any kind. The position comes from the browser's
 * own Geolocation API (`navigator.geolocation.watchPosition`) - the feature
 * is local to the browser, adds no dependency and asks no network; the
 * permission is the browser's own prompt when the watch starts and stays
 * the browser's to manage (never persisted by the app). The watch's handle
 * lives and dies with MapView's map effect (start()/stop(), the same
 * dispose discipline as the marker and heatmap layers), so the vehicle
 * overview page - a separate route with no map - runs no watch, and
 * nothing is cached or persisted across sessions.
 *
 * Stacking: the dot is a normal Leaflet marker in the default `markerPane`
 * tier (z 600), so it renders above the punctuality heatmap (pane z 250)
 * and the route overlay (pane z 350) exactly like the tram markers do, and
 * shares their hover/click reachability. Leaflet orders marker elements in
 * the markerPane by the fractional y of each marker's position (and only
 * that) - the user dot is NOT pinned above the trams by z-index, so a tram
 * standing on the user's dot overlaps it by latitude order. That is the
 * honest behavior for a 14 px dot inside a 28 px tram body: both stay
 * clickable everywhere except the exact overlap pixel band, where the
 * element later in DOM order wins (Leaflet appends on add, so the dot -
 * typically added after the tram set - is on top within that band; this is
 * cosmetic there, not a click loss: a tram's own click listener still
 * fires wherever the tram body is not exactly covered by the dot's own
 * 14x14 box, and the click-on-dot affordance is the dot's own).
 * Centering (requirement 2): the first USABLE fix - real coordinates,
 * finite positive accuracy at most 500 m - centers the map on the user at
 * DEFAULT_MAP_ZOOM exactly once per session. The once-guard latches only
 * when a real centering happens: an unusable fix before one (unusable
 * coordinates, missing/non-positive accuracy, or accuracy coarser than
 * the threshold) leaves centering available for the next fix. Later
 * fixes never touch the viewport (tracking keeps the marker moving, the
 * user keeps the pan). A fix that does not center (too coarse, or no
 * accuracy number) shows the dot when its coordinates are real and gets
 * one console.info saying why (requirement 5's honesty note; once per
 * layer instance, whether before or after the latch). Clicking the dot
 * is the one user-initiated re-center (requirement 3): it always
 * re-centers on the CURRENT fix (idempotent when already centered) via
 * setOnRecenter's callback.
 *
 * Per-fix honesty: a fix without a usable accuracy number REMOVES the
 * accuracy ring - the dot keeps its last real position (the position is
 * real, the precision is unknown) - and the ring returns only when a fix
 * with a usable accuracy number arrives. Transient errors
 * (POSITION_UNAVAILABLE/TIMEOUT) log once per outage, not per error
 * callback: the flag resets on the next fix with real coordinates (the
 * metro stream's once-per-outage semantics, useTramPositions.ts).
 * PERMISSION_DENIED keeps its one-shot stop-the-watch behavior.
 */
import L from "leaflet";
import { DEFAULT_MAP_ZOOM } from "./constants";

/** TV-0030 requirement 2: a fix coarser than this (meters) - or one with
 * no accuracy number - shows the dot but does not center the map; one
 * console.info says why (requirement 5's honesty note). The CENTERING
 * decision itself is made on the first USABLE fix only (real coordinates,
 * accuracy finite, positive and at most this threshold); the once-guard
 * latches only on that real centering. Recorded as a constant so the
 * threshold is tunable at review. */
export const MAX_CENTERING_ACCURACY_M = 500;

/** The GeolocationOptions for the watch: high accuracy is requested because
 * a street-level tram view is the point; the browser still decides what it
 * grants. Timeouts are left to the browser's defaults - the error handler
 * below covers whatever the browser reports. */
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
};

/** Half the dot's 14x14 icon box: the icon anchor is this offset, so the
 * dot body's center sits exactly on the fix (see the icon options below). */
const DOT_HALF_PX = 7;

export class UserLocationLayer {
  /** The dot's marker, created up front but never added to the map until
   * the first fix with usable coordinates arrives (requirement 1: the
   * default view until then - the dot does not exist before that; its
   * [0,0] construction position is a placeholder that never renders
   * because setLatLng lands it on the fix before any add). */
  private readonly marker: L.Marker;
  /** The accuracy ring around the dot: radius in plain meters, Leaflet
   * sizes it to the viewport. Non-interactive so it never blocks a click
   * (requirement 6). Removed again by any fix without a usable accuracy
   * number (requirement 5: a stale ring would lie about precision). */
  private readonly accuracyCircle: L.Circle;
  /** The browser's watch id while a watch runs, else null. */
  private watchId: number | null = null;
  /** The callback the dot's click fires (wired by MapView). Null until
   * setOnRecenter is called; a click before wiring is a no-op (MapView
   * wires it immediately after construction, inside the same effect). */
  private onRecenter: (() => void) | null = null;
  /** The latest fix, held so the re-center click re-centers on the CURRENT
   * position (not the first one). Null until the first fix. */
  private latestFix: { lat: number; lon: number } | null = null;
  /** The one-time centering has happened. Latched ONLY by the real
   * centering on the first fully usable fix (requirement 2): every
   * unusable fix before one leaves centering available. Once latched, no
   * later fix touches the viewport. */
  private centered = false;
  /** True while this layer owns a live watch, so a fix/error that races
   * stop() draws nothing and logs nothing (the layer is dead). */
  private watching = false;
  /** One console.info per distinct situation (requirement 5's honesty
   * note): the coarse-fix message fires once per layer instance, on the
   * FIRST fix that is too coarse (or carries no accuracy number) - whether
   * that is before or after the centering latch - never once per fix. */
  private loggedCoarse = false;
  /** One console.info per outage (the metro stream's once-per-outage
   * semantics, useTramPositions.ts): the transient-error message fires
   * once per error state and resets when a fix with real coordinates
   * arrives, so a healthy fix between two outages starts a new one that
   * logs once again. PERMISSION_DENIED keeps its one-shot behavior. */
  private transientLogged = false;

  constructor(private readonly map: L.Map) {
    this.marker = L.marker([0, 0], {
      icon: L.divIcon({
        className: "user-location",
        html: '<span class="user-location__dot"></span>',
        // Leaflet sizes the icon element to this and positions it so the
        // anchor (the icon box's center) sits on the fix; the dot body is
        // exactly that box, so the dot is centered on the fix and the
        // pulse ring, drawn outside it, is not clipped by Leaflet (div
        // icons carry no overflow clipping).
        iconSize: [DOT_HALF_PX * 2, DOT_HALF_PX * 2],
        iconAnchor: [DOT_HALF_PX, DOT_HALF_PX],
      }),
      // The dot IS the re-center button (requirement 3); everything else
      // about it is display-only.
      interactive: true,
      keyboard: false,
    });
    this.accuracyCircle = L.circle([0, 0], {
      radius: 0,
      // TV-0030 requirement 6: the ring is display-only - clicks pass
      // through to the map, the tram markers and the dot.
      interactive: false,
      // The ring's look is the .user-location-accuracy class in
      // src/index.css (Leaflet vector layers take `className`).
      className: "user-location-accuracy",
    });
    // Bind the re-center click ONCE at construction: a real Leaflet
    // 'click' on the marker (interactive markers get Leaflet's own event
    // plumbing for pointer and keyboard). stopPropagation keeps the click
    // from bubbling to the map container, so the click belongs to the dot
    // only (the tram markers' pattern: marker.on('click') +
    // stopPropagation).
    this.marker.on("click", (event: L.LeafletMouseEvent) => {
      event.originalEvent.stopPropagation();
      this.onRecenter?.();
    });
  }

  /** Starts the watch. The browser's permission prompt fires when the
   * watch starts; the app never blocks on it (this runs inside the map
   * effect, after the map already rendered; the view stays on Helsinki
   * until a usable fix says otherwise). Idempotent: a start() while a
   * watch runs is a no-op - overwriting this.watchId would leak the
   * first watch (its callbacks would keep firing past stop()). */
  start(): void {
    // No geolocation at all (insecure origin, unsupported browser): the
    // feature silently does nothing - no throw, no broken map (requirement
    // 1). navigator.geolocation is a secure-context-only API; localhost
    // and the HTTPS deployment both expose it.
    const geo = navigator.geolocation;
    if (geo === undefined) {
      return;
    }
    if (this.watchId !== null) {
      return;
    }
    this.watching = true;
    this.watchId = geo.watchPosition(
      (position) => {
        this.handleFix(position);
      },
      (error) => {
        this.handleError(error);
      },
      WATCH_OPTIONS,
    );
  }

  /** Stops the watch and removes the dot and the ring from the map; called
   * when the map itself is torn down (also when the vehicle overview page
   * unmounts the map page). Stopping the watch is the whole unmount story:
   * nothing persisted - the next session asks again per the browser's own
   * memory (requirement 4). Safe to call twice: clearWatch runs once
   * (this.watchId is nulled) and the layer removes are no-ops on
   * already-removed layers. */
  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.watching = false;
    this.marker.remove();
    this.accuracyCircle.remove();
  }

  /** Wires the re-center callback (MapView passes one that centers the map
   * on the current fix). Called once after construction; a click on the
   * dot before wiring is a no-op. */
  setOnRecenter(callback: () => void): void {
    this.onRecenter = callback;
  }

  /** The current fix, for the re-center click's target (MapView reads this
   * in its setOnRecenter callback). Null until the first fix with usable
   * coordinates. */
  currentFix(): { lat: number; lon: number } | null {
    return this.latestFix;
  }

  private handleFix(position: GeolocationPosition): void {
    // A fix that raced stop(): the layer is dead, draw nothing.
    if (!this.watching) return;
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    // Usable coordinates are the fix's real content: only a finite
    // lat/lon moves the dot. A usable ACCURACY (finite and positive) is
    // what draws the ring and gates the centering - the two are checked
    // separately so an accuracy failure never hides a real position.
    const coordsUsable = Number.isFinite(lat) && Number.isFinite(lon);
    if (!coordsUsable) {
      // A fix with unusable coordinates changes nothing about what is
      // known: the dot and the ring keep their last real state and the
      // fix is dropped (a NaN position has no honest render). The
      // outage note is NOT reset - the position stream is still broken.
      return;
    }

    // From here the fix carries real coordinates: the position stream is
    // working again, so end the current error outage (a later outage
    // logs once again - the geolocation mirror of the metro stream's
    // once-per-outage ref in useTramPositions.ts).
    this.transientLogged = false;
    this.latestFix = { lat, lon };

    // Every fix with real coordinates moves the dot, whether or not it
    // is on the map yet: setLatLng stores the position before a first
    // add, so the [0,0] construction placeholder never renders and the
    // first add lands the dot exactly on its fix (requirement 2's
    // tracking; the user pans the map, the dot still follows).
    this.marker.setLatLng([lat, lon]);
    if (!this.map.hasLayer(this.marker)) {
      this.marker.addTo(this.map);
    }

    // The ring shows only when the browser reported a usable accuracy
    // number (requirement 5: no number, no ring - a zero-radius ring
    // would be a lie about precision too). The state update happens even
    // while the circle is off the map, so the next add redraws at the
    // right place and radius.
    const accuracyUsable = Number.isFinite(accuracy) && accuracy > 0;
    if (accuracyUsable) {
      this.accuracyCircle.setLatLng([lat, lon]);
      this.accuracyCircle.setRadius(accuracy);
      if (!this.map.hasLayer(this.accuracyCircle)) {
        this.accuracyCircle.addTo(this.map);
      }
    } else {
      // A fix without a usable accuracy number (missing, NaN,
      // non-positive) REMOVES the ring: the dot keeps its real position,
      // but the precision is unknown - a stale ring would lie about it.
      // The ring stays removed until a fix with a usable accuracy number
      // arrives.
      this.accuracyCircle.remove();
    }

    const centeringFix = accuracyUsable && accuracy <= MAX_CENTERING_ACCURACY_M;
    if (centeringFix && !this.centered) {
      // The ONE centering: the first fully usable fix (real coordinates,
      // finite positive accuracy at most the threshold) centers the map
      // at the tram view's default zoom - and ONLY a real centering
      // latches the once-guard (requirement 2): every unusable fix
      // before one leaves centering available for the next fix. Later
      // fixes leave the viewport alone (the user pans, the app never
      // fights it).
      this.centered = true;
      this.map.setView([lat, lon], DEFAULT_MAP_ZOOM);
    } else if (!accuracyUsable || accuracy > MAX_CENTERING_ACCURACY_M) {
      // Requirement 5's honesty note: a fix too coarse to have centered
      // the map on (or one with no accuracy number at all) gets one
      // console.info saying so - whether the map is still waiting for
      // its first centering or already centered by an earlier fix. The
      // map keeps whatever view it has.
      this.logCoarseOnce(accuracy, accuracyUsable);
    }
  }

  /** The one-time console.info for a fix the map did not (or could not)
   * center on: says the accuracy and the threshold, or that no accuracy
   * number came with the fix, and that the dot still tracks. Fires once
   * per layer instance, on the first such fix (before or after the
   * centering latch), never once per fix. */
  private logCoarseOnce(accuracy: number, usableAccuracy: boolean): void {
    if (this.loggedCoarse) return;
    this.loggedCoarse = true;
    console.info(
      usableAccuracy
        ? `[tram-view] location fix accuracy ${Math.round(accuracy)} m is coarser than the ${MAX_CENTERING_ACCURACY_M} m centering threshold - the map is not centered on it; the dot still tracks`
        : "[tram-view] location fix carried no accuracy - the map is not centered on it; the dot still tracks",
    );
  }

  private handleError(error: GeolocationPositionError): void {
    // An error that raced stop(): the layer is dead, log nothing.
    if (!this.watching) return;
    if (error.code === error.PERMISSION_DENIED) {
      // Terminal for this feature on most browsers: stop the watch (it
      // would otherwise keep running for a permission it will not get) and
      // leave the map on the default view. One console.info, no re-prompt
      // loop.
      console.info(
        "[tram-view] location permission denied - the you-are-here dot is off for this session; the map keeps the default view",
      );
      this.stop();
      return;
    }
    // POSITION_UNAVAILABLE and TIMEOUT (and any unknown code): transient -
    // a fix may still arrive, so the watch stays. One console.info per
    // OUTAGE, not per event: the flag set here resets on the next fix
    // with real coordinates, so a healthy fix between two outages starts
    // a new outage that logs once again (the metro stream's
    // once-per-outage semantics; requirement 1: the map never breaks).
    if (this.transientLogged) return;
    this.transientLogged = true;
    console.info(
      "[tram-view] location fix unavailable (code",
      error.code,
      ") - the watch continues",
    );
  }
}
