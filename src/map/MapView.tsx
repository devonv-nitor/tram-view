import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TramPosition } from "../lib/digitransit.ts";
import { tryGetDigitransitApiKey } from "../lib/digitransit.ts";
import { TramMarkerLayer } from "./TramMarkers";
import {
  DEFAULT_MAP_ZOOM,
  HELSINKI_TRAM_NETWORK_CENTER,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_TILE_SIZE,
  MAP_TILE_ZOOM_OFFSET,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  mapTileUrl,
} from "./constants";

/**
 * Full-viewport interactive map of the Helsinki tram network.
 * Basemap per the Docs/ADR/0001-map-library.md amendment: Leaflet + the
 * Digitransit Map API's `hsl-map` tiles (TV-0018), which need the same
 * subscription key as the line-metadata query. Live tram markers (TV-0005)
 * are managed imperatively in TramMarkerLayer, above the basemap.
 */
export default function MapView({ positions }: { positions: TramPosition[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<TramMarkerLayer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const map = L.map(container, {
      center: HELSINKI_TRAM_NETWORK_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      minZoom: MIN_MAP_ZOOM,
      maxZoom: MAX_MAP_ZOOM,
    });

    // Without a key there is no basemap: the tiles are keyed (no fallback to
    // a key-free provider, so the map never silently shows a different style),
    // and the status panel's missing-key error is the explanation.
    const subscriptionKey = tryGetDigitransitApiKey();
    if (subscriptionKey !== null) {
      L.tileLayer(mapTileUrl(subscriptionKey), {
        attribution: MAP_TILE_ATTRIBUTION,
        tileSize: MAP_TILE_TILE_SIZE,
        zoomOffset: MAP_TILE_ZOOM_OFFSET,
        minZoom: MIN_MAP_ZOOM,
        maxZoom: MAX_MAP_ZOOM,
      }).addTo(map);
    }

    markersRef.current = new TramMarkerLayer(map);

    // Leaflet tracks window resizes, but the container can also change size
    // without a window resize (flex layout changes, mobile browser chrome
    // appearing/disappearing). Invalidate on any container resize.
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      markersRef.current?.dispose();
      markersRef.current = null;
      map.remove();
    };
  }, []);

  // Positions arrive as a new array only when the snapshot actually changed
  // (see useTramPositions), so this sync runs ~1/s while trams move and
  // never on no-op ticks.
  useEffect(() => {
    markersRef.current?.update(positions);
  }, [positions]);

  return (
    <div
      ref={containerRef}
      className="map-view"
      aria-label="Map of the Helsinki tram network"
    />
  );
}
