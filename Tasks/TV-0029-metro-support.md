---
id: TV-0029
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

# Metro trains on the map: the M1/M2 feed, markers, and popup

The user's 2026-10-12 request: metro trains on the same map, same source,
with the rolling-stock classes mapped from vehicle numbers. The
coordinator researched this live on 2026-10-12 (every fact below was
measured against the real HSL feeds and the Routing API today, with the
observation scripts in
`/private/var/folders/fm/s5563fhj3hqb228904nfwdfw0000gn/T/opencode/tv0029-research/`
- ephemeral, not committed; the facts are transcribed here and in
`Docs/digitransit.md`).

## What is true now (live-verified 2026-10-12)

**Feed.** Metro rides the **same MQTT broker** (`wss://mqtt.hsl.fi:443/`)
with the same topic shape at `mode` = `metro`:
`/hfp/v2/journey/ongoing/vp/metro/<oper>/<veh>/<route>/<dir>/<headsign>/<start>/<nextstop>/<geohash...>`
- 19 topic levels, identical structure to tram. The wildcard filter
  `/hfp/v2/journey/ongoing/vp/metro/#` is one subscription; measured
  ~40 raw msg/s (vs trams' ~380-400/s), ~2.6k msgs over 60 s. A separate
  sub-filter per line is unnecessary; the single metro wildcard is the
  right unit.

**Payload.** Same `VP` shape as tram with **one extra field**: `seq` (=1,
always, in every sample - a train-set/convoy id, not the car index; the
M100/M200 two-car and M300 four-car sets are permanently coupled and
publish as **one** vehicle: one topic, one identity, one position. No
coupling data exists to render). Field behavior measured over ~2.6k vp
messages:
- `oper` = 50 (HSL metro) always; `veh` = 109..325, always inside the
  user's ranges (no out-of-range in the live window);
- `route` = `31M1` / `31M2` only (the B variants never appeared live);
  `desi` = `M1`/`M2` (line label), `dir` = 1/2;
- `dl` = **null in 100% of samples** (metro publishes no schedule
  deviation on this stream), `drst` = null (no door events on vp - metro
  door state is unknown from this feed), `odo`/`acc` = null,
  `occu` = 0 (as on tram), `loc` = `MAN`;
- `spd`, `hdg`, `lat`, `long`, `tst`, `tsi`, `oday`, `start`, `stop` all
  present and same semantics as tram; headings cluster per direction as
  expected;
- `line` is **metro noise**: a per-vehicle small integer (1-34) that is
  constant per vehicle per day but unrelated to M1/M2 (e.g. veh 115
  reports line 3 while running 31M1; veh 123 reports 26 on 31M2). Not a
  metro line id. Do not use it for anything (it is also not the tram's
  `line` semantics - the tram side ignores it today too).

**Next stop.** The topic's level-13 next-stop id is present on **100%** of
metro vp topics (unlike tram's ~49% payload coverage; on metro the payload
`stop` is null in ~56% of messages). When both are present they agreed in
670/701 samples (95.5%) and the mismatches never resolved within a 60 s
window (the topic level appears to lead the payload by one stop event) -
so the topic level is the metro truth, inverted priority vs tram
(payload first, topic fallback). The existing `nextStopId` precedence
(payload wins, topic fallback) should be **inverted for metro**.

**Routing API.** The tram-side GraphQL shapes work unchanged:
`routes(transportModes: [SUBWAY])` returns 4 routes - `HSL:31M1`
(Kivenlahti - Vuosaari, 2 dir patterns), `HSL:31M2` (Tapiola -
Mellunmäki, 2 dir patterns), plus the short-turns `HSL:31M1B`
(Itäkeskus - Vuosaari) and `HSL:31M2B` (Itäkeskus - Mellunmäki), 1 pattern
each, no live vehicles in the window. Full metro geometry: 8 patterns,
3946 points, ~134 KB. Pattern `vehiclePositions` match the live feed:
`vehicleId` is `HSL:50/<veh>` (24/25 matched a live veh in one window;
the 1 miss was a vehicle between runs). The per-vehicle trip timetable
rides the same shape the tram ETA already consumes
(`patterns.vehiclePositions.vehicleId.trip.stoptimes`) - metro trips
named `HSL:31M2_20261009_Ma_1_1300` etc., and their trip-id dates ran 3
days behind the running day (same TV-0026 quirk as trams - the ETA's
day-anchor logic already handles this and is reusable as-is).

**Rolling stock (user-supplied ranges, corroborated live).** M100 =
101-184, M200 = 201-224, M300 = 301-325. Live window: 18 M100, 4 M200,
13 M300, 0 outside the ranges. `seq` is always 1 - the coupled set is one
unit; car count is a **static property of the class**, not feed data
(M100/M200 = 2 cars, M300 = 4 cars).

## Requirements

1. **One more subscription.** The map page opens a second HFP subscription
   on `/hfp/v2/journey/ongoing/vp/metro/#` alongside the tram one - the
   same `subscribeMqtt` client, one more WebSocket connection (measured
   combined: still tiny vs the tram stream). The vehicle overview keeps
   its own tram-only scoped filter; a metro vehicle's overview is out of
   scope for this task (the popup link can still navigate, the overview
   just keeps working as a tram overview - see requirement 9).
2. **One snapshot, two modes.** `useTramPositions` (or a sibling hook)
   extends the snapshot with metro positions: same `TramPosition` shape
   plus a `mode: "tram" | "metro"` field (new; trams default to "tram").
   The route index gains the metro routes: the keyed
   `loadTramRouteIndex`-style query filters `transportModes: [TRAM,
   SUBWAY]` (or a second SUBWAY-only index; either is fine - pick one,
   one request either way). Resolution order per vehicle: its own route
   id through the index (metro: `31M1`/`31M2` -> M1/M2), else the
   live-trip match (the TV-0022 mechanism works identically for metro -
   the live trips query already spans both modes via
   `vehiclePositions`), else red dot. The `31M1B`/`31M2B` patterns are
   in the index (their gtfsIds resolve) and draw nothing special: a
   vehicle reporting `31M1B` renders as M1 with the short-turn's headsign.
   **Amended (TV-0029 review round 2026-10-12, blocking finding 1):** the
   index's line-name filter is per mode - a TRAM route needs a tram short
   name, a SUBWAY route needs a metro one (M + digits + optional letter,
   isMetroLineShortName in digitransit.ts); the tram filter alone admits
   no metro short name, which is what kept the metro routes out of the
   index in the first cut.
3. **Markers.** Metro markers are the existing teardrop, labeled with the
   line (`M1`/`M2` from the resolved shortName) and colored by class:
   **M100 = a distinct blue** (`#0072bc`, HSL metro line blue), **M200 =
   the same blue** (class is not color-coded - see below), **M300 = the
   same blue**; the class distinction is not color (three shades would be
   indistinguishable at this scale) but the marker's tooltip: the full
   model name on hover (`M100 (Rotary DC)`, `M200 (C20)`, `M300 (R320)`)
   plus car count. Marker identity (`oper/veh` via `vehicleKey`) already
   collides-proof (metro oper 50 never overlaps tram opers).
   Out-of-service metro (no resolved route) renders the red dot like
   trams.
   **Superseded 2026-10-12 (user decision, routed by the coordinator):**
   the metro color is HSL's official metro orange, `#F15F22` - one hue for
   all three classes (the class distinction stays the tooltip, not the
   color); the blue above is the superseded original.
4. **Popup.** The HUD popup gains no new cells beyond what the data
   carries: speed, next stop (topic level, inverted precedence for
   metro), headsign, line badge (M1/M2). ETA cell: **dash for metro** in
   this task - the timetable pipeline is reusable (the trip match works)
   but wiring the ETA for metro is its own decision (the popup's ETA is
   tram-tuned; the metro timetable's stop-time anchoring deserves the
   same TV-0026 treatment before it prints numbers). Deviation cell:
   **hidden for metro** (`dl` is always null - the cell would be a
   permanent dash; hiding it is more honest than showing a dash).
5. **Strip/legend.** The status strip gains one always-on chip:
   `●N Metro` (the metro live count), placed after the tram category
   chips, before Not-in-service. The chip count counts metro vehicles
   from the snapshot (any class). No per-class metro chips (the classes
   are not color-coded; a count chip per class is noise). The sum check
   extends: tram chips + metro chip + offline (both modes) partition the
   snapshot.
   **Amended (TV-0029 review round 2026-10-12, blocking finding 2):** the
   Metro chip counts resolved metro with a known class only; the
   Not-in-service chip counts every red-dot vehicle of both modes -
   unresolved routes, plus metro of unknown class (requirement 8's rule
   also feeds the chip, so the chip counts what the map shows). The exact
   partition: tram category chips (resolved trams by class) + Metro chip
   (resolved metro, known class) + Not-in-service (all unresolved vehicles
   of both modes, plus unknown-class metro, minus SpåraKoff) + SpåraKoff
   (its own identity) = the snapshot total; every vehicle tallies exactly
   once.
6. **Heatmap.** Metro contributes **nothing** to the punctuality heatmap:
   `dl` is always null so the existing contributing rule (requires
   non-null `dl`) already excludes metro - no change, but the exclusion
   is stated in the heatmap's comment and the docs.
7. **Overlay.** The tram line overlay gains metro geometry as a second
   toggleable layer (`TO` button's group may need a third label, or the
   overlay button becomes the combined "lines" toggle - **decision:
   one toggle for all route lines**, label stays `TO`): the overlay
   loads metro geometry in the same per-session request pattern
   (`routes(transportModes: [SUBWAY])` appended to the tram overlay
   request or a sibling request; one request per session either way).
   Metro lines draw with the metro's own rendering (HSL metro is dark
   blue/gray on the map's own style - pick a color that reads on the
   hsl-map basemap and record it; casing under the metro lines mirrors
   the tram casing).
   **Superseded 2026-10-12 (user decision, routed by the coordinator):**
   the color is the same metro orange `#F15F22` as the markers (recorded
   in constants.ts's `METRO_LINE_COLOR`), superseding the "pick a color"
   wording above.
8. **Icons/colors constants.** The metro class lookup mirrors
   `fleet.ts`: ranges 101-184 -> M100, 201-224 -> M200, 301-325 -> M300,
   else unknown (red dot, honest "Unknown type" tooltip). All constants
   in a new `src/lib/metro.ts` (or fleet.ts extended - pick per repo
   convention; fleet.ts is tram-specific today, so a sibling module
   matches).
9. **Vehicle overview.** The overview page stays tram-only: a metro
   vehicle's popup link navigates to `#/vehicle/50/<veh>`, and the
   overview's scoped subscription is tram-filtered - which returns
   nothing for a metro vehicle. This task makes the overview show its
   honest empty state for metro (the tram-scoped stream simply has no
   data); **extending the overview to metro is explicitly out of scope**
   (a follow-up if the user wants it).
10. **Docs.** `Docs/digitransit.md` gains the metro section: the topic
    shape, the field facts (dl/drst null, occu 0, seq always 1, `line`
    is noise), the next-stop precedence inversion, the class ranges, the
    ~40 msg/s rate, the request profile (one more subscription + the
    SUBWAY index/geometry requests), the popup deviations (no deviation
    cell, ETA dash), and the overview limitation.

## Acceptance

1. `npm run lint`, `npm run format:check`, `npm run build` green; `dist/`
   deleted; no `package.json` change.
2. **Manual review on the dev server (the human gate):** metro trains
   visible on the map as orange (#F15F22, the amended color - the
   original text said blue) teardrops with M1/M2 labels, moving along
   the metro corridors; the popup opens with line badge, vehicle key
   (50/veh), GTFS key (HSL:31M1/M2), headsign, speed, next stop;
   deviation cell absent; ETA dash; the strip's Metro chip counts match
   the visible resolved-and-known-class metro markers; the heatmap is
   unchanged by metro; toggling the lines overlay off removes the metro
   lines too; toggling the heatmap off does not affect metro markers.
   **Amended (TV-0029 review round 2026-10-12, blocking findings 1-3):**
   metro routes enter the index (the metro short-name filter), the Metro
   chip counts only resolved metro with a known class, and an
   unknown-class metro vehicle renders the red dot - the Not-in-service
   chip counts every red dot on the map.
3. The reviewer may assume checks green (the flow) and judges the diff
   against requirements 1-10 code-only.
4. Request discipline: exactly one new WebSocket (the metro
   subscription) and at most one new GraphQL request (the metro index or
   geometry addition - if the index query adds SUBWAY it stays one
   request; if metro geometry is a separate request, one more). No new
   tiles. The tram subscription and all existing requests unchanged.

## Notes

- The `nextStopId` precedence inversion is metro-specific: keep the tram
  behavior unchanged (payload first, topic fallback); the inversion
  applies where the snapshot builder resolves a metro position. The
  mismatch measurement (670/701 agree; the 31 disagreements all flipped
  within a few seconds) supports the topic level being newer on metro.
- The user asked "what other data might be exposed" - the honest answer
  from the live stream: door state, occupancy, odometer, acceleration and
  schedule deviation are all null on metro vp; the stop events (`due`,
  `arr`, `dep`, `pde`, `pas`) that carry tram timetable fields were
  **never observed on the metro topics in 45 s of observation** (vp only,
  1936 msgs) - so metro has no timetable event stream on this MQTT feed,
  only the Routing API's static timetable. If the user wants metro door
  state or capacity, the feed does not expose it today; say so rather
  than inventing.
- Marker color: **Superseded 2026-10-12 (user decision)** - the color is
  HSL's official metro orange `#F15F22` for all three classes (see the
  requirement 3 amendment); the class distinction stays the
  tooltip/vehicle number, and per-class color remains a one-constant
  change per class at review.
- The popup's vehicle-key row shows `50/<veh>` for metro (same format);
  the GTFS key shows `HSL:31M1`/`HSL:31M2` as resolved.
- Merge order: none required (this task and TV-0024 touch different
  areas of `digitransit.ts`; TV-0024 removes dead code, TV-0029 adds
  live code - if they collide in review, the coordinator serializes).

## Handoff (2026-10-12, to REVIEW)

- Branch tip at handoff: see the commit record (pushed to
  `bb/worker-tv-0029-metro-support-thr_ee5b9d3bbffd4pWv`).
- Checks: `npm run lint`, `npm run format:check`, `npm run build` all green;
  `dist/` deleted after the build; `package.json` untouched.
- Key findings and decisions the reviewer should read the code against:
  1. The route-index query (`TRAM_ROUTES_QUERY`) carries **no**
     `transportModes` filter - it already returns every mode - so the metro
     routes (HSL:31M1/M2/M1B/M2B, shortNames M1/M2/M1B/M2B, verified against
     the live API before coding) now enter the index through
     `buildTramRouteIndex`'s admission filter (`TRAM` or `SUBWAY` + the
     per-mode line-name filter; the metro side is `isMetroLineShortName`,
     added in the review round - the original text wrongly credited the
     tram filter, which admits no metro short name), keeping the request
     profile at exactly one metadata request per session.
  2. `resolveLiveTramTrip` is **not mode-scoped**: its query asks for the
     indexed routes' `patterns.vehiclePositions` only, so widening the index
     to the metro routes extends the live-trip match to metro with no query
     change - the metro vehicles resolve index-first, live-trip second, red
     dot last, through the same mechanism.
  3. The overlay geometry query was widened in place
     (`transportModes: [TRAM, SUBWAY]`) - still one request per session; the
     overlay draws metro patterns with `METRO_LINE_COLOR` (#F15F22, the
     amended orange - this handoff's earlier text said #0072bc) under the
     shared white casing, keyed off `TramRouteGeometry.mode`.
  4. The metro next-stop precedence inversion lives in the snapshot builder
     (per-mode branch on `latest.mode`); the shared subscription helper in
     hfp.ts tags each parsed position with its subscription's mode, so the
     tram path's behavior is unchanged (payload-first).
  5. Status logic: live when either socket is connected; a metro-only error
     is logged, never shown as an app error. **Amended (TV-0029 review
     round 2026-10-12, blocking finding 4):** the error state follows the
     combined connection - either socket connected -> live, error null;
     neither connected and a stream error recorded -> error with it;
     otherwise connecting. A partial outage (one feed down) keeps the
     strip live; the down feed's markers age out after
     POSITION_STALENESS_MS, and the metro handler warns once per outage.
  6. The Deviation cell is omitted (not a dash) for metro popups; the Doors
     cell spans the row. ETA renders the muted dash via the existing
     scheduleDeviation-null path.
  7. The vehicle overview is untouched (requirement 9): it keeps its
     tram-filtered subscription and shows its empty state for a metro id.
- Known limitations: none new beyond the task's stated ones (no metro ETA
  numbers, overview tram-only).
- Decision requested: none - no STOP-DECISION was needed; every change
  followed the task's stated decisions and ADR amendments.
