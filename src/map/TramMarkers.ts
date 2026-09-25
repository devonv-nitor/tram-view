/**
 * Imperative Leaflet marker layer for live tram markers (TV-0005, TV-0008,
 * TV-0009, TV-0011, TV-0013, TV-0016).
 * One directional marker per vehicle: a teardrop body with the line short
 * name inside, colored by the vehicle's rolling stock category, rotated so
 * its point faces the vehicle's reported heading, and carrying a native
 * `title` tooltip with the full model name. A vehicle whose latest position
 * resolves to no displayed tram line (TV-0011: depot shunting/testing,
 * absent routes; TV-0022: an HFP route id that is not a GTFS route id *and*
 * no live trip reported for the vehicle - so a variant-suffixed id such as
 * `1001H6` shows its line instead of a dot) keeps the category-colored body
 * and heading rotation and shows a red not-in-service dot in place of the
 * line number. The marker layer consumes `routeShortName` only: which source
 * resolved it is the hooks' and the popup's business, never this file's.
 * TV-0016: clicking/tapping a marker body opens a Leaflet popup bound to
 * the marker - it follows the tram, refreshes its debug readout (every
 * input to the red-dot decision) on every snapshot in the same per-marker
 * pass, closes when the vehicle drops from the snapshot, and shows one
 * popup at a time (src/map/TramMarkerPopup.ts builds the content; the
 * rendering decisions never consult it).
 * Direction source and live evidence (Tasks/TV-0008-tram-direction.md): the
 * HFP `hdg` field the payload already carries - verified live to match the
 * direction of travel and to persist for stopped vehicles - so no extra
 * request is made (Docs/ADR/0002-data-transport.md). The heading is always
 * the vehicle's physical pointing, even at a terminal layover where the
 * journey direction (`dir`) disagrees: the point shows where the tram
 * faces, never the journey direction.
 * Category source and live evidence (Tasks/TV-0009-tram-type.md): neither
 * the HFP VP payload nor the keyed GraphQL metadata carries a model/subtype
 * field, so the category comes from the vehicle number the client already
 * parses (src/lib/fleet.ts) - no extra request. The color encoding is CSS
 * keyed to a per-category modifier class (src/index.css), so TV-0008's
 * teardrop shape and direction behavior are unchanged.
 * Marker positions are updated in place on the existing marker elements -
 * React re-renders the panel, never the marker DOM - and markers are
 * created/removed as vehicles enter and leave the filtered feed.
 */
import L from "leaflet";
import type { TramPosition } from "../lib/digitransit.ts";
import {
  isSparakoffBarTram,
  SPARAKOFF_MARKER_LETTER,
  tramCategoryInfo,
  type TramCategoryInfo,
} from "../lib/fleet.ts";
import { vehicleKey } from "../lib/hfp.ts";
import { buildTramDebugHtml } from "./TramMarkerPopup.ts";

/** Marker body diameter in px; the line label sits centered inside the
 * rounded body and the teardrop point extends beyond it in the heading
 * direction (shape CSS: .tram-marker__shape in src/index.css). */
const TRAM_MARKER_PX = 28;
/** iconAnchor at half the size keeps the marker body centered on the
 * vehicle position; only the point leads forward. */
const TRAM_MARKER_CENTER: [number, number] = [
  TRAM_MARKER_PX / 2,
  TRAM_MARKER_PX / 2,
];

/** Normalizes a heading to 0-359 degrees clockwise from north (the feed
 * occasionally sends 360, which is due north again). Null stays null: the
 * vehicle reported no heading, so no direction is shown or faked. */
function normalizeHeading(heading: number | null): number | null {
  if (heading === null) return null;
  return ((heading % 360) + 360) % 360;
}

/** Body-color class slug for one vehicle: the SpåraKoff special case
 * (TV-0013) wins over the TV-0009 category for car #175 only; every other
 * number keeps its plain CATEGORY_RANGES lookup. */
function markerSlug(position: TramPosition, info: TramCategoryInfo): string {
  return isSparakoffBarTram(position)
    ? "sparakoff"
    : info.category.toLowerCase();
}

/** Line-number text for one vehicle's label: the SpåraKoff letter (TV-0013)
 * in place of the line number, unconditionally - also when the route resolves
 * to no line, where every other vehicle shows the TV-0011 red dot. */
function markerLabel(position: TramPosition): string {
  return isSparakoffBarTram(position)
    ? SPARAKOFF_MARKER_LETTER
    : (position.routeShortName ?? "");
}

/** Builds the icon for one vehicle position: the directional teardrop
 * (TV-0008), a category color modifier class (TV-0009; colors live in
 * src/index.css), and the native `title` tooltip with the full model name.
 * A rotor div carries an inline rotation to the vehicle heading - degrees map
 * directly to CSS rotation because the map is north-up - and wraps the
 * teardrop shape. The label is a sibling outside the rotor, so the number
 * stays upright and readable at any heading. A null heading renders the
 * rotor unrotated and hides the point (CSS: .tram-marker--headingless),
 * leaving the plain TV-0005 circle. Labels are tram line short names
 * already validated by isTramLineShortName (digits 1-15 with an optional
 * trailing letter, or a single letter), so they are safe as icon HTML.
 * An out-of-service vehicle (routeShortName null, TV-0011) keeps the
 * category-colored body and heading rotation and swaps the line label for
 * the red not-in-service dot (CSS: .tram-marker--offline); the label span
 * stays in the DOM, hidden, so the flip in either direction is one class
 * toggle. The native `title` tooltip (TV-0009) is passed as a marker option -
 * Leaflet sets it on the icon element (Marker._initIcon) - so it is the
 * native browser tooltip on hover: hover reaches the icon because the
 * marker CSS re-enables pointer events that Leaflet disables for
 * non-interactive icons (src/index.css), and it stays out of the a11y
 * tree. */
function createTramIcon(
  position: TramPosition,
  info: TramCategoryInfo,
): L.DivIcon {
  const headingless = position.heading === null;
  // TV-0013: the SpåraKoff bar tram always shows its own letter and color -
  // never the TV-0011 red dot, even when its route resolves to no line.
  const barTram = isSparakoffBarTram(position);
  const offline = position.routeShortName === null && !barTram;
  const className = `tram-marker tram-marker--${markerSlug(position, info)}${headingless ? " tram-marker--headingless" : ""}${offline ? " tram-marker--offline" : ""}`;
  const rotation = headingless
    ? ""
    : ` style="transform: rotate(${normalizeHeading(position.heading)}deg)"`;
  return L.divIcon({
    className,
    html: `<div class="tram-marker__rotor"${rotation}><div class="tram-marker__shape"></div></div><span class="tram-marker__label">${markerLabel(position)}</span><span class="tram-marker__dot"></span>`,
    iconSize: [TRAM_MARKER_PX, TRAM_MARKER_PX],
    iconAnchor: TRAM_MARKER_CENTER,
  });
}

/** Tooltip text for one vehicle: the full model name (TV-0009). Unknown
 * types say so explicitly and name the vehicle number instead of a model.
 * Out-of-service vehicles (TV-0011) replace the "Line N" prefix with a
 * "not in service" hint and keep the model name. No tooltip carries the
 * internal category letter (TV-0014) - including the SpåraKoff bar tram
 * (TV-0013), identified by name with the same line prefix; the ranges'
 * category A it does not belong to is an internal detail. */
function tooltipText(position: TramPosition, info: TramCategoryInfo): string {
  if (isSparakoffBarTram(position)) {
    const line =
      position.routeShortName === null
        ? "Not in service"
        : `Line ${position.routeShortName}`;
    return `${line} — SpåraKoff (bar tram)`;
  }
  const line =
    position.routeShortName === null
      ? "Not in service"
      : `Line ${position.routeShortName}`;
  return info.model === null
    ? `${line} — Unknown tram type (vehicle ${position.vehicleNumber})`
    : `${line} — ${info.model}`;
}

export class TramMarkerLayer {
  private readonly markers = new Map<string, L.Marker>();
  /** TV-0016: the latest snapshot position per vehicle, kept so the popup
   * can be rebuilt from the current state on click and refreshed on every
   * snapshot. Read-only debug state - the popup never mutates it, and the
   * rendering decisions keep using the update() argument alone. */
  private readonly latestPositions = new Map<string, TramPosition>();

  constructor(private readonly map: L.Map) {
    // The markers show line numbers only; the data itself is surfaced in the
    // status panel, so keep ~150 per-second text nodes out of the a11y tree.
    map.getPane("markerPane")?.setAttribute("aria-hidden", "true");
  }

  /** Syncs the layer to one snapshot: moves existing markers in place, adds
   * vehicles new to the feed, removes vehicles that disappeared, and
   * refreshes the icon (heading rotation and label) of vehicles that
   * changed. TV-0016: the open popup's debug readout refreshes in the same
   * per-marker pass - no second render path. */
  update(positions: TramPosition[]): void {
    const present = new Set<string>();
    for (const position of positions) {
      const key = vehicleKey(position);
      present.add(key);
      const marker = this.markers.get(key);
      if (marker === undefined) {
        const info = tramCategoryInfo(position.vehicleNumber);
        const created = L.marker([position.lat, position.lon], {
          icon: createTramIcon(position, info),
          // TV-0009: full model name per vehicle, one hover away; Leaflet
          // applies it to the icon element as the native tooltip.
          title: tooltipText(position, info),
          // Display-only markers; panning and zooming stay with the map.
          interactive: false,
          keyboard: false,
        }).addTo(this.map);
        this.bindDebugPopup(key, created, position);
        this.markers.set(key, created);
      } else {
        marker.setLatLng([position.lat, position.lon]);
        this.syncIcon(marker, position);
        // TV-0016: the tram keeps moving, so stale debug info is worse than
        // none - refresh the open popup's readout with this snapshot in the
        // same per-marker pass. Markers move via setLatLng, which Leaflet's
        // bindPopup hooks ('move' event) to keep the popup anchored to the
        // marker, not to a map point.
        if (marker.isPopupOpen()) {
          marker.setPopupContent(buildTramDebugHtml(position));
        }
      }
      this.latestPositions.set(key, position);
    }
    for (const [key, marker] of this.markers) {
      if (!present.has(key)) {
        marker.remove();
        this.markers.delete(key);
        this.latestPositions.delete(key);
      }
    }
  }

  /** TV-0016: binds the debug popup to the marker (not a map point) and
   * opens it on a real click/tap on the marker body. Leaflet's own click
   * handling stays off (interactive: false is untouched - the markers keep
   * zero Leaflet event targets); the popup opens from this listener instead,
   * and stopPropagation keeps the click from bubbling to the map container,
   * where the default close-on-map-click would instantly close it. The
   * readout is rebuilt from the latest snapshot at open time, so it is
   * fresh even after the popup sat unopened. */
  private bindDebugPopup(
    key: string,
    marker: L.Marker,
    position: TramPosition,
  ): void {
    marker.bindPopup(buildTramDebugHtml(position));
    marker.getElement()?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.openDebugPopup(key);
    });
  }

  /** TV-0016: opens (or re-targets) the one debug popup for a vehicle.
   * Leaflet's map keeps a single popup: opening one marker's popup closes
   * any other, so clicking a different marker rewrites it. Content is
   * rebuilt first from the latest snapshot; an already-open popup is left
   * open (no close/reopen flicker, no re-pan) - its content refreshes on
   * every snapshot in update(). The popup closes by itself when the vehicle
   * drops from the snapshot: bindPopup closes it on the marker's 'remove'
   * event. */
  private openDebugPopup(key: string): void {
    const marker = this.markers.get(key);
    const position = this.latestPositions.get(key);
    if (marker === undefined || position === undefined) return;
    marker.setPopupContent(buildTramDebugHtml(position));
    if (marker.isPopupOpen()) return;
    marker.openPopup();
  }

  /** Updates one existing marker's icon DOM in place: the rotor rotation
   * when the vehicle's heading changed, and the label when it changed
   * lines. Both writes compare first - ~150 markers sync ~1/s, and only
   * real changes need DOM work. */
  private syncIcon(marker: L.Marker, position: TramPosition): void {
    const element = marker.getElement();
    if (element === undefined) return;
    this.syncCategory(element, position);
    const headingless = position.heading === null;
    const transform = headingless
      ? ""
      : `rotate(${normalizeHeading(position.heading)}deg)`;
    const rotor = element.querySelector<HTMLElement>(".tram-marker__rotor");
    if (rotor !== null && rotor.style.transform !== transform) {
      rotor.style.transform = transform;
      element.classList.toggle("tram-marker--headingless", headingless);
    }
    // TV-0011: the out-of-service flip in either direction (service line <->
    // no line, e.g. a vehicle reporting under both its route and 1009TX) is
    // one class toggle: the label span and the red dot swap visibility in
    // CSS, so no element is created or removed on a flicker. TV-0013: the
    // SpåraKoff bar tram never flips - it shows its letter, not the dot,
    // even when the route resolves to no line.
    const offline =
      position.routeShortName === null && !isSparakoffBarTram(position);
    if (element.classList.contains("tram-marker--offline") !== offline) {
      element.classList.toggle("tram-marker--offline", offline);
    }
    const labelText = markerLabel(position);
    const label = element.querySelector<HTMLElement>(".tram-marker__label");
    if (label !== null && label.textContent !== labelText) {
      label.textContent = labelText;
    }
  }

  /** Keeps the marker's body-color class (TV-0009, TV-0013) and the `title`
   * tooltip in sync with the vehicle's current state. The category and the
   * SpåraKoff identity both derive from the vehicle's oper+veh identity,
   * which is part of the marker key and so never changes for an existing
   * marker - the class effectively settles at creation - but both writes
   * compare first and stay correct if the key or the mapping ever changes. */
  private syncCategory(element: HTMLElement, position: TramPosition): void {
    const info = tramCategoryInfo(position.vehicleNumber);
    const slug = markerSlug(position, info);
    if (!element.classList.contains(`tram-marker--${slug}`)) {
      for (const category of ["a", "b", "c", "unknown", "sparakoff"] as const) {
        element.classList.toggle(`tram-marker--${category}`, category === slug);
      }
    }
    const title = tooltipText(position, info);
    if (element.title !== title) {
      element.title = title;
    }
  }

  /** Removes every marker; called when the map itself is torn down. */
  dispose(): void {
    for (const marker of this.markers.values()) {
      marker.remove();
    }
    this.markers.clear();
    this.latestPositions.clear();
  }
}
