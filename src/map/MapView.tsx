import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TramPosition } from "../lib/digitransit.ts";
import { tryGetDigitransitApiKey } from "../lib/digitransit.ts";
import { TramMarkerLayer } from "./TramMarkers";
import { TramLineOverlay } from "./TramLineOverlay";
import { PunctualityHeatmapLayer } from "./PunctualityHeatmap";
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
 * are managed imperatively in TramMarkerLayer, above the basemap; the tram
 * line overlay (TV-0019, ADR-0001 overlay amendment) in TramLineOverlay and
 * the punctuality heatmap (TV-0028) ride between the tiles and the markers
 * as their own panes. TV-0019 requirement 9: the overlay's and the
 * heatmap's visibility are user-toggled (MapPage owns the per-session
 * state; MapLayerToggles renders the buttons) and reach the imperative
 * layers through the `layerOn` props and these effects. TV-0029: the
 * position snapshot this view renders carries tram and metro positions
 * alike (the metro markers draw in the same marker layer); the overlay
 * draws the metro corridors too, in the same pane.
 */
export default function MapView({
  positions,
  heatmapOn,
  overlayOn,
}: {
  positions: TramPosition[];
  heatmapOn: boolean;
  overlayOn: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<TramMarkerLayer | null>(null);
  const overlayRef = useRef<TramLineOverlay | null>(null);
  const heatmapRef = useRef<PunctualityHeatmapLayer | null>(null);

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
      // TV-0019: the tram line overlay rides one session-cached Routing API
      // request (ADR-0001 overlay amendment), asked for only here on the map
      // page; with no key there is no basemap and no overlay request - both
      // degrade to nothing, nothing throws.
      const overlay = new TramLineOverlay(map);
      overlayRef.current = overlay;
      overlay.load(subscriptionKey);
    }

    markersRef.current = new TramMarkerLayer(map);
    // TV-0028: the punctuality field rides the same snapshot feed as the
    // markers; its pane (z 250) sits above the basemap and below the route
    // overlay's tier (350) and the markers (600).
    heatmapRef.current = new PunctualityHeatmapLayer(map);

    // Leaflet tracks window resizes, but the container can also change size
    // without a window resize (flex layout changes, mobile browser chrome
    // appearing/disappearing). Invalidate on any container resize.
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      overlayRef.current?.dispose();
      overlayRef.current = null;
      markersRef.current?.dispose();
      markersRef.current = null;
      heatmapRef.current?.dispose();
      heatmapRef.current = null;
      map.remove();
    };
  }, []);

  // TV-0019 requirement 9: the toggles reach the imperative layers through
  // refs. The effects run on the props (default ON on every load; the
  // toggle state is per-session), guard the nulls (the layers do not exist
  // before the mount effect runs, and with no key the overlay never
  // exists), and are keyed separately so toggling one button never touches
  // the other layer's state. `setEnabled` neither rebuilds nor reorders
  // anything (the overlay's pane is hidden in place; the heatmap skips its
  // draw), so the dispose ordering below is untouched.
  useEffect(() => {
    heatmapRef.current?.setEnabled(heatmapOn);
  }, [heatmapOn]);

  useEffect(() => {
    overlayRef.current?.setEnabled(overlayOn);
  }, [overlayOn]);

  // Positions arrive as a new array only when the snapshot actually changed
  // (see useTramPositions), so this sync runs ~1/s while trams move and
  // never on no-op ticks.
  useEffect(() => {
    heatmapRef.current?.update(positions);
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
