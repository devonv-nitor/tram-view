---
id: TV-0022
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: ["ADR-0002 amendment (user decision 2026-09-25: option A)"]
depends_on: [TV-0011, TV-0016, TV-0017, TV-0020]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Resolve a tram's line from the Routing API's live trip when its HFP route id is not a GTFS route id

User report (2026-09-25): "lots of examples of red dot trams right now, e.g.
vehicle 461 is showing route 1001H6". Diagnosis (live, 21:45-22:10; artifact
`reports/tv0022-red-dot-diagnosis.html` in the coordinate thread's storage):
82 live trams, **10 red (12%)**, in four families - `1007 9` x3 (`desi` "7",
the raw route id contains a literal space), `1001H6`/`1001H5` x4 (`desi`
"1H"), `100HA3`/`100HA5` x3 (`desi` "H"), and `1009TX` seen earlier. All of
those route ids are **absent from the whole 515-route GTFS route list**, not
just from the tram lines, so TV-0011's rule (`HSL:<HFP route id>` is not one
of the 31 indexed tram route ids -> red dot) fires for a vehicle that is
plainly in service with a valid display line.

The Red-dot rule is therefore too strict: HSL publishes variant-suffixed HFP
route ids for real service runs (`1001H6` is a run of line 1H, whose GTFS
route id is `HSL:1001H`; `1007 9` is a run of line 7, `HSL:1007`), and the
app already shows the same line green when the same vehicle publishes the
unsuffixed id. The same defect empties the vehicle overview page for those
vehicles: `route(id: "HSL:1001H6")` returns 0 patterns (vs 6 for
`HSL:1001H`), so the stop sequence is unavailable.

Live-verified facts the worker can rely on (2026-09-25, same window):

- The Routing API's own HFP-to-route matching resolves most of them:
  `1007 9` -> `HSL:1007` (3 vehicles) and `1001H5`/`1001H6` -> `HSL:1001H`
  (4 vehicles), i.e. **7 of the 10 reds were false**. `100HA3`/`100HA5`
  (heading to Ruskeasu) had **no trip at all** and are defensibly
  not-in-service reds.
- One query covers the whole fleet:
  `routes(ids: ["HSL:1013", ...]) { gtfsId patterns { vehiclePositions { vehicleId } } }`
  with the 31 indexed tram route ids as `ids`. Measured: HTTP 200, **6.8 KB,
  52-63 ms**, 78-79 vehicles matched, **0** vehicle claimed by two routes.
  Request body 524 bytes. `routes` has no `mode` argument (GraphQL rejects
  it), and the unfiltered `routes { patterns { vehiclePositions { vehicleId } } }`
  is 78.3 KB (515 routes), so the indexed-id form is the cheap one.
- `vehiclePositions { vehicleId }` is the HFP identity as
  `HSL:<operator>/<vehicle>` (unpadded), the same form TV-0020 already uses
  (`liveVehicleId` in `src/lib/journey.ts`).
- The 31-route index includes `HSL:1001H` ("1H"), `HSL:100H` ("H"),
  `HSL:1007` ("7") and `HSL:1010B` ("10B"), so every matched route resolves
  to a displayed line by construction - as long as the query asks only for
  the index's own keys.

Decision (user, 2026-09-25, "yes implement option a, document, then merge and
push"): a vehicle's line is resolved from the **Routing API's live-trip
match** when its HFP route id is not a GTFS route id, and it is red only when
the API reports no live trip for it. Options B (keep red, document) and C
(derive the line from `desi`/id-prefix, no request) were rejected: B keeps a
known-wrong user-visible state, C invents a line for depot runs (it would
paint the three Ruskeasuo depot runs as in-service "H" and the `1009TX` test
run as "9").

## Requirements

1. Line resolution order is exactly: (a) `resolveTramShortName(index, routeId)`
   (unchanged, TV-0011); (b) else the live-trip match's route, resolved
   through the same index; (c) else null (red dot). No other input may decide
   a line - not `desi`, not the route-id string's shape, not the HFP `line`
   field, not `dir`.
2. The live-trip map comes from **one GraphQL query per session**
   (`routes(ids: [<the index's keys>]) { gtfsId patterns { vehiclePositions { vehicleId } } }`),
   cached in `src/lib/digitransit.ts` next to the existing per-session caches,
   keyed by the app's own vehicle identity `vehicleKey` (`"40/461"`, the
   `HSL:` prefix stripped; documented), valued by the route `gtfsId`. It must
   be asked for only when the index cannot resolve the vehicle's route id, so
   a session whose fleet resolves entirely from the index issues no query at
   all.
3. The map page (`src/hooks/useTramPositions.ts`): while at least one vehicle
   in the snapshot is unresolved, the live-trip map is kept fresh - at most
   one request in flight, at most one request per 60 s per session, none while
   the tab is hidden (the existing pause rule), and a failure changes nothing
   user-visible (the previous map stays, the vehicle stays red) but is logged
   once with its reason; a failed fetch must stay retryable (no permanent
   failure cached).
4. The vehicle overview (`src/hooks/useVehicleTelemetry.ts`) uses the same
   match for both the displayed line and the pattern query: when the raw route
   id resolves to no line, `loadRoutePatterns` is called with the matched
   route id, and the view exposes which route id the query used so
   `PatternNote` (`src/components/vehicle/VehicleOverview.tsx`) never names a
   route the query did not ask about. TV-0020's pattern *selection* is
   unchanged; a matched route's patterns resolve exactly through the existing
   `vehiclePositions` live-trip match.
5. The marker popup debug readout (TV-0016, `src/map/TramMarkerPopup.ts`) shows
   the live-trip input as its own rows and distinguishes four states: not
   consulted (the raw route id resolved in the index), matched
   (`HSL:1007` / route 1007 / line 7, with the age of the live-trip map),
   no live trip reported for this vehicle, and lookup unavailable with the
   failure reason. Its one-line verdict must separate "not a GTFS route id but
   on a live trip of line N" from "not a GTFS route id and the API reports no
   live trip".
6. Nothing else changes: the marker rendering logic (`TramMarkers.ts`) keys on
   `routeShortName` only, the red-dot legend label and the marker tooltip
   ("Not in service - ...") stay as they are, TV-0021's removed occupancy
   surface stays removed, TV-0020's inferred-pattern labelling stays, and no
   file's behaviour changes beyond the resolution rule above.
7. Session-only state: no `localStorage`/`sessionStorage`/IndexedDB/cookie,
   no new npm dependency (`package.json` unchanged), and the API key is never
   printed or committed (the existing `graphQlRequest` error messages are
   reused as-is).
8. Documentation: `Docs/ADR/0002-data-transport.md` gains an amendment
   (Status: Accepted, user decision 2026-09-25) recording what a red dot now
   asserts, the chosen option, the rejected options and why, the measured
   query facts, and the revisit condition; `Docs/digitransit.md` gets the
   matching rule in its out-of-service paragraph and the new query in its data
   table and API-load statements. Code stays the owner of the exact rule.
9. `PLAN.md` records TV-0022 as open while it is in flight (status line and
   the open-work table).

## Acceptance

1. **Live before/after classification** (the core evidence): a probe that
   merges ~60 s of `/hfp/v2/journey/ongoing/vp/tram/#`, computes both the
   old rule (index only) and the new one, and prints per vehicle the raw route
   id, `desi`, the matched GTFS route, the resulting line, plus totals
   (vehicles, red before, red after, recovered). Pass: every vehicle whose
   index lookup fails and which the live-trip query matches becomes green with
   the matched line, and no vehicle the query does not cover changes. Evidence:
   the script and its raw output, with the window's timestamp.
   Honest-fallback rule: if the window happens to contain no unresolved
   vehicle (the observed rate on 2026-09-25 21:45 was 10 of 82 per ~2 min;
   `1001H*`/`1007 *` are the families to look for), repeat the window up to
   three times and report the observed counts. If the live match cannot be
   observed for a specific vehicle, a recorded raw route id may be replayed
   against the API's `routes(ids:)` answer only if the substitution is
   DISCLOSED as a replay of captured data, never implied to be live.
2. **Browser evidence on the built app** (headless Chrome + CDP, the local
   build and then the deployed site): for every live `.tram-marker`, open its
   popup (the debug readout is the diagnostic) and record the vehicle key plus
   the verdict text, and record each marker's `--offline` class. Pass: (a)
   every vehicle the acceptance-1 probe predicts green is green and its popup
   verdict names the live trip when that is what resolved it; (b) every
   vehicle it predicts red is red; (c) the reported vehicle 461, if live,
   shows line `1H` (via `HSL:1001H`) and no red dot; (d) the raw route ids
   `1001H5`/`1001H6`/`1007 9` never appear as a red dot while the API matches
   their trip. If 461 is not live in the window, the probe names the vehicles
   it did observe and the miss is DISCLOSED.
3. **Vehicle page**: `index.html#/vehicle/40/461` (or whichever live vehicle
   the probes report on a suffixed route id) renders the stop sequence (the
   spine, or an inferred variant with its note) instead of the "returned no
   trip patterns for route ..." note, and any note that names a route names
   the route that was queried. Evidence: the captured DOM/notes and the
   screenshot per the `reports/*.html` handover convention.
4. **Cost and laziness**, evidenced by CDP network monitoring over a window
   that contains an unresolved vehicle: at most one request to
   `api.digitransit.fi/routing/v2/hsl/gtfs/v1` per 60 s beyond the two
   existing per-session queries, and none at all in a window where every
   vehicle's route id resolves. Request/response size and duration reported.
5. **Failure path**: a Node probe that calls the loader with an invalid key
   asserts it rejects (HTTP 401 -> `MissingApiKeyError`), that the failure is
   not cached (a later call with the real key succeeds), and that
   `resolveLiveTramTrip` still answers (from the previous map or as "not
   fetched") instead of throwing. Telemetry must remain unaffected: the
   browser probes' console shows no uncaught error.
6. **Standard checks**: `npm run lint`, `npm run format:check`,
   `npm run build` green; `package.json` unchanged; `dist/` deleted after
   verification; the API key never printed, never added to a tracked file, and
   any probe output redacted.
7. **Documentation check**: the ADR-0002 amendment and `Docs/digitransit.md`
   describe the rule that the code implements (no claim the code does not
   make, and no code behaviour missing from the docs), and the task is
   deleted from `Tasks/` and `PLAN.md` only after the merged and deployed
   verification, by the coordinator.

## Notes

- Serialized writes per AGENTS.md: this task touches both hooks, the popup and
  three documents, so it is one branch, not a parallel wave.
- The live-trip map is a point-in-time snapshot; the 60 s freshness rule (3)
  exists because a vehicle that starts a trip later must be able to go green
  without a page reload.
- A vehicle may publish a suffixed id for its whole shift, so "the map gets
  fresher" is not an alternative to the fallback itself.
- The user instruction ("implement option a, document, then merge and push")
  authorizes the merge; the standing AGENTS.md rule still requires a reviewer
  PASS on the branch tip and a review of the merge delta.
