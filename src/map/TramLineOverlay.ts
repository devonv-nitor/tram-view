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
 * The overlay's visibility is user-toggleable since 2026-10-12 (TV-0019
 * requirement 9, superseding the always-on clause below): `setEnabled`
 * hides and shows the pane while the polylines stay in it - nothing is
 * removed or rebuilt, so toggling cannot change the draw order or the
 * stacking. The geometry request policy is unchanged: one request per
 * session, fired when the map page mounts, regardless of the toggle state.
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
  METRO_LINE_COLOR,
  TRAM_LINE_CASING_COLOR,
  TRAM_LINE_COLOR,
  TRAM_OVERLAY_PANE,
  TRAM_OVERLAY_PANE_Z_INDEX,
  tramLineWidths,
} from "./constants";

export class TramLineOverlay {
  private readonly casingPolylines: L.Polyline[] = [];
  private readonly greenPolylines: L.Polyline[] = [];
  private readonly metroPolylines: L.Polyline[] = [];
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

  /** Draws every returned pattern in two passes: first every casing
   * polyline over all routes/patterns, then every colored polyline, so the
   * colored lines sit above every casing within the pane - Leaflet's SVG
   * renderer paints later-inserted paths over earlier ones and does not
   * reorder, so interleaving per pattern would let a later pattern's white
   * casing cover an earlier pattern's colored line wherever the two overlap.
   * One polyline per (route, directionId) pattern, every coordinate the API
   * reports, nothing simplified; a pattern with no coordinates draws
   * nothing (there is nothing to drop). A fresh options object per polyline:
   * Leaflet's setStyle merges into `layer.options` on first style change, so
   * no shared object is ever mutated across polylines.
   * TV-0029: the metro routes (SUBWAY, the query's widened scope) draw in
   * the same pane with the metro line orange under the same white casing -
   * the casing list is shared, so a metro casing sits under every colored
   * line exactly as a tram casing does; the colored lists are per mode so
   * zoom-end re-styles each at its own width (the same width table, so the
   * metro corridor reads at the same weight as the tram network). */
  private draw(routes: TramRouteGeometry[]): void {
    const width = tramLineWidths(this.map.getZoom());
    const tram: [number, number][][] = [];
    const metro: [number, number][][] = [];
    for (const route of routes) {
      const target = route.mode === "SUBWAY" ? metro : tram;
      for (const pattern of route.patterns) {
        if (pattern.coordinates.length === 0) continue;
        target.push(
          pattern.coordinates.map(
            (coordinate) =>
              [coordinate.lat, coordinate.lon] as [number, number],
          ),
        );
      }
    }
    for (const points of [...tram, ...metro]) {
      this.casingPolylines.push(
        L.polyline(points, {
          pane: TRAM_OVERLAY_PANE,
          interactive: false,
          color: TRAM_LINE_CASING_COLOR,
          weight: width.casing,
        }).addTo(this.map),
      );
    }
    for (const points of tram) {
      this.greenPolylines.push(
        L.polyline(points, {
          pane: TRAM_OVERLAY_PANE,
          interactive: false,
          color: TRAM_LINE_COLOR,
          weight: width.line,
        }).addTo(this.map),
      );
    }
    for (const points of metro) {
      this.metroPolylines.push(
        L.polyline(points, {
          pane: TRAM_OVERLAY_PANE,
          interactive: false,
          color: METRO_LINE_COLOR,
          weight: width.line,
        }).addTo(this.map),
      );
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
    for (const polyline of this.metroPolylines) {
      polyline.setStyle({ weight: width.line });
    }
  }

  /** Sets the overlay's visibility (TV-0019 requirement 9's toggle). The
   * pane's `visibility` style is the off switch: the polylines stay in the
   * pane in the DOM - nothing is removed or rebuilt - so toggling cannot
   * disturb the draw order, the casing-then-green ordering, or the pane's
   * z-order, and a re-enable is instant with no redraw work. Zoom-end
   * width updates while hidden are harmless (the pane is not painted). */
  setEnabled(enabled: boolean): void {
    const pane = this.map.getPane(TRAM_OVERLAY_PANE);
    if (pane) {
      pane.style.visibility = enabled ? "" : "hidden";
    }
  }

  /** Removes every polyline and the pane; called when the map itself is
   * torn down (also on navigating to the vehicle page, which unmounts the
   * map page). A late geometry resolution after dispose draws nothing. */
  dispose(): void {
    this.disposed = true;
    this.map.off("zoomend", this.onZoomEnd, this);
    for (const polyline of [
      ...this.casingPolylines,
      ...this.greenPolylines,
      ...this.metroPolylines,
    ]) {
      polyline.remove();
    }
    this.casingPolylines.length = 0;
    this.greenPolylines.length = 0;
    this.metroPolylines.length = 0;
    this.map.getPane(TRAM_OVERLAY_PANE)?.remove();
  }
}
