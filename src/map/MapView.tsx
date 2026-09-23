import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  DEFAULT_MAP_ZOOM,
  HELSINKI_TRAM_NETWORK_CENTER,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
} from "./constants";

/**
 * Full-viewport interactive map of the Helsinki tram network.
 * Basemap per Docs/ADR/0001-map-library.md: Leaflet + OpenStreetMap tiles.
 * Tram markers arrive in TV-0005.
 */
export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);

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

    L.tileLayer(MAP_TILE_URL, {
      attribution: MAP_TILE_ATTRIBUTION,
      maxZoom: MAX_MAP_ZOOM,
    }).addTo(map);

    // Leaflet tracks window resizes, but the container can also change size
    // without a window resize (flex layout changes, mobile browser chrome
    // appearing/disappearing). Invalidate on any container resize.
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="map-view"
      aria-label="Map of the Helsinki tram network"
    />
  );
}
