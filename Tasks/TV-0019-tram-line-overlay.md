---
id: TV-0019
status: BLOCKED
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0018]  # merged at 048731c
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Tram line overlay on the basemap (source and scope undecided)

The user's original request (2026-09-25) was twofold: a less cluttered
basemap *and* "the tram lines visible as an overlay on the map". The basemap
half is done (TV-0018, merged at 048731c; the Digitransit Map API's `hsl-map`
raster tiles are the basemap and draw no transit geometry - see the
[ADR 0001 amendment](../Docs/ADR/0001-map-library.md));
the overlay half is **not decided** - the user stated they are not sure yet
("I'm not sure yet on the latter"). This task stays `BLOCKED` until the
decision below is made, then it becomes implementable as written.

Background the decision needs (all probed live 2026-09-25; the basemap side
is recorded in the [ADR 0001 amendment](../Docs/ADR/0001-map-library.md)):

- Neither the OSM basemap (thin grey `railway=tram` line only) nor the HSL
  raster basemap (no transit geometry at all - no `#00985F` / `#007AC9`
  pixels at any tested zoom) draws tram *routes*; any line overlay has to be
  a layer the app owns.
- HSL's own style (`HSLdevcom/hsl-map-style`) draws tram routes with a white
  casing under HSL tram green `#00985F`; that colour pairing is available to
  copy, so the overlay can match what HSL users already recognise.

## Candidate overlay sources (verified)

| # | Source | Key | Verified facts | Cost |
| - | ------ | --- | -------------- | ---- |
| A | Digitransit Routing API, one query: `{ routes(transportModes: [TRAM]) { gtfsId shortName patterns { directionId geometry { lat lon } } } }` | app's existing key | 31 routes / 150 patterns / 25,319 coordinates / 862 KB in ~2.5 s, HTTP 200, CORS `*`; `geometry` is `[Coordinates] {lat,lon}` (not an encoded polyline); includes current lines 1-15 and the variant short names (`10B`, `10H`, `11H`, `13H`, `1H`, `1T`, `2H`, `3H`, `4H`, `5H`, `5T`, `6H`, `7H`, `8H`, `9H`, `9N`, `H`); same GTFS ids and same per-(route,direction) pattern query the app already uses (TV-0017) | one cached request per session; no new dependency |
| B | HSL Jore route vector tiles `https://kartat.hsl.fi/jore/tiles/routes/{z}/{x}/{y}.pbf` (TileJSON at `/routes/index.json`) | none | CORS `*`, gzip; one z14 tile = 353 features including 96 `mode=TRAM` LineStrings clipped to the tile, properties `routeId`, `routeIdParsed`, `direction`, `mode`, `dateBegin`/`dateEnd` (current: 2026-09-08), `trunk_route`; `…/tiles/stops/…` carries tram stops (`stopId`, `shortId`, `nameFi`, `nameSe`); empty above z16; **undocumented internal endpoint** (no published terms) | needs a vector-tile decoder (new dependency) or MapLibre (ADR-0001 switch point) |
| C | HSL open data "HSL:n linjat" ArcGIS FeatureServer, `route_type='0'` | none | 852 tram trip shapes, key-free, CORS `*`; **stale**: service dates end 2025-12 and the newest export has no lines 14/15, item last modified 2025-11-28 | build-time extraction into a committed GeoJSON + periodic refresh, or stale lines |
| D | OSM `railway=tram` ways via Overpass | none | true track geometry; runtime Overpass is rate-limited and unsuitable for a public site | committed GeoJSON built at build time, ODbL attribution, staleness |
| E | Tram stops only (Routing API stops, or Jore `stops` tiles) | A: key; B: none | tram stop points with names, far smaller payload | marker-like clutter; no route shape |

## Requirements (only after the decision below is made)

1. Use the source chosen in the decision, cached for the session (no repeated
   fetch per pan/zoom, no polling), and only on the map page - the TV-0017
   vehicle page keeps exactly one data client and must not open the overlay
   request.
2. Draw routes as non-interactive polylines in a layer **above the basemap
   (TV-0018) and below the tram markers**, so markers and their popups stay
   on top and clickable; markers keep their current colors and direction
   rotors unchanged.
3. Style per HSL's own tram route rendering (white casing + `#00985F`), or a
   documented deviation if the casing proves too heavy under the markers at
   z11-13; the chosen widths per zoom are stated in the code.
4. Follow the decided variant policy: either deduplicate the trip patterns
   into one geometry per displayed line short name, or draw every pattern -
   the app's `isTramLineShortName` filter alone does not decide this, because
   several overlay patterns share one displayed line.
5. Key discipline as in TV-0018 (the key must never be logged, printed, or
   committed); a missing key degrades the overlay (no lines) without
   breaking the basemap, markers, or panel.
6. Update the owning documents: the basemap ADR amendment's "no transit
   geometry on the basemap" statement gains a pointer to the overlay
   decision, `Docs/digitransit.md`'s data-architecture table gains the
   overlay row, and the overlay's source/scope decision is recorded as an
   ADR amendment (the source choice and the variant policy are exactly the
   kind of decision ADRs own).
7. No `package.json` change unless the chosen source requires a decoder, in
   which case the dependency is disclosed in the handoff and the ADR
   amendment before merge.

## Acceptance (sketch - tighten when the decision is made)

1. `npm run lint`, `npm run format:check`, `npm run build` green; no
   undisclosed `package.json` change; `dist/` deleted after builds; no key in
   any tracked file.
2. Live verification over the dev server: the overlay request(s) hit only the
   chosen source, HTTP 200, with the expected payload (for A: ~31 routes /
   ~150 patterns; state the measured counts and bytes), once per session -
   evidence: the network log across a pan, a zoom and a page navigation to a
   vehicle page (which must add no overlay request).
3. Screenshot evidence at z11, z13 and z16: lines follow the tram tracks
   (spot-check at least three named locations, e.g. Rautatientori,
   Katajanokka, Munkkiniemi), markers remain readable on top of the lines and
   still open the TV-0016 popup, and the map stays legible (the overlay does
   not recreate the clutter the basemap swap removed). If screenshots cannot
   be interpreted by the agent, they are handed to the human and the report
   says so instead of implying a visual check.
4. Marker counts, legend, snapshots, staleness, popup content and the panel
   are unchanged; the HFP stream and the metadata query behave as before.
5. Honest limitation recorded for whatever the chosen source cannot tell:
   variants shown or hidden, geometry freshness date (for B/C/D), and any
   zoom range where the overlay is empty (B: above z16).

## Decision requested

Three questions, in order of importance:

1. **Do the overlay at all?** The basemap swap (TV-0018) already removes the
   clutter complaint; the overlay is an addition, and it can wait.
2. **Which source?** Recommended: **A**, the keyed Routing API - it reuses
   the app's existing key and the exact pattern-query path TV-0017 already
   exercises, needs no new dependency, and comes from the same live GTFS as
   the line labels, so the drawn lines and the marker labels cannot disagree
   about which lines exist. B is key-free with live data and would render
   like HSL's own map, but it is an undocumented endpoint plus a decoder
   dependency; C and D are static snapshots that go stale.
3. **Which patterns?** Draw every pattern (true network shape, visually two
   tracks where directions differ) or one geometry per displayed short name
   (lighter, but 150 patterns collapse to ~19 names, so it needs a
   dedup/simplify rule and hides short-turn variants like `10B`/`1T`).

If the answer is "not now", the coordinator deletes this task (and its
PLAN.md row) rather than leaving it BLOCKED indefinitely.
