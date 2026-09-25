---
id: TV-0018
status: READY
owner: agent
gatekeeper: human
required_approvals: []
depends_on: []
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Replace the OSM basemap with Digitransit HSL raster tiles

The map page currently draws OpenStreetMap standard tiles
(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, key-free;
[ADR-0001](../../Docs/ADR/0001-map-library.md), TV-0003). OSM Carto shows the
tram network as a 0.75-1.5 px grey `#6E6E6E` line (`railway=tram`, from z12)
plus 4-6 px grey square tram-stop dots from z14 - visually buried in a busy
street/POI map. The user asked for a calmer basemap that leaves the tram
markers and any future line overlay dominant, and decided on 2026-09-25 to
switch the basemap to HSL's own map style, served by the Digitransit Map API
(this task); a possible tram-line overlay is a separate, undecided task
(TV-0019).

The user decision is recorded as amendments to
[ADR-0001](../../Docs/ADR/0001-map-library.md) (basemap source) and
[ADR-0003](../../Docs/ADR/0003-public-api-key-policy.md) (the public key now
also authenticates basemap tile requests). Those two amendments are part of
this task's deliverables.

## Verified facts (live probes, 2026-09-25 - do not re-derive)

- Documented endpoint ("Background map" page of the Digitransit Map API):
  `https://cdn.digitransit.fi/map/v3/:source/:z/:x/:y:size.png?digitransit-subscription-key={KEY}`,
  with `:size` being `@2x` for retina tiles or empty. The key may also be sent
  as a `digitransit-subscription-key` header (not usable from a Leaflet `<img>`).
  The TileJSON endpoint `…/map/v3/hsl-map/index.json` reports `scheme: xyz`,
  `minzoom: 0`, `maxzoom: null`, and advertises the equivalent
  `api.digitransit.fi` host.
- Sources: `hsl-map` (512 px, Finnish), `hsl-map-256` (256 px), plus `-sv`,
  `-en`, `-fi-sv` and `-greyscale` variants of each, and `hsl-vector-map`.
- Responses: HTTP 200, `image/png`, CORS `*`,
  `cache-control: public,max-age=604800` (7 days). Tiles also came back 200
  without a key, which is undocumented - treat the key as required.
- **Tile geometry (measured):** a `hsl-map` 512 px tile at z/x/y is
  pixel-identical (mean absolute difference 0.11) to the 2x2 mosaic of
  `hsl-map-256` at z+1 covering the same ground, i.e. both sources share one
  xyz grid and `hsl-map` renders each grid cell at 512 px. The only correct
  Leaflet mapping is therefore `tileSize: 512` with `zoomOffset: -1` (what
  digitransit-ui itself uses); `tileSize: 512` with `zoomOffset: 0` would draw
  the basemap at double scale.
- **Native detail limit (measured):** rendered tiles stop adding detail above
  about z18: MAD against the LANCZOS-upscaled parent tile is 13.1 (z16 vs z15),
  5.5 (z17 vs z16), 5.5 (z18 vs z17), then 1.6 (z19), 0.9 (z20), 1.1 (z21)
  while tile bytes fall 138 KB -> 77 -> 54 -> 22 -> 13 -> 10 KB. With
  `MAX_MAP_ZOOM = 19` and `zoomOffset: -1` the requested URL zoom is at most
  18, so the app never asks for overzoomed tiles and never rescales one.
- The raster basemap draws **no** transit routes or stops: no pixel matching
  HSL tram green `#00985F` or bus blue `#007AC9` at any tested zoom. Line
  overlays are TV-0019's concern.
- Rejected alternatives (same probes): CARTO `light_all`/`voyager`/`dark_all`
  now return one identical 2049-byte placeholder for every z/x/y (etag
  `wm-…`), i.e. no longer usable key-free; Stadia (Stamen Toner Lite, Alidade
  Smooth) returns 401 without an API key; Wikimedia `osm-intl` 403 for
  non-Wikimedia referers; Esri World Light Gray Canvas is key-free but returns
  identical 2521-byte tiles at z17/z18 (blank above z16, below this app's
  max zoom); OpenFreeMap vector styles work key-free but require MapLibre,
  which is ADR-0001's own switch point, not this task.

## Requirements

1. **Basemap source.** The map's single basemap is the Digitransit Map API
   raster source `hsl-map` at the documented endpoint above, built from
   `src/map/constants.ts`. No other tile source is requested at any time from
   any app state (no OSM request, no fallback provider).
2. **Leaflet mapping.** The tile layer uses `tileSize: 512` and
   `zoomOffset: -1`, plus `minZoom: MIN_MAP_ZOOM` and `maxZoom: MAX_MAP_ZOOM`.
   Retina tiles use Leaflet's built-in `{r}` placeholder (`@2x` on
   retina displays, empty otherwise), so the template stays one string.
3. **Key handling.** The tile URL's key comes from the same
   `VITE_DIGITRANSIT_API_KEY` value the metadata query uses, obtained through
   `src/lib/digitransit.ts` (add a non-throwing accessor there; do not read
   `import.meta.env` in the map module). Key discipline is unchanged: no key
   literal in any tracked file, the key is never logged, printed, or shown in
   an error message, and `dist/` is deleted after builds.
4. **Missing-key behavior.** With no key the map must render without throwing:
   no tile layer is added at all (no unauthenticated tile requests and no OSM
   fallback), and the existing status-panel "Missing Digitransit API key"
   error remains the single explanation. Update that message so it names both
   consumers of the key (basemap + line labels).
5. **Attribution.** The attribution control credits both the data and the
   service: `OpenStreetMap contributors` (data) and `Digitransit`/`HSL`
   (tiles), each linked, as one string in `src/map/constants.ts`.
6. **Markers stay legible and unchanged in behavior.** ADR-0001's
   marker-color rationale ("the raster basemap is always light") must be
   re-stated for the new basemap (the HSL style is light too); marker shapes,
   colors, direction rotor, hover tooltip, click popup, status panel, legend,
   counts, snapshots and staleness behavior are untouched, as is the data flow
   (HFP over MQTT, keyed metadata query, TV-0017 pages).
7. **Unchanged configuration.** `HELSINKI_TRAM_NETWORK_CENTER`,
   `DEFAULT_MAP_ZOOM`, `MIN_MAP_ZOOM` keep their current values. Zoom 11-19
   keeps working (URL zoom 10-18).
8. **Documentation owners updated, superseded text removed:**
   - `Docs/ADR/0001-map-library.md`: a new "Amendment: HSL basemap tiles via
     the Digitransit Map API" section with status/date, the options compared
     (keep OSM; CARTO; Stadia; Esri; Wikimedia; OpenFreeMap vector; HSL
     raster), the measured facts above, the chosen decision, and the
     consequences (keyed tiles, missing-key behavior, attribution, tile
     request volume, and the updated "basemap is always light" rationale).
   - `Docs/ADR/0003-public-api-key-policy.md`: a new short amendment recording
     that the one published key now also authenticates basemap tile requests;
     the one-key rule, the public-key posture, the domain restriction and the
     rotation fallback are unchanged.
   - `Docs/digitransit.md`: basemap row in the data-architecture table
     (source, endpoint, key required, 7-day cache), key-setup note that the
     basemap disappears without a key, and a verification step for tiles.
   - `Docs/deployment.md`: correct the now-false "Only the line-metadata
     GraphQL query uses the key" statement and the read-only "key-less local
     builds" wording where they describe the key surface.
   - `src/map/constants.ts` comments: name the new source, the tile size/zoom
     offset and their measured basis, and the removed OSM tile-usage-policy
     obligation.
9. **Scope discipline.** No `package.json` change, no new dependency, no new
   UI, no overlay work (TV-0019), no marker/panel behavior change, no changes
   outside `allowed_paths`.

## Acceptance

1. `npm run lint`, `npm run format:check` and `npm run build` are green;
   `package.json` is unchanged; `dist/` is deleted afterwards; `git status` is
   clean of unintended files; a repo-wide search for the key value finds
   nothing tracked.
2. **Live tile verification** (dev server + the app's real map in a browser,
   headless Chrome/CDP or manual): a `fetch`/network log of at least ten tile
   requests across at least two zoom levels after a pan and a zoom shows
   *every* tile request hitting
   `cdn.digitransit.fi/map/v3/hsl-map/<z>/<x>/<y>[@2x].png?digitransit-subscription-key=<key>`
   with HTTP 200 and an `image/png` body of 512 px (`@2x`: 1024 px) per side.
   Evidence to capture: the request URLs with z/x/y, status and byte size, and
   the decoded pixel dimensions of at least two of them.
3. **No other tile host:** the same capture contains zero requests to
   `tile.openstreetmap.org` (or any other tile host) in that session,
   including after a pan outside the initial viewport.
4. **Correct view by independent arithmetic:** from the app's live map state
   (center, zoom, container size, read over CDP) compute the expected tile set
   with standard 256-based xyz formulas at tile zoom = map zoom - 1
   (`zoomOffset: -1`) and assert it equals the captured request set (same
   z/x/y coordinates and count). This is the machine check that the
   `tileSize: 512` + `zoomOffset: -1` combination renders the intended
   Helsinki view at the intended scale; the 512 px vs `hsl-map-256` grid
   identity in the verified facts is what makes it valid.
5. **Visual confirmation, honestly attributed:** a screenshot at the default
   view shows the HSL style (light, calm, no OSM-standard look, no transit
   routes drawn) with the live markers on it, and a second one at z16 shows
   street-level detail. If the agent cannot interpret the screenshots, they
   are saved and handed to the human to confirm, and the report states that
   point 4 - not the screenshot - is the machine evidence.
6. **Missing-key path** (run from a scratch copy of the repo without
   `.env.local`, so nothing in this repo's env files is disturbed): the map
   renders with live markers and no basemap, the status panel shows the
   missing-key error naming both the basemap and the line labels, the browser
   console has no unhandled error, and the network log contains no tile
   request. Evidence: the console dump and network log.
7. **Regression check:** in the same live session the HFP stream still
   connects, the status panel goes live with line-numbered markers and legend
   counts, and a marker click still opens the TV-0016 popup. Evidence: the
   panel's live status line and one popup readout.
8. The task file is marked `IN_PROGRESS` -> `REVIEW` with the commit tip SHA
   in the review request, and `DONE` only after the review PASS and the merge.

## Notes

- Merge order: independent of TV-0019 (not defined for implementation yet).
  If TV-0019 is later approved and touches `src/map/MapView.tsx`, the overlay
  layer must be added *above* the basemap layer and below the marker layer.
- The visual comparison artifact from the investigation (all candidates side
  by side, plus a prototype overlay) lives in the coordinator's thread
  storage at `reports/tile-investigation.html`; it is reference material, not
  part of the repo and not authoritative.
- Digitransit's terms of use for the Map API were not read in full during the
  investigation; the chosen attribution credits OSM for the data and
  Digitransit/HSL for the tiles, which is the same credit digitransit-ui
  gives. If the human's digitransit.fi registration shows a stricter
  required wording, change only the attribution string.
