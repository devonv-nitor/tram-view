/**
 * Imperative Leaflet layer for the tram line overlay (TV-0019; decision:
 * Docs/ADR/0001-map-library.md overlay amendment). The map page draws the
 * whole tram network as its own layer: one polyline per (route, directionId)
 * pattern the Routing API reports - every pattern, no deduplication into one
 * geometry per displayed short name, no simplification, no coordinate
 * dropping - loaded once per session (`loadTramNetworkGeometry`,
 * src/lib/digitransit.ts) and never rebuilt by marker updates.
 *
 * Stacking and styling are fixed by the amendment. The overlay lives in its
 * own pane between the tile pane (z-index 200) and the marker pane (600), so
 * it draws above the basemap and below the tram markers, and it is
 * non-interactive (`interactive: false` plus `pointer-events: none` on the
 * pane), so it cannot capture clicks that today reach the map or a marker.
 * The style is HSL's own tram route rendering: a wider white casing polyline
 * under a narrower HSL tram green line. Leaflet has no casing option, so the
 * ordering is draw order within the pane: every casing polyline is added
 * first and every green polyline second - the pane holds one shared SVG
 * renderer, where later-added paths paint above earlier ones - so every
 * green line sits above every casing without per-pattern z-index work.
 *
 * The overlay is always on: no toggle, no legend entry, no other UI control.
 * It is created once, when the geometry resolves, and the ~1 Hz marker
 * refresh (TramMarkerLayer.update) never touches the polyline set. The
 * loader is only called with the app's existing key (MapView, like the
 * basemap tile layer), so a keyless session requests nothing and draws no
 * lines; a failed load is logged once and changes nothing on screen - the
 * basemap, markers and status panel keep working as they do today.
 */
import L from "leaflet";
import {
  loadTramNetworkGeometry,
  type TramRouteGeometry,
} from "../lib/digitransit.ts";
import {
  TRAM_LINE_CASING_COLOR,
  TRAM_LINE_COLOR,
  TRAM_OVERLAY_PANE,
  TRAM_OVERLAY_PANE_Z_INDEX,
  tramLineWidths,
} from "./constants";

export class TramLineOverlay {
  private readonly casingPolylines: L.Polyline[] = [];
  private readonly greenPolylines: L.Polyline[] = [];
  private disposed = false;

  constructor(private readonly map: L.Map) {
    // The overlay's own pane, between the tile pane (200) and the marker
    // pane (600): above the basemap, below the markers. Non-interactive and
    // pointer-transparent, so it cannot capture clicks that reach the map or
    // a marker.
    const pane = this.map.createPane(TRAM_OVERLAY_PANE);
    pane.style.zIndex = String(TRAM_OVERLAY_PANE_Z_INDEX);
    pane.style.pointerEvents = "none";
    this.map.on("zoomend", this.onZoomEnd, this);
  }

  /** Loads the geometry once and draws it when it resolves. The loader
   * caches per session, so a fresh overlay after returning from the vehicle
   * page draws from the session cache with no second request (TV-0019
   * requirement 1: one request per session). */
  load(apiKey: string): void {
    void loadTramNetworkGeometry(apiKey)
      .then((routes) => {
        if (this.disposed) return;
        this.draw(routes);
      })
      .catch((cause: unknown) => {
        if (this.disposed) return;
        // The overlay's failure mode is silent (no lines): the map, markers
        // and panel keep working. The failure is logged once - never
        // escalated to the marker pipeline's error handling.
        console.warn(
          "[tram-view] tram line overlay failed:",
          cause instanceof Error ? cause.message : String(cause),
        );
      });
  }

  /** Draws every returned pattern: all casing polylines first, then all
   * green ones, so the green lines sit above every casing within the pane.
   * One polyline per (route, directionId) pattern, every coordinate the API
   * reports, nothing simplified; a pattern with no coordinates draws
   * nothing (there is nothing to drop). A fresh options object per polyline:
   * Leaflet's setStyle merges into `layer.options` on first style change, so
   * no shared object is ever mutated across polylines. */
  private draw(routes: TramRouteGeometry[]): void {
    const width = tramLineWidths(this.map.getZoom());
    for (const route of routes) {
      for (const pattern of route.patterns) {
        if (pattern.coordinates.length === 0) continue;
        const latlngs = pattern.coordinates.map(
          (coordinate) => [coordinate.lat, coordinate.lon] as [number, number],
        );
        this.casingPolylines.push(
          L.polyline(latlngs, {
            pane: TRAM_OVERLAY_PANE,
            interactive: false,
            color: TRAM_LINE_CASING_COLOR,
            weight: width.casing,
          }).addTo(this.map),
        );
        this.greenPolylines.push(
          L.polyline(latlngs, {
            pane: TRAM_OVERLAY_PANE,
            interactive: false,
            color: TRAM_LINE_COLOR,
            weight: width.line,
          }).addTo(this.map),
        );
      }
    }
  }

  /** Applies the per-zoom widths (stated in constants.ts) on zoom end: the
   * zoom animation scales the pane, and the stroke widths catch up when it
   * lands. Only real zoom changes reach this - no per-marker or per-position
   * work ever touches the polylines. */
  private onZoomEnd(): void {
    const width = tramLineWidths(this.map.getZoom());
    for (const polyline of this.casingPolylines) {
      polyline.setStyle({ weight: width.casing });
    }
    for (const polyline of this.greenPolylines) {
      polyline.setStyle({ weight: width.line });
    }
  }

  /** Removes every polyline and the pane; called when the map itself is
   * torn down (also on navigating to the vehicle page, which unmounts the
   * map page). A late geometry resolution after dispose draws nothing. */
  dispose(): void {
    this.disposed = true;
    this.map.off("zoomend", this.onZoomEnd, this);
    for (const polyline of [...this.casingPolylines, ...this.greenPolylines]) {
      polyline.remove();
    }
    this.casingPolylines.length = 0;
    this.greenPolylines.length = 0;
    this.map.getPane(TRAM_OVERLAY_PANE)?.remove();
  }
}
