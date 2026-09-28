---
id: TV-0025
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0023]  # merged at 8602955
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Replace the marker popup's Heading metric with an ETA to the next stop

The user's request (2026-09-26): "replace the *Heading* section with *ETA*
which displays the estimated time (in seconds) until the tram arrives at the
next stop - e.g. if the tram is 35 seconds from its next stop it says `35s`".
This refines the TV-0023 HUD popup (merged at 8602955), where the
speed/heading row's right-hand cell becomes the ETA cell.

What is true now, and what makes this more than a label swap:

- The map page's only data stream is `subscribeTramPositions()`'s network-wide
  `vp` subscription (`src/lib/hfp.ts`, ADR 0002). HFP **vp payloads carry no
  timetable field at all** — `HfpVehiclePosition` has `dl` and `stop` but no
  `ttarr`/`ttdep` — so today's popup cannot derive a time-to-arrival from what
  it already receives. The next stop's timetable has to come from somewhere
  new.
- The popup's next stop is also missing half the time: `nextStopId` is built
  from the payload's `stop` field only (`src/hooks/useTramPositions.ts`:
  `latest.stop !== null ? String(latest.stop) : null`). Measured live
  2026-09-26 over 45 s (4 667 distinct vp messages): the payload field is
  present in **48.9%**, the HFP topic's level-13 next-stop id in **100%**, and
  when both are present they **agreed in every sample** (2 282/2 282, and
  2 325/2 325 in a second run). So TV-0023's next-stop row (and its name
  resolution) is blank for no reason, and the ETA depends on fixing it.
- The keyed Routing API already publishes the vehicle's own live trip, with
  its stop times. Measured live 2026-09-26 with this repo's key (HTTP 200):
  - `routes(transportModes: [TRAM]) { patterns { vehiclePositions { vehicleId
    trip { gtfsId } } } }` — 31 routes, **104 live vehicles each carrying a
    `trip.gtfsId`**, one 19.1 KB query. (`vehiclePositions.trip.gtfsId` is an
    addition to TV-0022's existing query shape, which selects `vehicleId`
    alone.)
  - `trip(id: "HSL:1013_20260925_Ma_2_1007") { stoptimes { scheduledArrival
    realtimeArrival stop { gtfsId name } } }` — 15 stoptimes, 1.6 KB.
    `scheduledArrival`/`realtimeArrival` are **seconds since local midnight**
    (36420 = 10:07:00), not epoch milliseconds.
  - Folding those stoptimes into the popup's existing per-route pattern query
    costs 5.8 KB → 11.3 KB (route 13, 6 live vehicles), one request.
- That timetable is a *schedule*, not a prediction: `realtimeArrival` equalled
  `scheduledArrival` on 8 of 8 sampled live trips, so the API supplies no
  realtime correction today. The correction has to be the popup's own
  `scheduleDeviation` (HFP `dl`, added by TV-0023) — exactly the formula the
  vehicle overview already uses (`estimateNextArrival`, `src/lib/journey.ts`:
  `timetableAt - dl`).
- The HFP feed *does* announce the next stop's timetable, but only late:
  measured over 95 s, `due` events (n=90) carried `ttarr`/`ttdep` with a
  **median lead of +21 s** before the vehicle's own event time, `arr` (n=93)
  +2/+5 s. So a vehicle-scoped stream would give an ETA for roughly the last
  20 s of each inter-stop segment — blank the rest of the time — *and* it
  would open a second concurrent MQTT connection on the map page, which
  ADR-0004 decision 4 ("exactly one connection is open at any moment")
  forbids. Rejected for both reasons; see Notes so it is not re-litigated.

## Requirements

1. **Heading out, ETA in.** In `src/map/TramMarkerPopup.ts` the `Heading`
   metric cell (row 1, right of Speed) becomes an `ETA` cell showing the
   estimated time until the tram reaches its next stop, as whole seconds with
   a ` s` suffix (`35 s`), per the user's instruction — seconds only, never
   `M:SS`; values of a minute or more stay in seconds (`252 s`). Remove
   `formatHeadingCompact` from `src/lib/format.ts` if nothing else uses it
   after the change; `formatHeading` and the marker layer's direction rotor
   are untouched.
2. **The value is the timetable corrected by the reported deviation**, using
   the overview's own formula (do not invent a second model):
   `etaMs = timetableInstant(nextStop) - scheduleDeviation * 1000 - now`,
   rendered as `max(0, round(etaMs / 1000))` seconds. A straight-line
   distance ÷ speed guess is **not** acceptable. When the matched trip
   supplies a `realtimeArrival` that differs from its `scheduledArrival`,
   prefer it as the timetable instant (measured: today it never differs).
   Never render a negative time — clamp at `0 s`.
3. **The timetable comes from the keyed Routing API, not a second stream.**
   Extend the popup's existing lazy per-route load (TV-0023's
   `loadRoutePatterns`/`loadRouteStopNames` path in `src/lib/digitransit.ts`)
   so it also carries `patterns.vehiclePositions { vehicleId trip { gtfsId
   stoptimes { scheduledArrival realtimeArrival stop { gtfsId } } } }`; if
   that proves too heavy in review, use one extra cached
   `trip(id: "<gtfsId>")` query for the open vehicle instead. Either way:
   **at most one fetch per route and one per trip per session**, requested
   only while a popup is open, no polling, no new MQTT subscription, no new
   dependency, `package.json` unchanged, and ADR-0004 decision 4 stays true
   — the live check must show **zero** new WebSocket connections.
4. **Next-stop identity comes from the topic, not the payload.** Carry the
   HFP topic's level-13 next-stop id into the position (payload `stop` wins
   when both are present; both agreed in every sample) so the popup's next
   stop — and its TV-0023 name — is populated for essentially every position
   instead of half of them. Match it to the trip's stoptimes by **bare** stop
   id (strip the `HSL:` prefix, as `bareStopId` does).
5. **Fallbacks are honest and the cell is labelled an estimate.** Show the
   existing muted `—` when the vehicle has no live trip in the API's match,
   the trip has no stoptime for the next stop, `scheduleDeviation` is null,
   or the load has not resolved yet. The cell carries an accessible one-line
   explanation that the figure is the timetable corrected by the *reported*
   schedule deviation — an estimate, not a measurement (the overview's own
   wording, `src/components/vehicle/VehicleOverview.tsx`).
6. **It ticks.** The value is computed from `now` at render time; the popup
   already rebuilds once per snapshot (~1 Hz), so it counts down while open
   with no new timer and no stored countdown.
7. **Unchanged:** every other TV-0023 popup field, its layout, colours and
   dark `tram-hud-shell` chrome; the next-stop name resolution and its
   fallback; the overview nav link; the marker layer (rotation, colours,
   counts, popup binding); the vehicle overview page and its own fields;
   `dist/` stays untracked.
8. **Docs updated with the behaviour:** `Docs/digitransit.md`'s popup
   paragraph gains the ETA field, its source, its cache scope and its
   fallbacks, and states explicitly that **no second stream was added**.

## Acceptance

1. `npm run lint`, `npm run format:check`, `npm run build` green; no
   `package.json` change; `dist/` deleted after builds; the API key is never
   printed, logged, or committed.
2. **Live ETA with a countdown:** dev server + headless Chrome, open a popup
   on a tram whose next stop has a timetable, and capture the ETA cell at two
   moments ~10 s apart. Evidence: the raw values, the vehicle key, the route
   and the matched trip id, and that the value decreased by about the elapsed
   time. Screenshot or dumped DOM text both count.
3. **Independent agreement with the overview:** open the same vehicle's
   overview (`#/vehicle/<oper>/<veh>`) and compare its estimate
   (`estimateNextArrival` → the hero's countdown) with the popup's ETA for
   the same next stop at the same moment. Report both numbers and the
   difference. A small difference is expected — HFP announces its own
   timetable time where the popup uses GTFS — and must be **disclosed as a
   known limitation**, not hidden or averaged away.
4. **Fallback evidence:** measure how many of ~10 opened popups showed a
   value versus `—`, and state the reason for each `—`. If the
   no-live-trip / no-stoptime case cannot be observed live in the sample
   window, verify it by code review and **say that it is code-review
   evidence**, not a live observation.
5. **Next-stop coverage fixed:** report the share of sampled positions with a
   populated next stop before and after the change (the topic level is
   present in 100% of sampled vp messages, the payload field in 48.9%).
6. **No extra streams, bounded requests:** the network log while opening and
   closing popups on N different routes shows no new WebSocket connection,
   at most one Routing API request per route per session (plus one per trip,
   if that shape is chosen), and no repeat request when a popup is reopened
   for the same route/trip.
7. **Heading removed, marker intact:** the popup's DOM contains no `Heading`
   label while the marker's rotor still points along the vehicle's `heading`.

## Notes

- Measurements above were taken live on 2026-09-26 (Helsinki ~10:05 local)
  with this repo's `.env.local` key and the anonymous HFP broker; the probe
  scripts are throwaway and not committed.
- Rejected alternative, with its evidence, so it is not re-proposed: an
  HFP-event-based estimate from a **vehicle-scoped** subscription (the
  overview's `subscribeVehicleEvents` + `estimateNextArrival`, reusing
  `ttarr`/`ttdep`). Measured `due`-event lead: median +21 s (n=90), so the
  estimate would exist only in the final ~20 s of each segment; and it needs
  a second concurrent MQTT connection on the map page, contradicting
  ADR-0004 decision 4. Network-wide stop-event subscription would be far
  heavier and is excluded by ADR 0002's load budget.
- The HFP `dl` sign convention: **positive = ahead of the timetable**, so
  `timetable - dl` is the corrected instant (a tram 60 s ahead arrives 60 s
  earlier). Get this wrong and the ETA moves the wrong way; the overview's
  `estimateNextArrival` is the reference.
- The Routing API reports stop times as **seconds since local midnight**; a
  naive `Date.parse`/epoch mix-up would produce a wildly wrong ETA. Add the
  local midnight of the trip's operating day.
- A tram's trip lasts hours, so a per-trip cache is nearly free; a vehicle
  changing trip mid-session must re-resolve rather than reuse the old one.
- If the reviewer judges that a new per-trip Routing API request on the map
  page is a data-transport decision no accepted ADR covers, this task stops
  at `STOP-DECISION` with the smallest question stated, rather than
  proceeding on the worker's own authority.
- `Docs/README.md` (referenced by `AGENTS.md`) does not exist; the owning
  documents are `Docs/digitransit.md`, `Docs/ADR/0002-data-transport.md` and
  `Docs/ADR/0004-vehicle-overview-page.md`.

## Handoff (status: REVIEW → DONE — optional, delete before merge)

Implemented at commit <tip>; branch `bb/tv-0025-popup-eta-to-the-next-stop-thr_9xa66mia8z`.

**Live verification (2026-09-28, headless Chrome + CDP, all evidence labeled as
live):**

- **Countdown (A2):** popup on vehicle `40/75` (route `HSL:1010`), next stop
  `Kansaneläkelaitos`: ETA **94 s at 08:01:10.5Z → 84 s at 08:01:20.5Z** — a
  decrease of exactly 10.0 s over 10.0 s. Matched trip
  `HSL:1010_20260928_Ma_2_1052` (18 stoptimes) confirmed from the network
  response body.
- **Model (R2) verified against the API's own numbers:** the trip's stoptime
  for `Kansaneläkelaitos` (`HSL:1140441`) is `scheduledArrival` **39840 =
  11:04:00** Helsinki (operating day `20260928` parsed from the trip gtfsId's
  2nd component). 39840 − 76 (reported `dl`, *ahead* → subtracted) − now
  (≈39669.5) ≈ 94.5 → **94 s**, the rendered value. The clamp is proven on a
  second vehicle: `40/628` (dl −56, instant passed) rendered **0 s**, never a
  negative.
- **Overview cross-check (A3):** the overview for `40/75` showed
  **Estimated arrival `—`** (its note: the messages for the stop carry no
  timetable time; only stop events announce one) while the popup showed the
  ETA. **Disclosed known limitation:** the popup's ETA derives from the
  Routing API trip timetable (always available), the overview's estimate
  needs the vehicle's own HFP `ttarr`/`ttdep` announcements, which arrive
  only at/near the stop event — so the popup can show an ETA where the
  overview shows `—`, and the two never disagree on a number the overview
  can derive.
- **Fallbacks (A4):** ~46 popup opens across three runs, all derivable (0
  wild dashes) — the API matched every tracked vehicle. The muted dash was
  exercised **live** by blocking the Routing API (CDP): the ETA cell showed
  **`—` with `tram-hud-popup__metric-value--muted` (rgb(107,112,120) =
  #6b7078)** and the explanation title, the deviation cell kept its value,
  and `[tram-view] route patterns failed:` was logged per attempt. The next
  stop row fell back to the bare id — TV-0023's own fallback, unchanged.
- **Coverage (A5):** re-measured with the merged change, 45 s, **4 696**
  sampled vp messages: populated next stop **42.0% → 100.0%**; agreement
  when both present **1 970/1 970**; topic-only 2 726; neither 0. (The share
  varies with traffic; the payload-only share measured 48.9% on 2026-09-26.)
- **Streams (A6):** a map-only session (no navigation): **2 WebSocket
  connections** before any popup (1 Vite dev HMR socket + 1 MQTT vp stream)
  and **still 2, growth 0, closed 0** after 7 popup opens on 7 routes + 1
  reopen. `RoutePatterns`: 6 POSTs for 7 opens (the reopened route served
  from cache); `TramRoutes`: 1 (pre-existing). **Zero new WebSocket
  connections attributable to the popup.**
- **Heading removed (A7):** `hasHeadingLabel: false` in every popup read;
  the marker rotor still points along the heading (`rotate(237deg)` etc.).
  The overview hero renders the same four answers as before.

**Checks:** `npm run format:check`, `npm run lint`, `npm run build` all green;
`package.json` untouched; `dist/` deleted; `.env.local` deleted; dev server,
Chrome, and the temp profile stopped; probes are throwaway in /tmp, not
committed; the API key never printed or logged.

**Known limitations:**

- The shared `ROUTE_PATTERNS_QUERY` is also used by the overview's
  `useVehicleTelemetry` (TV-0022 path), so each overview open now fetches
  the heavier response (~15.7 KB measured vs 6.2 KB before, per route with
  live vehicles) and drops it if the vehicle's route has no live trip.
  Accepted to keep one shared query shape; say so in review if it should be
  split instead.
- `matchedTripTimetableInstant` prefers a differing `realtimeArrival`; live
  today `realtimeArrival` never differs from `scheduledArrival` (measured
  again: 6 live vehicles on route 1013), so the branch is dormant by
  design.
- The per-route load retry is per popup refresh (pending flag released on
  failure, retried on the next snapshot's rebuild while the popup stays
  open) — the same TV-0023 pattern stop names already use; failures are
  logged per attempt and change nothing on screen.

**Next agent:** reviewer only — judge `origin/main..origin/<branch>` against
this file; the merge is the coordinator's, not mine.
