---
id: TV-0026
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: ["TV-0025"]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Anchor the popup's ETA to the day the tram is running, and stop reporting a passed estimate as `0 s`

TV-0025 (merged `9d0a3f1`) gave the marker popup an ETA to the next stop. The
user then reported (2026-09-28) that some trams show `0` permanently, moving or
standing, especially line 5 vehicle #650. Diagnosis by the coordinator that day
found the tram reporting correctly and two defects in our model.

**The vehicle side is fine.** Over ~5 minutes on the raw HFP stream #650
reported moving positions (0 → 6.3 m/s), doors, a sane deviation (`dl` −13 s)
and agreeing next stops from the payload's `stop` field and the topic's
level-13 id (`1020402` Mikonkatu → `1080403` Tove Janssonin p. → `1080413`
Katajanokan term.).

**Defect 1 - the day the stop times are anchored to.** The API's live match for
#650 is trip `HSL:1005_20260925_Ma_1_1213`: service day **2026-09-25**, three
days before the running day the HFP stream reports (`2026-09-28`), while the
trip's own stop times (12:13-12:40) line up with the wall clock now.
`matchedTripTimetableInstant` anchors the stop time to the day component of the
trip's gtfsId, so the instant lands days in the past and `max(0, ...)` renders
the error as a confident `0 s`. The API offers no alternative: the feed has 70
of 105 live-matched trips dated `20260925` and 35 dated `20260928` (today has
instances only for lines 4, 4H, 7, 7H, 9, 9H, 9N, H, 10, 10H), and
`trip(id: "HSL:1005_20260928_Ma_1_1213")` does not exist at all - only
`..._20260925_Ma_1_1213`, with 17 stop times starting at 43 980 s (12:13).
Anchored to the operating day instead, #650's ETA is correct and ticking:
at 12:37:06 with next stop `1080413`, the trip's stop time 12:40:00 and
`dl` −4 s give an arrival of 12:40:04, i.e. **178 s** - not 0.

Measured by running the shipped functions in Node against live data
(`loadRoutePatterns` → `matchedTripTimetableInstant` → `etaSecondsToNextStop`):
#650 and #411 (line 5, trip day `20260925`) returned `0 s` on **420 of 420
samples** each, with the instant printing as `25/09, 12:46`; the control #457
(line 10, trip day `20260928`) returned a real countdown in the same runs.

**Defect 2 - the clamp hides a passed estimate.** A large positive `dl` alone
also pushes the corrected arrival into the past: #650 standing at `1080413` as
the origin of `HSL:1005_20260925_Ma_2_1246` reported `dl` +359 s, and line-10
#425 reported `dl` +119 s. `0 s` then claims "arriving now" when the timetable
says the tram should have been there minutes ago.

**Decision (user, 2026-09-28).** Show the muted `—` for a materially passed
estimate; show `0` only when the answer is genuinely 0.

## Requirements

1. **Anchor to the running day.** `matchedTripTimetableInstant` must resolve
   the matched trip's stop-time seconds against **both** candidate days - the
   day component of the trip's gtfsId and the current Helsinki date - and pick
   the candidate whose corrected arrival (candidate midnight + seconds × 1000 −
   `dl` × 1000) is nearest to `now`. Nearest-to-now is what keeps genuine
   post-midnight trips correct: a `25:30` stop time on yesterday's service day
   still resolves to today 01:30, because that candidate is nearer to now than
   tomorrow 01:30. `now` is passed in as a parameter rather than read inside, so
   the rule stays deterministic and testable.
2. **Only a genuine 0 prints as `0`.** `etaSecondsToNextStop` keeps returning
   `number | null` and must never return a negative value. It returns the
   rounded countdown when the corrected arrival is in the future (so `0` only
   when the arrival is within half a second of `now`), `0` when the corrected
   arrival is at most `ETA_PAST_TOLERANCE_MS` = 90 000 ms in the past (the tram
   is at or leaving the stop, where 0 is the true answer), and `null` - the
   existing muted `—` - when it is further in the past than that. The tolerance
   is one named, commented constant so it can be retuned in one line.
3. **The dash keeps its existing surface.** The muted class and the accessible
   explanation/title the popup already renders are unchanged, and the
   tolerated/untolerated cases must not be distinguishable as a wrong number:
   no negative value and no `0` for a materially passed estimate.
4. **No new request, no new stream.** The fix must not add a query,
   subscription, or timer: `loadRoutePatterns` stays the single per-route
   per-session load and the map keeps its one MQTT connection (`Docs/ADR/0004`
   decision 4).
5. **Nothing else changes.** The popup keeps its line badge, vehicle/GTFS keys,
   headsign, speed, doors, deviation, next stop and overview nav link, with the
   `Heading` cell still replaced by the ETA cell; the vehicle overview is
   untouched - it derives its estimate from HFP announcements
   (`estimateNextArrival`) and is not affected by this defect.
6. **Docs.** `Docs/digitransit.md` records the operating-day anchoring rule and
   the "0 only when genuinely 0, muted dash beyond the dwell tolerance" rule,
   replacing any text that describes the old single-day anchor or an
   unconditional clamp at 0.

## Acceptance

1. **Rule check, disclosed as a harness.** A Node harness that bundles and
   imports the **shipped** functions (`helsinkiMidnightMs`,
   `matchedTripTimetableInstant`, `etaSecondsToNextStop`) and feeds the real
   API response shape must show, with the commands and printed output reported:
   a trip whose id day is not today anchors to today's midnight
   (`instant === todayMidnight + seconds × 1000`); and `etaSecondsToNextStop`
   returns `null` for a corrected arrival 400 s in the past, `0` for 30 s in
   the past, and the rounded countdown for 200 s in the future, and never a
   negative value. This is a code-level harness, **not** a browser
   observation, and must be described as such - it is not a substitute for
   acceptance 2.
2. **Live verification on the affected line.** Dev server plus headless
   Chrome: on a line-5 tram (e.g. #650) the popup's ETA cell counts down across
   at least two consecutive next stops, and at one captured instant the value
   equals the trip's stop time (time-of-day on the running day) minus `dl`,
   with the arithmetic reported. Capture the before/after for the same vehicle:
   `0 s` before the fix, a real countdown after.
3. **Live verification of the muted dash.** Prove the materially-passed case
   renders `—` with the muted class and the existing title, not `0` - either on
   a live tram at its trip origin with a large positive `dl` (the #650
   `+359 s` case) or by injecting a stubbed response; state which was used. The
   change from `0 s` to `—` for that case is the evidence.
4. **A today-dated control line is not regressed.** On a line with
   `20260928` instances (e.g. 10) the ETA still counts down as before, and any
   value that previously printed `0 s` for a materially passed estimate now
   prints `—`.
5. **Request and stream audit.** The WebSocket connection count and the
   `RoutePatterns` request count match the TV-0025 baseline: one connection for
   the map, one `RoutePatterns` POST per route per session, no new request when
   a popup opens or closes.
6. **Standard checks.** `npm run lint`, `npm run format:check` and
   `npm run build` pass, `dist/` is deleted afterwards, `package.json` is
   unchanged, and the API key is never printed, logged, or committed.
7. **Grep proof of the blast radius.** No path outside the popup's ETA uses the
   day anchor or the clamp: report the grep for `helsinkiMidnightMs`,
   `matchedTripTimetableInstant` and `etaSecondsToNextStop` across `src/`.

## Notes

- Owning files: the model lives in `src/lib/journey.ts`
  (`helsinkiMidnightMs`, `matchedTripTimetableInstant`,
  `etaSecondsToNextStop`); the popup wiring is `TramMarkers.etaSeconds` /
  `matchedTripInstant` in `src/map/TramMarkers.ts`; the prose is the popup
  paragraph of `Docs/digitransit.md`.
- The API's `Trip` type has **no** `serviceDay` field (GraphQL validation
  error), so the gtfsId's day component is the only day signal the feed
  offers - which is why the candidate-day approach is needed rather than a
  better field.
- HFP topic segments are zero-padded (`0040/00639`) while the payload's `oper`
  and `veh` are not; the topic's next-stop id (level 13) is **not** padded and
  stays usable as TV-0025 uses it. Only relevant if a key is built from topic
  parts.
- `serviceDay`-style quirks are feed data, dated: measured 2026-09-28.
- TV-0024 also edits `src/lib/digitransit.ts`. This task is not expected to
  touch that file; if both run at once the coordinator reviews the merge delta.

## Handoff (status: REVIEW → DONE — optional, delete before merge)

Implemented on branch
`bb/tv-0026-popup-eta-day-anchor-worker-thr_336qfkrzeb` (commit pending at
handoff; the reviewer request reports the exact tip SHA). Every acceptance
met; none reduced.

- **Files changed.** `src/lib/journey.ts` (`helsinkiMidnightMs` exported for
  the harness; new `helsinkiTodayYmd`; new `ETA_PAST_TOLERANCE_MS`;
  `matchedTripTimetableInstant` takes `deviationSeconds` + `now` and resolves
  the two-candidate day rule; `etaSecondsToNextStop` returns the rounded
  countdown, `0` within the 90 s dwell tolerance, `null` beyond); callers in
  `src/map/TramMarkers.ts` (`etaSeconds`, `matchedTripInstant` pass
  `position.scheduleDeviation` and `Date.now()`); doc-comment sync in
  `src/map/TramMarkerPopup.ts` and `src/lib/format.ts` (the old "clamped at
  0" wording); the popup paragraph of `Docs/digitransit.md`. `package.json`
  untouched.
- **Checks.** `format:check`, `lint`, `build` all pass; `dist/` deleted
  after; `.env.local` deleted after live verification (key never printed or
  committed); dev server, headless Chrome and temp profiles killed.
- **Acceptance 1 (harness — code-level, not a browser observation).** A Node
  harness bundled the shipped functions and fed the real API response shape:
  all checks passed (output at `/tmp/tv0026-harness-output.txt`). A misdated
  trip's instant equals `todayMidnight + seconds × 1000` (live trips
  `HSL:1005_20260925_*`); `25:30` on yesterday's service day still resolves
  to today 01:30 (nearer candidate); boundary −90 000 ms past → `0`,
  −90 001 ms → `null`; 400 s past → `null`, 30 s past → `0`, 200 s future →
  `200`; sweep dl −600..+600 × instant now−700s..now+700s: no negative or
  non-integer result.
- **Acceptance 2 (live, affected line).** Dev server + headless Chrome over
  CDP, before/after for the same vehicles (output
  `/tmp/tv0026-live-output.txt`). BEFORE on the deployed TV-0025 site: all 6
  sampled line-5 popups stuck at `0 s` through two reads 2.5 s apart — the
  reported defect reproduced. AFTER on this branch: all 7 line-5 popups show
  real countdowns; watching #650 across 5 consecutive next stops (330 samples
  at 1 Hz), the captured instant equals the trip's stop time on the running
  day minus `dl` at 5/5 stops (2 exact, 3 within 1 s of the popup's ~1 Hz
  render-tick skew, reported as such).
- **Acceptance 3 (muted dash).** No in-situ materially-passed observation in
  the windows (the #650 `+359 s` origin case did not recur); the **injected
  stub** was used, stated as the substitute: in-page shipped
  `etaSecondsToNextStop(now − 400 000, 359, now)` → `null`, and the injected
  popup renders the muted `—` cell with the existing title/explanation text
  unchanged; a 200 s countdown still renders `200 s` unmuted.
- **Acceptance 4 (control).** Line 10 (trip day `20260928`) counted down as
  before (e.g. 112 s → 110 s across two reads); no regression observed.
- **Acceptance 5 (audit).** CDP network log: 1 data WebSocket for the map
  (`wss://mqtt.hsl.fi`, the dev server's HMR socket excluded); baseline
  POSTs per session only; exactly one `RoutePatterns` POST for route 1005;
  popup close/reopen added no request.
- **Acceptance 7 (blast radius).**
  `grep -rn "helsinkiMidnightMs|matchedTripTimetableInstant|etaSecondsToNextStop"
  src/` hits only `src/lib/journey.ts` (definitions) and
  `src/map/TramMarkers.ts` (the callers), plus one doc-comment mention in
  `src/lib/format.ts` (`formatEtaSeconds`'s contract comment) — no code path
  outside the popup's ETA uses the anchor or the clamp.
- **Known limitations.** (1) The two-candidate day rule compares corrected
  arrivals with `dl = 0` when the feed has not reported a deviation — the
  caller renders the dash for a missing deviation anyway, so no value is
  shown from that comparison. (2) The live feed's misdated trips are feed
  data, dated 2026-09-28; if the feed fixes its trip dates, the rule keeps
  both candidates correct and needs no change. (3) One harness check was
  fixed during development (an expected "today 01:30" value was 1800 s,
  corrected to 5400 s — the implementation was right).
