/**
 * Imperative Leaflet marker layer for live tram markers (TV-0005). One
 * circle marker per vehicle with the line short name inside (Docs/Idea.md:
 * digits 1-15 with an optional trailing letter, e.g. 9N, or a single letter,
 * e.g. H). Marker positions are updated in place on the existing marker
 * elements - React re-renders the panel, never the marker DOM - and markers
 * are created/removed as vehicles enter and leave the filtered feed.
 */
import L from "leaflet";
import type { TramPosition } from "../lib/digitransit.ts";
import { vehicleKey } from "../lib/hfp.ts";

/** Marker diameter in px; the line label sits centered inside the circle. */
const TRAM_MARKER_PX = 28;
/** iconAnchor at half the size centers the circle on the vehicle position. */
const TRAM_MARKER_CENTER: [number, number] = [
  TRAM_MARKER_PX / 2,
  TRAM_MARKER_PX / 2,
];

/** Builds the circle icon showing the line short name. Labels are tram line
 * short names already validated by isTramLineShortName (digits 1-15 with an
 * optional trailing letter, or a single letter), so they are safe as icon
 * HTML. */
function createTramIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: "tram-marker",
    html: label,
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
   * refreshes the label of vehicles that changed lines. */
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
            icon: createTramIcon(position.routeShortName),
            // Display-only markers; panning and zooming stay with the map.
            interactive: false,
            keyboard: false,
          }).addTo(this.map),
        );
      } else {
        marker.setLatLng([position.lat, position.lon]);
        const element = marker.getElement();
        if (
          element !== undefined &&
          element.textContent !== position.routeShortName
        ) {
          element.textContent = position.routeShortName;
        }
      }
    }
    for (const [key, marker] of this.markers) {
      if (!present.has(key)) {
        marker.remove();
        this.markers.delete(key);
      }
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
