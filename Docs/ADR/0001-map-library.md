# ADR-0001: Map library and MVP tile source

- **Status:** Accepted (implemented in [TV-0003](../../Tasks/TV-0003-map-view.md))
- **Date:** 2026-09-23
- **Context:** [Docs/Idea.md](../Idea.md) — interactive Helsinki map view, deployable
  to GitHub Pages with no backend, no paid API keys for the MVP.

## Context

The core of Tram View is a full-viewport interactive map of the Helsinki region
that later carries live tram markers ([TV-0005](../../Tasks/TV-0005-tram-markers.md):
circles with line numbers, updating as trams move). The MVP must work without a
paid API key and run entirely client-side on GitHub Pages. TV-0004 (digitransit
transport) is a separate concern; this decision covers the basemap only.

## Options

### Leaflet 1.x (chosen)

- Mature, small (~42 KB gzipped), raster-tile based; zero configuration to show
  OpenStreetMap tiles.
- Huge ecosystem; straightforward imperative API that wraps cleanly in a React
  component; built-in `trackResize` plus `invalidateSize()` for responsive views.
- Circle markers / custom `divIcon`s make the "circle with line number" markers
  easy, and a few hundred live-updating markers is well within its comfort zone.
- Limitation: no vector styling or smooth zoom/rotate animation of the basemap.

### MapLibre GL JS

- WebGL vector rendering: smooth animation, rotation, style-driven layers.
- Limitation for the MVP: its advantages need a vector style; key-free vector
  styles that are dependable for a public deployment are not turnkey, and
  MapLibre raster + OpenStreetMap tiles would pay the larger bundle cost without
  gaining anything the MVP needs.
- Live-updating markers perform well via GeoJSON sources, but the expected
  marker count (HSL trams: low hundreds) does not require this.

## Decision

Use **Leaflet 1.x** with **OpenStreetMap standard raster tiles**
(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`). No API key is required.

## Why

- Meets every MVP requirement with the smallest dependency and least
  configuration: key-free tiles, client-only, GitHub Pages friendly.
- The basemap has no vector-styling or animation requirements in
  [Docs/Idea.md](../Idea.md), so MapLibre's differentiators are unused cost.
- Marker rendering (TV-0005) is simpler in Leaflet: `circleMarker`/`divIcon`
  with line-number labels, updated imperatively on position changes.

## Consequences

- Tile usage must follow the OpenStreetMap tile usage policy
  (<https://operations.osmfoundation.org/policies/tiles/>): attribution is shown
  on the map ("© OpenStreetMap contributors"), the browser's user agent is used
  as-is, and usage stays light (single map, no bulk downloading) — acceptable
  for this MVP.
- Map center/zoom for the Helsinki tram network live in
  `src/map/constants.ts`; TV-0005 reads them from there.
- Revisit this decision if marker updates grow beyond Leaflet's comfort zone
  (roughly thousands of simultaneously animated markers) or if vector basemap
  styling becomes a product requirement — the switch point is MapLibre GL JS.
