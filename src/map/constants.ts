/**
 * Shared map configuration for the Helsinki tram network view.
 * Center/zoom chosen as the starting point for the HSL tram network core
 * (see Docs/ADR/0001-map-library.md); TV-0005 reads these constants.
 */

/** Center of the Helsinki tram network core (Rautatientori area). */
export const HELSINKI_TRAM_NETWORK_CENTER: [number, number] = [
  60.1706, 24.9418,
];

/** Default zoom level showing the core tram network. */
export const DEFAULT_MAP_ZOOM = 13;

/** Lowest zoom level that still shows useful network context. */
export const MIN_MAP_ZOOM = 11;

/**
 * Highest zoom level the map allows. The basemap is asked for at
 * `MAX_MAP_ZOOM - 1` (TV-0018) because of the 512 px tile mapping below, and
 * the HSL raster service stops adding detail above URL zoom 18 (measured
 * 2026-09-25: MAD 5.5 at z17 vs z16, then 1.6 / 0.9 / 1.1 at z19 / z20 / z21
 * against the upscaled parent tile), so zoom 19 never requests an overzoomed
 * tile.
 */
export const MAX_MAP_ZOOM = 19;

/**
 * Digitransit Map API background map, source `hsl-map`: 512 px raster tiles in
 * HSL's own generic style, which draws no transit routes or stops (TV-0018,
 * Docs/ADR/0001-map-library.md amendment). Requested with
 * VITE_DIGITRANSIT_API_KEY appended by mapTileUrl() below; the digitransit
 * subscription key is required (docs "Background map"). `{r}` is Leaflet's
 * retina placeholder: `@2x` (1024 px) on retina displays, empty otherwise.
 */
export const MAP_TILE_URL =
  "https://cdn.digitransit.fi/map/v3/hsl-map/{z}/{x}/{y}{r}.png";

/**
 * `hsl-map` renders each tile of the shared xyz grid at 512 px, so Leaflet
 * must draw it at 512 and ask for the tile one zoom below the map zoom
 * (verified 2026-09-25: a 512 px tile at z/x/y is pixel-identical, MAD 0.11,
 * to the 2x2 mosaic of the 256 px source at z+1). `tileSize: 512` with
 * `zoomOffset: 0` would draw the basemap at double scale.
 */
export const MAP_TILE_TILE_SIZE = 512;
export const MAP_TILE_ZOOM_OFFSET = -1;

/** Attribution for the HSL basemap tiles: OpenStreetMap data, rendered and
 * served by Digitransit/HSL (source and terms: Docs/digitransit.md). */
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &middot; &copy; <a href="https://digitransit.fi" target="_blank" rel="noreferrer">Digitransit</a> / HSL';

/**
 * The tile URL carries the digitransit subscription key as a query parameter
 * (a Leaflet <img> cannot send headers). The key is public on the deployed
 * site by policy (Docs/ADR/0003-public-api-key-policy.md) and is never logged.
 */
export function mapTileUrl(subscriptionKey: string): string {
  return `${MAP_TILE_URL}?digitransit-subscription-key=${encodeURIComponent(subscriptionKey)}`;
}

/**
 * TV-0019 (ADR-0001 overlay amendment): the tram line overlay's own Leaflet
 * pane. The pane's z-index sits between `tilePane` (200) and `markerPane`
 * (600), so the overlay draws above the basemap and below the tram markers;
 * the pane is non-interactive, so markers, popups and the status panel stay
 * on top and clickable. `createPane("tramLineOverlay")` gives the div the
 * class `leaflet-tramLineOverlay-pane`.
 */
export const TRAM_OVERLAY_PANE = "tramLineOverlay";
export const TRAM_OVERLAY_PANE_Z_INDEX = 350;

/** HSL tram green, the color HSL's own products render tram routes with
 * (ADR-0001 overlay amendment). */
export const TRAM_LINE_COLOR = "#00985F";

/** The casing color under the green line. Leaflet has no casing option, so
 * HSL's tram rendering (a wider white polyline under a narrower green one)
 * is two polylines per pattern, ordered by draw order within the pane. */
export const TRAM_LINE_CASING_COLOR = "#FFFFFF";

/**
 * TV-0019: the overlay's per-zoom polyline widths, stated per the amendment.
 * One entry per zoom level; the first whose `maxZoom` is >= the map zoom
 * wins, the last entry covers the rest. The casing is the wider white line;
 * the green line is drawn on top, ~2 px narrower at every zoom. The z11-13
 * entries stay modest so the casing does not get heavy under the ~150 live
 * markers at the network-overview zooms: at z11-13 the casing is 4-5 px
 * against a 28 px marker body. The widths were verified to apply per zoom in
 * the DOM (Tasks/TV-0019-tram-line-overlay.md); the amendment's
 * documented-deviation escape (dropping the casing at z11-13) was not
 * needed.
 */
const TRAM_LINE_WIDTHS: readonly {
  maxZoom: number;
  casing: number;
  line: number;
}[] = [
  { maxZoom: 12, casing: 4, line: 2 },
  { maxZoom: 13, casing: 5, line: 2.5 },
  { maxZoom: 14, casing: 6, line: 3 },
  { maxZoom: 15, casing: 7, line: 3.5 },
  { maxZoom: 16, casing: 8, line: 4 },
  { maxZoom: 17, casing: 9, line: 4.5 },
  { maxZoom: 18, casing: 10, line: 5 },
  { maxZoom: 19, casing: 11, line: 5.5 },
];

/** The overlay's casing and green-line widths at one zoom level. */
export function tramLineWidths(zoom: number): {
  casing: number;
  line: number;
} {
  for (const entry of TRAM_LINE_WIDTHS) {
    if (zoom <= entry.maxZoom) {
      return { casing: entry.casing, line: entry.line };
    }
  }
  const last = TRAM_LINE_WIDTHS[TRAM_LINE_WIDTHS.length - 1];
  return { casing: last.casing, line: last.line };
}
