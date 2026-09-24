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
- Tram markers (TV-0005, TV-0008) are fixed-color `divIcon` teardrops with a
  white ring - one user-specified brand hue per rolling-stock category (the
  `--tram-type-*` variables in `src/index.css`; TV-0009, TV-0010), with dark
  label ink on the light brand bodies and white on unknown for >=4.5:1 label
  contrast - because the OSM raster basemap is always light regardless of the
  UI `color-scheme`; the markers deliberately do not follow dark mode, while
  panel and other UI chrome do.
- TV-0008 (direction indication) is a pure rendering choice over this
  decision: each marker body stays a fixed-size `divIcon` centered on the
  vehicle position, with a teardrop shape whose point is rotated toward the
  vehicle's heading by a CSS rotor (`src/map/TramMarkers.ts` +
  `src/index.css`). The heading comes from the HFP subscription Tram View
  already holds (ADR-0002), so no extra request, marker, or map-layer change
  was needed; the rotation is one inline `transform` write per update, well
  within the marker comfort zone above.
- TV-0009 (rolling stock category on the markers) is a pure rendering choice
  over this decision: each marker body is colored by the vehicle's category
  via per-category CSS variables shared with the status-panel legend
  (`src/index.css`); the variables are fixed (not color-scheme aware) like
  the markers above, because the OSM raster tiles stay light. The category
  comes from the vehicle number the client already parses
  (`src/lib/fleet.ts`; source decision in ADR-0002), and each marker also
  carries a native `title` tooltip with the full model name, so the meaning
  of a color is one hover away. Color-only category separation is an
  accepted accessibility limitation for now (user, 2026 session); a fuller
  accessible encoding (pattern/shape per category) belongs to a follow-up
  task.
- Revisit this decision if marker updates grow beyond Leaflet's comfort zone
  (roughly thousands of simultaneously animated markers) or if vector basemap
  styling becomes a product requirement — the switch point is MapLibre GL JS.
