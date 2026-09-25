---
id: TV-0020
status: REVIEW
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

# Resolve the vehicle overview's stop sequence from the vehicle's live trip

User report (2026-09-25, live): on **line 5** the vehicle overview shows
**raw stop ids** in the header and the "Stops on this line" card says
"next stop is not in this pattern". Example: vehicle `40/641`, which the HFP
stream reports as `dir=2`, headsign `Jätkäsaari`, next stop `1040411`
(Simonkatu) - a stop the pattern the app picked does not contain.

Cause, reproduced live: `src/lib/digitransit.ts` (`fetchTripPattern`, TV-0017)
selects the pattern with
`patterns.find(candidate => candidate.directionId === directionId)`, i.e. **the
first pattern the API happens to return with that `directionId`**. Almost every
tram route has several patterns per direction (short-turn and service
variants), so that pick is arbitrary:

- `HSL:1005` has **4 patterns and `directionId` 1 appears three times**:
  8 stops -> `Katajanokan term.` (what the app picked for the reported
  vehicle), 11 stops -> `Jätkäsaari`, 18 stops -> `Jätkäsaari`. The 8-stop
  pattern does not contain Simonkatu, while the vehicle's real trip (the
  18-stop `Jätkäsaari` pattern) does. On line 5 one `directionId` group even
  contains a pattern heading the opposite way.
- The same arbitrariness is present on many other routes but is silent,
  because all candidates contain the reported next stop and only the number of
  stops / the passed-prefix differ: `HSL:1001` has `directionId` 0 patterns of
  27, 26 and 11 stops and `directionId` 1 patterns of 17, 16, 27 and 26 stops
  (verified live), `HSL:1007` has 32/30/6 and 31/29/24.

Authoritative replacement (probed live 2026-09-25, 2 runs of ~75 s over the
whole live tram fleet): the Routing API exposes, per pattern,
`vehiclePositions { vehicleId }`, where `vehicleId` is exactly the HFP
`operator/vehicle` identity as `HSL:<oper>/<veh>` (unpadded numbers, e.g.
`HSL:40/641`). OTP performs the HFP-to-trip matching itself, so this maps each
running vehicle to the pattern of the trip it is actually on:

- 83-84 of 85-86 live vehicles were claimed by **exactly one** pattern
  (multi-claim: 0), and the resolved pattern contained the reported next stop
  in 82-84 cases (the remainder are seconds-old HFP/OTP skew).
- The reported vehicle `40/641` resolves to the **18-stop `Jätkäsaari`
  pattern** - the one that contains Simonkatu.
- Query cost: ~3-5 KB for line 5, ~28-38 KB for line `H` (44 patterns);
  the same query as today plus the `vehiclePositions` field.

The old rule's supporting claim in the ADR 0002 amendment ("every observed
`dir`/headsign pair matched `directionId + 1`/headsign", verified on 12
routes) only checked that a matching `directionId` group *exists*; it never
checked that it is unique, which is why the defect was not caught.

## Requirements

1. Selection of the overview's pattern is per **vehicle and live trip**, not
   per (route, direction): query one route's patterns *with*
   `vehiclePositions { vehicleId }` and pick the pattern whose
   `liveVehicles` contains the vehicle's own `HSL:<oper>/<veh>` id. This is
   the only selection that may be presented as exact.
2. When the API reports no live trip for the vehicle (or before the first
   message), fall back to a deterministic, ordered narrowing of that route's
   patterns. Order: `directionId === Number(dir) - 1` -> headsign containment
   (either string contains the other, case/punctuation-insensitive; the HFP
   topic abbreviates, GTFS does not) -> containment of the reported next stop
   -> **longest** candidate, first candidate as the final tie-break. The
   fallback is an inference and must be labelled as one in the UI.
3. The headsign may be used **only** inside that fallback as a filter, never
   as the primary selector, and a headsign that matches nothing must leave the
   candidate set unchanged (fall through to next-stop/longest).
4. The query stays one request per **route** per session, cached, and
   retryable after failure (a failed promise must not be cached); it must not
   be re-issued per direction, per snapshot or per next-stop change.
5. No new dependency, no `package.json` change, no change to the key
   discipline (ADR-0003): the key is never printed, logged or committed.
6. Honest UI: the stop-sequence card shows how the pattern was chosen (exact
   live trip vs inferred, and which filters narrowed it). The existing
   "reported next stop is not in this pattern" note stays for the genuine
   case (the chosen pattern really does not contain the reported stop) and the
   header's raw-stop-id fallback stays for a missing pattern.
7. Documents updated with the corrected rule and its evidence: the ADR 0002
   amendment (replace the disproven "first pattern with that `directionId`"
   statement, keep the `dir`/`directionId` 0-based mapping, record the
   live-trip resolution and the measured numbers) and `Docs/digitransit.md`
   (query row + selection paragraph). The public-contract rule that a failed
   pattern query never blocks telemetry is unchanged.
8. Untouched: the HFP stream, telemetry fields, the event log, the map page,
   `describeJourney`'s behaviour for a genuine miss, marker/popup behaviour,
   `MAX_MAP_ZOOM` and the TV-0018 basemap.

## Acceptance

1. `npm run lint`, `npm run format:check`, `npm run build` green; `dist/`
   deleted afterwards; `git grep` for the key value finds nothing outside the
   untracked `.env.local`; no `package.json` change.
2. **Selector harness (honest substitution where live data cannot be
   forced):** because the fallback path cannot be triggered on demand live,
   the pure selector is run directly from a Node script against fixtures
   captured from the live API (one route with a hostile `directionId` group:
   `HSL:1005`; plus one with near-duplicate variants: `HSL:1001`). The script
   must show, for the reported vehicle `40/641`, that the exact branch picks
   the 18-stop `Jätkäsaari` pattern, and that with the live trip removed the
   fallback picks a pattern that still contains the reported next stop. The
   report states the fixture provenance and that this is a code-level check.
3. **Live verification on the dev server** (dev server + a real vehicle page
   for line 5, read through headless Chrome's DOM): for at least two line-5
   vehicles of different directions, the "Stops on this line" card renders a
   spine (not the `PatternNote`), the vehicle header shows a stop **name**
   (not a bare id), and the card carries no "not in this pattern" note while
   the stream's reported next stop is in the resolved pattern. The evidence
   records the vehicle ids, the direction/headsign/dir next stop from the
   stream, the number of stops rendered and the chosen-pattern label.
4. Network evidence from that session: the page issues the pattern query once
   per route (count the requests on `api.digitransit.fi`), the query text
   contains `vehiclePositions`, and no request repeats after the pattern
   resolves across snapshots and pan/zoom-free idle time.
5. Regression on the same session: telemetry grid, event log, delta chart,
   doors, TLP, staleness and the map page's panel/popup behave as before, and
   a vehicle whose route has no pattern in either selection path still shows
   its telemetry with the honest unavailable-pattern note (code-level fallback
   check acceptable if the live case cannot be observed; disclose it).
6. The measured live-trip resolution numbers from the implementation run are
   recorded in the ADR amendment and the handoff, including the residual
   disagreement rate (resolved patterns whose stop list lacks the stream's
   reported next stop) and the fallback's agreement rate with the live trip.
7. A missing or rejected key still degrades gracefully (no crash, the
   unavailable-pattern note) - unchanged from TV-0017/TV-0018 behaviour.

## Notes

- HSL:1005 `longName`: "Jätkäsaari - Ruoholahti - Päärautatieas. - Katajanokan
  term."; on line 5, `dir` 1 is Katajanokka-bound and `dir` 2 Jätkäsaari-bound
  (HFP topic `dir` is 1-based, `directionId` 0-based).
- The line-name variants the Routing API returns for one route (`10B`, `1T`,
  `5H`, ...) are the app's `isTramLineShortName` concern (TV-0011), not this
  task's; this task only fixes which pattern of a route is shown.
- Consequence to keep in mind for TV-0019: the overlay will draw every pattern
  of a route, so the overview's per-vehicle pattern choice and the overlay's
  variant policy must not be read as contradicting each other.
- HFP probe scripts (not repo files): `/tmp/tv-livetrip-probe.cjs`,
  `/tmp/tv-pattern-probe.cjs`; samples recorded in the ADR amendment.
- Verification scripts (not repo files): `/tmp/tv0020-selector.mjs`
  (selector + loader harness, writes `/tmp/tv0020-fixtures.json`),
  `/tmp/tv0020-verify.cjs` (live DOM/CDP check).

## Handoff (status: REVIEW → DONE — optional, delete before merge)

Outcome: fixed and verified; the branch is ready for the coordinator's merge
(no independent reviewer ran - see "Known limitations").

What changed

- `src/lib/digitransit.ts`: `loadTripPattern(routeId, direction)` replaced by
  `loadRoutePatterns(routeId)` - the query now asks for **all** patterns of a
  route plus `vehiclePositions { vehicleId }`, is cached per route per
  session, resolves to `[]` for a route with no patterns and still clears its
  cache entry on failure. `TripPattern` gained `liveVehicles: string[]`.
- `src/lib/journey.ts`: new pure `selectTripPattern(patterns, criteria)` +
  `liveVehicleId(operatorId, vehicleNumber)`; the rule is documented on the
  function. Live-trip match -> exact; otherwise direction -> headsign
  containment -> next-stop containment -> longest candidate, with the filters
  that actually narrowed reported back to the UI.
- `src/hooks/useVehicleTelemetry.ts`: the pattern query is keyed on the route
  and the pattern is **derived** per snapshot (`useMemo`), exposing
  `patternSelection`; `patternStatus` keeps its meaning.
- `src/components/vehicle/JourneySpine.tsx` + `VehicleOverview.tsx` +
  `src/index.css`: an inferred pattern is labelled (amber pill + note); the
  "not in this pattern" note and the bare-id fallback stay for the genuine
  case; the missing-pattern note now names the route and the direction case.
- `Docs/ADR/0002-data-transport.md`: the amendment's "Additional keyed
  GraphQL query" section corrected (query per route, live-trip resolution,
  the measured numbers, the corrected headsign rule) and the amendment's
  status line points at TV-0020; `Docs/digitransit.md`: query row + a
  "which pattern of the line is shown" bullet.

Evidence (2026-09-25, live)

- Selector harness against live patterns + live HFP (`node
  /tmp/tv0020-selector.mjs 60`): 78 of 84 live vehicles resolved by their own
  `vehiclePositions` entry; **no** vehicle claimed by two patterns; 78/78 of
  those patterns contain the stream's reported next stop; the fallback always
  returned a candidate and agreed with the live-trip truth for 74%; the old
  rule (first pattern with that `directionId`) failed to contain the reported
  next stop for 13/79 vehicles (16.5%). Line 5: `HSL:1005` = dir1
  "Katajanokan term." 8 stops | dir0 "Katajanokan term." 17 | dir1
  "Jätkäsaari" 11 | dir1 "Jätkäsaari" 18. Requests: 1 per route, all
  `RoutePatterns` + `vehiclePositions`, HTTP 200, cached on the second call.
- Live page check on the fixed build (`node /tmp/tv0020-verify.cjs
  http://localhost:5199/tram-view/ /tmp/tv0020`): 40/452 (dir 1) -> next stop
  "Ruoholahden villat", 17 stops; 40/640 (dir 2) -> "Päärautatieasema", 18
  stops; no "not in this pattern" note, no inferred pill, spine's next/terminus
  row equals the hero, 1 `RoutePatterns` request for the whole session over two
  vehicle pages (route 1005), no console error. An earlier run captured the
  reported vehicle **40/641** with its next stop named.
- Before/after on the same route with a worktree of the pre-fix tip
  `fbdf528` (`/tmp/tv0020-before`, port 5202): 40/643 (dir 2) showed the
  reported symptom - next stop "stop 1201402", the "not in this pattern" note
  - while the fixed build resolved the same line correctly.
- Inferred-path render check on a **scratch copy** (patcher outside this task's
  diff: `/tmp/tv0020-inferred`, port 5201, `EXPECT_INFERRED=1`): the amber
  "inferred pattern (direction + headsign + next stop)" and "(direction)"
  pills plus the explanatory note rendered for two line-5 vehicles, both still
  with a named next stop. Disclosed as a patched scratch build, not the
  shipped code.
- `npm run lint`, `npm run format:check`, `npm run build` green (build output
  433.61 kB JS / 30.07 kB CSS); `dist/` deleted; no `package.json` change; the
  key appears in no tracked file (checked with `git grep` and ripgrep).
- Screenshots for the human: `reports/tv0020-vehicle-page.html` (+ `reports/tv0020/`)
  in the thread storage.

Known limitations

- No independent reviewer ran (bb addendum: no unsolicited thread spawning).
  The coordinator should either merge as verified or spawn a reviewer on the
  pushed branch tip.
- The pattern choice cannot be made exact for a vehicle the API reports no
  live trip for (observed: 1-10 of ~84 vehicles per run, typically seconds
  after a vehicle enters or leaves service). Those render as inferred.
- The `directionId`/`headsign` labels of line 5's patterns are mutually
  inconsistent (a `dir=2`/`Jätkäsaari` vehicle ran a pattern whose `headsign`
  is `Jätkäsaari` towards `Katajanokan term.`), so the fallback's headsign
  filter can narrow to a wrong variant when the reported next stop is in it;
  that is why the inference is always labelled.
- Live verification of the stream uses the broker's public topic; no key value
  was printed or stored by any script (query/tile URLs were redacted on
  capture).

Decision requested: none (the user asked for this fix). The ADR 0002
amendment was **corrected in place** rather than superseded by a new
amendment, on the reading that the acceptance intent is unchanged and only the
recorded mechanism was wrong - if the coordinator disagrees, the section can
be split into a TV-0020 amendment instead.
