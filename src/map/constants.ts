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

/** Highest zoom level supported by OpenStreetMap raster tiles. */
export const MAX_MAP_ZOOM = 19;

/**
 * Key-free OpenStreetMap raster tiles. Usage must follow the OSM tile usage
 * policy: https://operations.osmfoundation.org/policies/tiles/
 */
export const MAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Attribution required by the OpenStreetMap tile usage policy. */
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
