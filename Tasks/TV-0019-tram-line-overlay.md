---
id: TV-0019
status: READY
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
