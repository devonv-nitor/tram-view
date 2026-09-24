/**
 * Imperative Leaflet marker layer for live tram markers (TV-0005, TV-0008).
 * One directional marker per vehicle: a teardrop body with the line short
 * name inside, rotated so its point faces the vehicle's reported heading.
 * Direction source and live evidence (Tasks/TV-0008-tram-direction.md): the
 * HFP `hdg` field the payload already carries - verified live to match the
 * direction of travel and to persist for stopped vehicles - so no extra
 * request is made (Docs/ADR/0002-data-transport.md). The heading is always
 * the vehicle's physical pointing, even at a terminal layover where the
 * journey direction (`dir`) disagrees: the point shows where the tram
 * faces, never the journey direction. Marker positions are updated in place
 * on the existing marker elements - React re-renders the panel, never the
 * marker DOM - and markers are created/removed as vehicles enter and leave
 * the filtered feed.
 */
import L from "leaflet";
import type { TramPosition } from "../lib/digitransit.ts";
import { vehicleKey } from "../lib/hfp.ts";

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

/** Builds the directional icon showing the line short name (TV-0008). A
 * rotor div carries an inline rotation to the vehicle heading - degrees map
 * directly to CSS rotation because the map is north-up - and wraps the
 * teardrop shape. The label is a sibling outside the rotor, so the number
 * stays upright and readable at any heading. A null heading renders the
 * rotor unrotated and hides the point (CSS: .tram-marker--headingless),
 * leaving the plain TV-0005 circle. Labels are tram line short names
 * already validated by isTramLineShortName (digits 1-15 with an optional
 * trailing letter, or a single letter), so they are safe as icon HTML. */
function createTramIcon(label: string, heading: number | null): L.DivIcon {
  const className =
    heading === null ? "tram-marker tram-marker--headingless" : "tram-marker";
  const rotation =
    heading === null
      ? ""
      : ` style="transform: rotate(${normalizeHeading(heading)}deg)"`;
  return L.divIcon({
    className,
    html: `<div class="tram-marker__rotor"${rotation}><div class="tram-marker__shape"></div></div><span class="tram-marker__label">${label}</span>`,
    iconSize: [TRAM_MARKER_PX, TRAM_MARKER_PX],
    iconAnchor: TRAM_MARKER_CENTER,
  });
}

export class TramMarkerLayer {
  private readonly markers = new Map<string, L.Marker>();

  constructor(private readonly map: L.Map) {
    // The markers show line numbers only; the data itself is surfaced in the
    // status panel, so keep ~150 per-second text nodes out of the a11y tree.
    map.getPane("markerPane")?.setAttribute("aria-hidden", "true");
  }

  /** Syncs the layer to one snapshot: moves existing markers in place, adds
   * vehicles new to the feed, removes vehicles that disappeared, and
   * refreshes the icon (heading rotation and label) of vehicles that
   * changed. */
  update(positions: TramPosition[]): void {
    const present = new Set<string>();
    for (const position of positions) {
      const key = vehicleKey(position);
      present.add(key);
      const marker = this.markers.get(key);
      if (marker === undefined) {
        this.markers.set(
          key,
          L.marker([position.lat, position.lon], {
            icon: createTramIcon(position.routeShortName, position.heading),
            // Display-only markers; panning and zooming stay with the map.
            interactive: false,
            keyboard: false,
          }).addTo(this.map),
        );
      } else {
        marker.setLatLng([position.lat, position.lon]);
        this.syncIcon(marker, position);
      }
    }
    for (const [key, marker] of this.markers) {
      if (!present.has(key)) {
        marker.remove();
        this.markers.delete(key);
      }
    }
  }

  /** Updates one existing marker's icon DOM in place: the rotor rotation
   * when the vehicle's heading changed, and the label when it changed
   * lines. Both writes compare first - ~150 markers sync ~1/s, and only
   * real changes need DOM work. */
  private syncIcon(marker: L.Marker, position: TramPosition): void {
    const element = marker.getElement();
    if (element === undefined) return;
    const headingless = position.heading === null;
    const transform = headingless
      ? ""
      : `rotate(${normalizeHeading(position.heading)}deg)`;
    const rotor = element.querySelector<HTMLElement>(".tram-marker__rotor");
    if (rotor !== null && rotor.style.transform !== transform) {
      rotor.style.transform = transform;
      element.classList.toggle("tram-marker--headingless", headingless);
    }
    const label = element.querySelector<HTMLElement>(".tram-marker__label");
    if (label !== null && label.textContent !== position.routeShortName) {
      label.textContent = position.routeShortName;
    }
  }

  /** Removes every marker; called when the map itself is torn down. */
  dispose(): void {
    for (const marker of this.markers.values()) {
      marker.remove();
    }
    this.markers.clear();
  }
}
