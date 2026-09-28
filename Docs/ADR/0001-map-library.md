# ADR-0001: Map library and MVP tile source

- **Status:** Accepted (implemented in [TV-0003](../../Tasks/TV-0003-map-view.md));
  basemap source amended 2026-09-25 by TV-0018 (DONE, merged at 048731c) and the
  tram line overlay added 2026-09-28 by TV-0019 — see the two amendments at the
  end of this file
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
  contrast - because the raster basemap is always light regardless of the
  UI `color-scheme` (the OSM tiles when this was written; the HSL style,
  `hsl-map`, since the amendment below); the markers deliberately do not
  follow dark mode, while panel and other UI chrome do.
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
  the markers above, because the raster basemap stays light (since the
  amendment below: the HSL style, `hsl-map`, is light as well). The category
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

## Amendment: HSL basemap tiles via the Digitransit Map API

- **Status:** Accepted (2026-09-25, user decision); implemented by TV-0018.
- **Decides:** which raster basemap the map page draws, and how it is
  requested.
- **Refines, does not replace, the Decision above:** the map library stays
  Leaflet 1.x; the basemap source changes from key-free OpenStreetMap
  standard tiles to HSL's own map style served by the Digitransit Map API,
  which requires the digitransit subscription key. The key's new surface is
  recorded in the [ADR 0003 amendment](./0003-public-api-key-policy.md).
- **Affects:** `src/map/constants.ts`, `src/map/MapView.tsx`,
  `src/lib/digitransit.ts` (key accessor), `Docs/digitransit.md`,
  `Docs/deployment.md`.

### Why the source changed

The user reported that the OSM standard basemap is cluttered with extra
information and that the tram network should be prominently visible
(2026-09-25). OSM Carto renders the tram network as a 0.75-1.5 px grey
`#6E6E6E` line for `railway=tram` (from z12) and 4-6 px grey square
`railway=tram_stop` dots (from z14, named from z16) — present but visually
buried. The user decided on 2026-09-25 to switch to HSL's own basemap; drawing
tram line geometry as an overlay layer is decided in the overlay amendment at
the end of this file (TV-0019), and this basemap draws no transit geometry of
its own (verified: no HSL tram green `#00985F` or bus blue `#007AC9` pixels at
any tested zoom) — which is exactly why the overlay is a layer the app owns
rather than something the basemap could be retuned to provide.

### Options compared (live probes, 2026-09-25)

| Option | Key | Result |
| ------ | --- | ------ |
| Keep OpenStreetMap standard | none | works, but is the clutter the user rejected |
| Digitransit Map API `hsl-map` (512 px), `hsl-map-256`, language and greyscale variants | digitransit subscription key (documented) | HTTP 200 `image/png`, CORS `*`, `cache-control: public,max-age=604800`, calm generic HSL style with no transit geometry |
| CARTO Positron / Voyager / Dark Matter | — | no longer usable key-free: every z/x/y returns one identical 2049-byte placeholder (etag `wm-…`) |
| Stadia Maps (Stamen Toner Lite, Alidade Smooth) | Stadia API key | HTTP 401 without a key |
| Esri World Light Gray Canvas | none | 200, but identical 2521-byte tiles at z17/z18 — blank above z16, below this app's max zoom |
| Wikimedia `osm-intl` | none | HTTP 403 for non-Wikimedia referers |
| OpenFreeMap (vector styles) | none | works, but needs MapLibre — a separate revisit of the Decision above |
| HSL open data "HSL:n linjat" (ArcGIS) | none | key-free but stale (no lines 14/15); an overlay source candidate in TV-0019, not a basemap |
| OpenTopoMap / CyclOSM / OSM-DE | none | same OSM-style density or wrong purpose |

### Decision

Draw the basemap from the Digitransit Map API's **`hsl-map`** source
(512 px raster tiles in HSL's generic HSL style), at the documented endpoint

```
https://cdn.digitransit.fi/map/v3/hsl-map/{z}/{x}/{y}{r}.png?digitransit-subscription-key={KEY}
```

with the digitransit subscription key appended at runtime (`{r}` is Leaflet's
retina placeholder, `@2x`). Leaflet maps the 512 px tiles to the map with
`tileSize: 512` and `zoomOffset: -1`.

### Why

- It is the basemap whose style the user asked for: HSL's generic style, calm
  and light, drawn by HSL for its own applications, with no transit geometry
  that could compete with the live markers or with a future line overlay.
- It keeps the map library decision intact: still Leaflet raster tiles, no
  vector renderer, no new dependency.
- The style is light regardless of the UI `color-scheme`, so the marker-color
  rationale in the Consequences above still holds unchanged.
- Measured tile geometry makes the Leaflet mapping unambiguous: a `hsl-map`
  512 px tile at z/x/y is pixel-identical (mean absolute difference 0.11) to
  the 2x2 mosaic of `hsl-map-256` at z+1 over the same ground, i.e. both
  sources share one xyz grid and `hsl-map` renders each cell at 512 px — hence
  `tileSize: 512` with `zoomOffset: -1` (the 256 px source would be
  `tileSize: 256`, `zoomOffset: 0`). The TileJSON
  (`…/map/v3/hsl-map/index.json`) confirms `scheme: xyz` and advertises the
  equivalent `api.digitransit.fi` host.
- The service stops adding detail above about URL zoom 18 (measured MAD against
  the LANCZOS-upscaled parent tile: 13.1 at z16, 5.5 at z17, 5.5 at z18, then
  1.6 / 0.9 / 1.1 at z19 / z20 / z21), so `MAX_MAP_ZOOM = 19` is kept but the
  requested URL zoom never exceeds 18 — no overzoomed requests, no rescaled
  tiles.

### Consequences

- **The basemap now needs the key.** The one published key authenticates both
  the line-metadata query and every basemap tile request (amendment to
  [ADR 0003](./0003-public-api-key-policy.md)); the deployed site's key must
  therefore stay domain-restricted to `devonv-nitor.github.io` exactly as
  before. A pan/zoom is many requests rather than one, but they are cached by
  the CDN for 7 days and carry no user data.
- **Without a key there is no basemap.** The map adds no tile layer, requests
  no unauthenticated tiles, and does not fall back to OSM (a silent style
  switch would be a quietly different app); the status panel's missing-key
  error names both the basemap and the line labels. `tryGetDigitransitApiKey()`
  in `src/lib/digitransit.ts` exists for that non-throwing read.
- **Attribution** is `OpenStreetMap contributors` (data) plus `Digitransit` /
  `HSL` (tiles), as one string in `src/map/constants.ts`. The digitransit Map
  API docs do not state a required wording; if the user's registration shows a
  stricter one, only that string changes.
- The OpenStreetMap tile usage policy obligation recorded above ends with this
  change (no OSM tile requests remain in any app state); OSM attribution stays
  because the HSL style is built on OSM data.
- `hsl-map` uses Finnish labels. Language variants (`hsl-map-en`, `-sv`,
  `-fi-sv`) and `hsl-map-greyscale` are documented alternates if the language
  or the style needs revisiting.
- Revisit this amendment if digitransit changes the Map API version or the
  `hsl-map` source, or if the key's tile traffic becomes a quota problem — the
  documented alternatives above are key-free only in the stale/blank cases, so
  the realistic fallback is a static or self-hosted raster style.

## Amendment: tram line overlay on the basemap

- **Status:** Accepted (2026-09-28, user decision); implemented by TV-0019.
- **Decides:** that the map page draws the tram network as its own layer, from
  which source, and at what level of detail; the layer's stacking and styling;
  and that this decision adds no overlay UI control.
- **Refines, does not replace, the Decision above or the basemap amendment:**
  the map library stays Leaflet 1.x and the basemap stays `hsl-map`; this
  amendment adds an app-owned vector layer above it. The basemap amendment's
  statement that `hsl-map` draws no transit geometry stays true and is the
  reason the overlay has to be a layer the app owns.
- **Affects:** `src/map/MapView.tsx`, `src/map/constants.ts`,
  `src/lib/digitransit.ts`, `Docs/digitransit.md`.

### Decision

The user's answers to the three questions the task posed (2026-09-28):

1. **Draw the overlay.** The basemap swap (TV-0018) removed the clutter, but the
   tram network should be visibly present, so the overlay is in scope.
2. **Source A — the Digitransit Routing API**, one query per session:
   `{ routes(transportModes: [TRAM]) { gtfsId shortName patterns { directionId
   geometry { lat lon } } } }`.
3. **Draw every pattern.** No deduplication into one geometry per displayed
   short name, and no geometry simplification.

### Why

- **Source A** reuses the app's existing key and the exact pattern-query path
  TV-0017 already exercises, adds no dependency, and reads the same live GTFS as
  the line labels, so a drawn line and a marker's label cannot disagree about
  which lines exist. Measured 2026-09-25: 31 routes / 150 patterns / 25 319
  coordinates / 862 KB in ~2.5 s, HTTP 200, CORS `*`; `geometry` is
  `[Coordinates] {lat, lon}`, not an encoded polyline.
- **Every pattern** is the true network shape and needs no dedup or simplify
  rule to justify; collapsing to one geometry per displayed short name would
  turn 150 patterns into ~19 names and hide the short-turn variants (`10B`,
  `1T`, `5T`, …) the app already labels. The cost is small at this network
  size: 150 polylines and 25 319 points, doubled to 50 638 when the HSL casing
  is drawn as a second polyline beneath the green one.
- Rejected, with the reasons that decided it: **B** HSL Jore route vector tiles
  — key-free and live, but an undocumented internal endpoint with no published
  terms *and* requiring a vector-tile decoder or the MapLibre switch named as
  the revisit point in the Decision above; **C** the HSL "HSL:n linjat" ArcGIS
  FeatureServer — key-free but stale (service dates end 2025-12, no lines
  14/15); **D** OSM `railway=tram` via Overpass — true track geometry, but
  runtime Overpass is rate-limited, so it would mean a committed snapshot that
  goes stale; **E** tram stops only — no route shape at all.

### Consequences

- **Stacking is fixed by this amendment.** The overlay is non-interactive and
  lives in its own pane between `tilePane` (z-index 200) and `markerPane`
  (z-index 600), so it draws above the basemap and below the tram markers:
  markers, their popups and the status panel stay on top and clickable, and
  marker colours and direction rotors are unchanged.
- **Style** follows HSL's own tram rendering — a white casing under HSL tram
  green `#00985F` — with the per-zoom widths stated in the code. A documented
  deviation is permitted if the casing proves too heavy under the markers at
  z11-13; the deviation and its reason are recorded where the widths are.
- **The overlay is always on.** This decision adds no toggle, no legend entry,
  and no other UI control; a control would be its own task with its own
  decision.
- **One request per session, map page only.** The vehicle overview page
  (ADR-0004) keeps exactly one data client and opens no overlay request; the
  map's existing HFP subscription and metadata query are unchanged.
- **Key discipline is unchanged** (ADR-0003): the key is appended at runtime and
  is never logged, printed, or committed. A missing key must degrade the overlay
  to no lines without throwing — the basemap, markers and panel keep working as
  they do today.
- **What this source cannot tell.** The geometry is the *planned* pattern shape
  from GTFS, not rails, so two directions of a line are drawn as two lines that
  coincide where the track is shared; the response carries no service-date or
  freshness field (unlike B/C/D), so the overlay is as fresh as the GTFS the
  Routing API serves at request time; and nothing in the payload says how
  recently a pattern was operated.
- **Revisit** if the payload or point count grows enough to cost pan/zoom
  smoothness, if the casing has to be dropped, or if a key-free live source with
  published terms and a documented licence appears.
