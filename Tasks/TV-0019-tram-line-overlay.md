---
id: TV-0019
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0018]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Tram line overlay from the Routing API, drawing every pattern

The user's original request (2026-09-25) was a less cluttered basemap *and* the
tram lines visible as an overlay. The basemap half is done (TV-0018, merged at
048731c); the three questions this task was blocked on were answered by the user
on **2026-09-28**: draw the overlay, use **source A** (the Digitransit Routing
API), and **draw every pattern**. The accepted decision - options, chosen
source, rejected alternatives and their reasons, stacking and styling - is
[the overlay amendment](../Docs/ADR/0001-map-library.md#amendment-tram-line-overlay-on-the-basemap)
of ADR-0001, which is the authority for this work; it is not re-derived here.

Measured facts the amendment records and this task relies on (live probes
2026-09-25): `{ routes(transportModes: [TRAM]) { gtfsId shortName patterns {
directionId geometry { lat lon } } } }` returns 31 routes / 150 patterns /
25 319 coordinates / 862 KB in ~2.5 s, HTTP 200, CORS `*`, with `geometry` as
`[Coordinates] {lat, lon}` (not an encoded polyline) and short names covering
lines 1-15 and the variants (`10B`, `10H`, `11H`, `13H`, `1H`, `1T`, `2H`,
`3H`, `4H`, `5H`, `5T`, `6H`, `7H`, `8H`, `9H`, `9N`, `H`).

## Requirements

1. **Source A, one request per session, map page only.** Load the geometry with
   the app's existing key and its existing Routing API plumbing, cached at
   module level for the session: no refetch on pan, zoom, popup open, popup
   close, marker update, or returning from the vehicle page, and no polling.
   The vehicle overview page (ADR-0004) must initiate no overlay request.
2. **Draw every pattern.** One polyline per `(route, directionId)` pattern the
   query returns: no deduplication into one geometry per displayed short name,
   no simplification, no coordinate dropping. The query's
   `transportModes: [TRAM]` is the scope filter. Report the returned route,
   pattern and coordinate counts and whether every returned short name is one
   the app displays as a tram line; if the returned set is wider than the
   displayed set, report that difference rather than silently filtering it away
   or silently drawing the extra lines.
3. **Stacking.** The overlay is non-interactive and draws above the basemap and
   below the tram markers: a pane whose z-index is between `tilePane` (200) and
   `markerPane` (600). Markers, their popups and the status panel stay on top
   and clickable, markers keep their current colors and direction rotors, and
   the overlay must not capture clicks that today reach the map or a marker.
4. **Styling.** HSL's own tram route rendering: a white casing polyline under
   HSL tram green `#00985F`, with the per-zoom widths stated in the code. A
   documented deviation is allowed if the casing proves too heavy under the
   markers at z11-13 — the deviation and its reason go where the widths live.
   The overlay is always on: no toggle, no legend entry, no new UI control.
5. **Added once, not per update.** The overlay is created when the geometry
   resolves and is not rebuilt by marker updates: no per-marker or per-position
   layer work, and the ~1 Hz marker refresh must not touch the polyline set.
6. **Key discipline and degradation.** The key is appended at request time and
   is never logged, printed, or committed; with no key the overlay contributes
   no lines and throws nothing — the basemap, markers and panel keep working.
7. **Scope of change.** No `package.json` change (source A needs no decoder or
   other dependency). `Docs/digitransit.md`'s data-architecture table gains the
   overlay row (transport, endpoint/query, key requirement, cache policy). The
   ADR-0001 overlay amendment already records the decision and is not rewritten;
   implementation notes belong in the code and the table row.
8. **Do not regress what exists.** The HFP subscription keeps its single
   connection (ADR-0002/ADR-0004), the line-metadata query stays one fetch per
   session, marker counts, legend, snapshots, popup content and panel behavior
   are unchanged.

## Acceptance

1. **Checks and hygiene.** `npm run format:check`, `npm run lint` and
   `npm run build` pass; `git diff` shows no `package.json` change; `dist/` is
   deleted after builds; no tracked file contains the key.
2. **Live request evidence.** Over the dev server, a network log spanning a pan,
   two zooms, a popup open/close and a navigation to a vehicle page and back
   shows **exactly one** overlay request: HTTP 200, the measured payload
   (state the actual route / pattern / coordinate counts and bytes, and compare
   them with the amendment's 31 / 150 / 25 319 / ~862 KB), and **zero** overlay
   requests from the vehicle page or the return trip. Report the raw log lines.
3. **Objective geometry alignment.** For at least three named locations
   (Rautatientori, Katajanokka, Munkkiniemi, or better ones if these are
   ambiguous), compute the minimum distance from that stop's coordinates - taken
   from the app's own stop data, not from a hand-read map - to the nearest point
   of any drawn pattern polyline, and report the numbers in metres. Say which
   pattern(s) produced the winner. A claim of alignment without these numbers is
   not evidence.
4. **Screenshot evidence at z11, z13 and z16.** Capture the overlay with markers
   visible at each zoom, view the images, and state what is actually visible:
   whether lines follow plausible tram corridors (not bus/road corridors), the
   casing's readability under the markers, and whether the map stays legible
   rather than recreating the clutter the basemap swap removed. If a screenshot
   cannot be interpreted, hand it to the human and say so instead of implying a
   visual check.
5. **Interaction and no regression.** Markers are still on top, still open the
   TV-0023/TV-0026 popup, still take their clicks; the panel, legend and marker
   counts behave as before; one MQTT connection is open before and after the
   overlay loads; marker updates do not rebuild the overlay (state how you
   checked).
6. **Honest limitations recorded.** Both directions of a line are drawn as
   separate coincident geometries; the geometry is the planned pattern, not
   rails; the payload carries no freshness field; any zoom range where the
   overlay is empty; and any returned short name the app does not display.
7. **Blast radius.** Grep proof that the overlay loader is called only from the
   map page's path (`src/map/**`) and not from `src/components/vehicle/**`, and
   that no second `routes(` query was added to the metadata loader's module
   state.

## Notes

- Owning files: `src/map/MapView.tsx` (layer/pane wiring),
  `src/map/constants.ts` (styling constants and widths), `src/lib/digitransit.ts`
  (the keyed request, next to `loadRoutePatterns`), `Docs/digitransit.md`.
- The pattern-query path TV-0017 uses is the model to follow for caching and
  error handling; keep the overlay loader's failure mode silent (no lines) and
  separate from the marker pipeline's.
- The app's `isTramLineShortName` filter (`src/lib/route.ts`) is *not* the
  variant policy: with "every pattern" chosen, it neither decides the shape set
  nor filters which patterns are drawn without a reported reason (requirement 2).
- Leaflet's default SVG renderer handles 25 319 points in 150 polylines; if pan
  or zoom stutters, canvas (`preferCanvas`) or simplification is a deviation to
  document, not a silent change — simplification would contradict the decision.
- **Serialize with TV-0024.** Both tasks edit `src/lib/digitransit.ts`; TV-0024
  stays queued until this task is merged and reviewed, so the two never share a
  base.

## Handoff (status: REVIEW → DONE — optional, delete before merge)

### Implementation

- `src/lib/digitransit.ts`: `loadTramNetworkGeometry()` +
  `TRAM_NETWORK_GEOMETRY_QUERY` (added at the end of the file, after
  `loadRouteStopNames` — additive and local for TV-0024), typed as
  `TramRouteGeometry[]` / `TramPatternGeometry[]`. Cached at module level with
  the `??=`-promise pattern of `loadTramRouteIndex` (one request per session;
  a failure clears the cache so a later session can retry). The feed is
  untrusted input: coordinates are validated by type only, nothing simplified
  or dropped, and `shortName` is kept as reported and never used to filter the
  pattern set. `isTramLineShortName` is deliberately not applied (requirement
  2).
- `src/map/constants.ts`: `TRAM_OVERLAY_PANE` ("tramLineOverlay"),
  `TRAM_OVERLAY_PANE_Z_INDEX` (350 — between `tilePane` 200 and
  `markerPane` 600), `TRAM_LINE_COLOR` `#00985F`, `TRAM_LINE_CASING_COLOR`
  `#FFFFFF`, and the per-zoom widths table `tramLineWidths()` (z11: casing 4 /
  line 2, z13: 5 / 2.5, rising one px per zoom to z19: 11 / 5.5).
- `src/map/TramLineOverlay.ts` (new): imperative layer modeled on
  TramMarkerLayer. Creates the pane (z-index 350, `pointer-events: none`),
  draws one casing polyline per pattern then one green polyline per pattern
  (draw order puts every green line above every casing within the pane's one
  shared SVG renderer), all `interactive: false`, every coordinate, nothing
  simplified; a pattern with empty geometry draws nothing (there is nothing
  to drop). Applies widths on `zoomend`. `load(apiKey)` calls the loader;
  a failure logs once and draws nothing (never touches the marker pipeline).
  `dispose()` removes the polylines and the pane; a late resolution after
  dispose draws nothing.
- `src/map/MapView.tsx`: constructs and loads the overlay next to the tile
  layer, only when the key exists (with no key: no basemap and no overlay
  request, nothing throws), disposes it on teardown.
- `Docs/digitransit.md`: overlay row in the data-architecture table + a
  TV-0019 paragraph.
- `package.json` unchanged; no new dependency.

### Evidence

Checks (2026-09-28): `npm run format:check`, `npm run lint`, `npm run build`
all green; `dist/` deleted after the build; no tracked file contains the key
(`.env.local` copied for the live run, deleted after; it never appears in any
log — URLs were redacted in the harness, request headers never read).

**Live observations** (dev server :5275, headless Chrome driven over CDP;
script and raw logs in /tmp, quoted below):

- Network log spanning the load, a pan, two zooms (13→16→11→13), a popup
  open (marker click, Esc close) and a navigation to `#/vehicle/40/435` and
  back shows **exactly one** overlay request: `POST
  https://api.digitransit.fi/routing/v2/hsl/gtfs/v1 -> 200,
  query=TramNetworkGeometry` — zero in the vehicle phase, zero in the return
  phase (the return redrew from the session cache: markers 106, overlay paths
  300). 134 raw lines saved; the overlay line is `#40 phase=load POST ... ->
  200 93714B` (run 1) / `93608B` (run 2, after the round-1 fix below; same
  query and structure).
- Review round 1 (reviewer thr_cbd6tk7zsp, tip 50241a0) found the blocking
  bug this task's first `draw()` had: casing and green polylines were
  interleaved per pattern instead of all casings first, so a later pattern's
  white casing could cover an earlier pattern's green line wherever patterns
  overlap. Fixed by restructuring `draw()` into two passes (all casing
  polylines over all routes/patterns, then all green polylines); re-verified
  live: the renderer SVG's paint order has **0 violations** (every `#FFFFFF`
  path precedes every `#00985F` path) at z11, z13 and z16, and every other
  live checkpoint repeated green (one overlay request, 300 paths, path
  identity 300/300, popup open/close, one MQTT socket per phase, zero console
  errors).
- Payload, measured from the response body captured off the app's own
  request: HTTP 200, 31 routes / 150 patterns / 25 319 coordinates,
  **861 404 bytes uncompressed** (the 93 714 B in the network line is the
  gzipped transfer size), matching the amendment's 31 / 150 / 25 319 /
  ~862 KB. Every returned short name passes `isTramLineShortName`: all 31
  (1..15 with variants, plus `H`) are lines the app displays — the returned
  set is not wider than the displayed set. (Line 14 is absent from the API's
  TRAM set.)
- Geometry alignment, computed from the app's own stop data (the same
  endpoint and the `route(id:) patterns { directionId stops { gtfsId name
  lat lon } }` block `loadRoutePatterns` issues; trimmed only of the popup's
  trip fields) against the drawn polylines (point-to-segment, equirectangular
  projection):
  - Rautatientori (stop `HSL:1020456`, from line 9's stop data): min
    **5.3 m** — winner line 12 both directions, line H, line 9.
  - Katajanokka terminal (stop `HSL:1080413`, from line 5's stop data): min
    **3.4 m** — winner line 5 both directions + 5T.
  - Saunalahdentie, Munkkiniemi (stop `HSL:1301456`, from line 4's stop
    data): min **3.2 m** — winner line 4 both directions + 4H.
  The stops sit on the corridors of the lines that serve them, at the
  few-metre offset expected between a platform stop and the planned track
  line.
- Interaction / no regression: markers stay on top (pane 350 < markerPane
  600) and a marker click opened the TV-0023 HUD popup (line 1 tram, vehicle
  key 40/435) and Esc closed it; exactly one MQTT (`wss://mqtt.hsl.fi`) socket
  OPEN at every checkpoint (1 after load with the overlay drawn; on the
  vehicle page the map's socket closed and the overview's opened; on the
  return the map's reopened); the overlay is never rebuilt by updates — the
  300 path elements were tagged with a DOM attribute after load and, after
  the pan, the two zooms (whose `zoomend` rewrites stroke-width in place)
  and ~30 snapshots, all 300 were still the same tagged elements.
- Screenshots captured at z13, z16 and z11, recaptured after the round-1 fix
  (105-106 markers, 300 overlay paths at
  each): **/tmp/tv0019-z13.png, /tmp/tv0019-z16.png, /tmp/tv0019-z11.png**.
  **I could not interpret them**: the model executing this task does not
  support images, so the visual judgement (corridors vs bus roads, casing
  readability under markers, legibility) is **handed to the human** and was
  not made.

**Code-level substitutes** (stated, not observed live):

- Styling/stacking verified against the DOM instead of visually: at z11/z13/
  z16 the 300 paths carry exactly `stroke #FFFFFF` ×150 / `#00985F` ×150 with
  widths 4/2, 5/2.5, 8/4 (the per-zoom table applied), the pane has inline
  z-index 350 and computed `pointer-events: none`, no path carries
  `leaflet-interactive` — the overlay cannot capture clicks (the DOM check,
  not a click-through test) — and the paint order has 0 casing-over-green
  violations (the DOM check, not a visual one).
- The zoom-width table (z14-z19 values) is the code's statement, not a
  per-zoom measurement; z11/z13/z16 were observed in the DOM.
- No-key degradation is reasoned from code (the loader is only called when
  `tryGetDigitransitApiKey()` returns a key, the same guard as the tile
  layer) — not exercised live with a keyless run.

### Known limitations

- Both directions of a line are drawn as separate coincident geometries
  (the alignment winners show both directions of 5/9/12 at the same stops).
- The geometry is the planned GTFS pattern shape, not rails.
- The payload carries no freshness field; the overlay is as fresh as the
  GTFS served at request time.
- No zoom range is empty: the overlay draws at every zoom the map allows
  (11-19); observed in the DOM at 11/13/16.
- No returned short name is outside the displayed set, so nothing was
  filtered or silently drawn beyond it.
- The casing widths at z11-13 (4-5 px) proved fine in the DOM checks; the
  amendment's documented-deviation escape was not needed — but the visual
  confirmation is outstanding with the human.
- The screenshots await the human's visual judgement (above).
