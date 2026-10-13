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
 * Centering (requirement 2): the FIRST fix with accuracy <= 500 m centers
 * the map on the user at DEFAULT_MAP_ZOOM exactly once per session; later
 * fixes never touch the viewport (tracking keeps the marker moving, the
 * user keeps the pan). A first fix coarser than 500 m shows the marker but
 * does NOT center - one console.info records why (requirement 5's honesty
 * note; a later fix that is still too coarse logs its one-time note too -
 * the map may still be sitting un-centered from that same coarse first
 * fix). Clicking the dot is the one user-initiated re-center (requirement
 * 3): it always re-centers on the CURRENT fix (idempotent when already
 * centered) via setOnRecenter's callback.
 */
import L from "leaflet";
import { DEFAULT_MAP_ZOOM } from "./constants";

/** TV-0030 requirement 2: a fix coarser than this (meters) - or one with
 * no accuracy number - shows the dot but does not center the map; one
 * console.info says why (requirement 5's honesty note). The CENTERING
 * decision itself is made on the FIRST fix only; this threshold gates that
 * decision and the one-time honesty note. Recorded as a constant so the
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
  /** The dot's marker, created up front and added to the map only when a
   * first fix arrives (requirement 1: the default view until then). */
  private readonly marker: L.Marker;
  /** The accuracy ring around the dot: radius in plain meters, Leaflet
   * sizes it to the viewport. Non-interactive so it never blocks a click
   * (requirement 6). */
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
  /** The one-time centering has happened (or been decided against for a
   * coarse first fix) - later fixes never touch the viewport. */
  private centered = false;
  /** True while this layer owns a live watch, so a fix/error that races
   * stop() draws nothing and logs nothing (the layer is dead). */
  private watching = false;
  /** One console.info per distinct situation (requirement 5's honesty
   * note): the coarse-fix message fires once per layer instance, on the
   * FIRST fix that is too coarse (or carries no accuracy number) - whether
   * that is the first fix of the session or a later one - never once per
   * fix. */
  private loggedCoarse = false;

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
   * until a usable fix says otherwise). */
  start(): void {
    // No geolocation at all (insecure origin, unsupported browser): the
    // feature silently does nothing - no throw, no broken map (requirement
    // 1). navigator.geolocation is a secure-context-only API; localhost
    // and the HTTPS deployment both expose it.
    const geo = navigator.geolocation;
    if (geo === undefined) {
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
   * memory (requirement 4). */
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
   * in its setOnRecenter callback). Null until the first fix. */
  currentFix(): { lat: number; lon: number } | null {
    return this.latestFix;
  }

  private handleFix(position: GeolocationPosition): void {
    // A fix that raced stop(): the layer is dead, draw nothing.
    if (!this.watching) return;
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    this.latestFix = { lat, lon };

    // The ring shows only when the browser reported a usable accuracy
    // number (requirement 5: no number, no ring - the dot alone; a
    // zero-radius ring would be a lie about precision too).
    const usableAccuracy = Number.isFinite(accuracy) && accuracy > 0;
    if (usableAccuracy) {
      this.accuracyCircle.setLatLng([lat, lon]);
      this.accuracyCircle.setRadius(accuracy);
      if (!this.map.hasLayer(this.accuracyCircle)) {
        this.accuracyCircle.addTo(this.map);
      }
    }

    if (!this.centered) {
      // The FIRST fix: the one centering decision per session (requirement
      // 2), and the dot's first appearance.
      this.centered = true;
      this.marker.addTo(this.map);
      if (usableAccuracy && accuracy <= MAX_CENTERING_ACCURACY_M) {
        // The ONE centering: the first usable fix centers the map at the
        // tram view's default zoom. Every later fix leaves the viewport
        // alone (requirement 2 - the user pans, the app never fights it).
        this.map.setView([lat, lon], DEFAULT_MAP_ZOOM);
      } else {
        // Requirement 5's honesty note: a first fix too coarse to have
        // centered the map on (or one with no accuracy number at all)
        // gets one console.info saying so - and does NOT center. The map
        // keeps whatever view it has (the default Helsinki view in the
        // normal first-fix case).
        this.logCoarseOnce(accuracy, usableAccuracy);
      }
      return;
    }

    // Subsequent fixes: move the dot (and the ring) in place; the viewport
    // is never touched here. A later fix coarser than the threshold logs
    // its one-time honesty note too (the first such fix), because the map
    // may still be sitting un-centered from that same coarse first fix.
    if (!usableAccuracy || accuracy > MAX_CENTERING_ACCURACY_M) {
      this.logCoarseOnce(accuracy, usableAccuracy);
    }
  }

  /** The one-time console.info for a fix the map did not (or could not)
   * center on: says the accuracy and the threshold, or that no accuracy
   * number came with the fix, and that the dot still tracks. Fires once
   * per layer instance, on the first such fix, never once per fix. */
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
    // event, never escalated (requirement 1: the map never breaks).
    console.info(
      "[tram-view] location fix unavailable (code",
      error.code,
      ") - the watch continues",
    );
  }
}
