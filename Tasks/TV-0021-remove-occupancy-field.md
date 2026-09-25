---
id: TV-0021
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: []
allowed_paths:
  - "src/lib/hfp.ts"
  - "src/components/vehicle/**"
  - "Docs/digitransit.md"
  - "Docs/ADR/0002-data-transport.md"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Remove the occupancy field from the vehicle overview

The vehicle overview renders an "Occupancy" telemetry card and an `occu` row
in the reported-fields table whose only possible content is `0` and a note
saying that no occupancy reading is shown (user request, 2026-09-25: "can you
remove the occupancy stuff if it's always 0?").

It is always 0, re-measured live for this task (~21:15 EEST, 2026-09-25, the
app's own MQTT client and parser, `/tmp/tv0021-occu-probe.mjs` and
`/tmp/tv0021-occu-events.mjs`):

- `vp/tram/#` over 70 s: 22,882 messages, all of them carrying `occu`, 100%
  with the value `0`.
- Five routes' full vehicle-scoped streams over 55 s: 9,435 messages across 13
  event types (`VP`, `TLR`, `TLA`, `ARR`, `ARS`, `DUE`, `DEP`, `DOO`, `DOC`,
  `PDE`, `PAS`, `WAIT`, `VJOUT`) - every one that carries `occu` carries `0`
  (the one type without the field, `DA`, does not carry it at all).

So the field carries no information for trams: the card and the row are
permanent zeros plus an explanation. ADR-0002's earlier sample (100% of 20,069
messages) already recorded the value; this task removes the display instead of
repeating the disclaimer.

## Requirements

1. No surface of the app shows occupancy: the telemetry grid has no
   "Occupancy" metric and the reported-fields table has no `occu` row.
2. The parser stops modelling the field: `HfpRawFields` and
   `HfpVehicleEvent` in `src/lib/hfp.ts` lose `occu` and `parseHfpEvent`
   stops reading `body.occu`. Nothing else about the parsing changes.
3. Every other telemetry field, card, row, count and behaviour is unchanged -
   in particular the door, traffic-light-priority and journey-spine cards, the
   duplicate-message accounting, and the "not reported" handling of the
   remaining fields.
4. The owning documents record the fact and the removal so the field is not
   re-added: the ADR-0002 amendment's verified-field bullet, its telemetry
   field lists and `Docs/digitransit.md`'s field bullet.
5. Guard rails: no `package.json` change; `dist/` deleted; the API key is never
   printed or committed.

## Acceptance

1. `rg -i occu src/` returns no match (a code comment naming the removal and
   pointing at the ADR is acceptable; a rendered label or value is not).
2. Live verification on a dev build of this branch, one real vehicle page:
   the DOM contains no `Occupancy` label and no `occu` string; the Telemetry
   card reports 7 metrics where the pre-change build reported 8; the reported
   fields table has every pre-change row except the `occu` row; the door,
   TLP and journey-spine cards still render; 0 console errors / uncaught
   exceptions. Evidence: the DOM probe output plus a screenshot for the human.
3. The measurement above is repeated on the branch's own build/verification
   run and reported with its exact counts, including if it were to contradict
   the removal (an honest `STOP-DECISION`/report, not a silent removal).
4. `npm run lint`, `npm run format:check` and `npm run build` are green, the
   build's `dist/` is deleted, and no tracked file contains the API key.

## Notes

- The live-trip pattern fix TV-0020 (`bb/worker-tv-0020-live-trip-pattern-thr_8qw4c6yget`,
  status `REVIEW`, not merged) is the other open change on this page. This
  branch is based on `main`, so a merge of both must be checked for the three
  files they both touch (`Docs/digitransit.md`, `Docs/ADR/0002-data-transport.md`,
  `PLAN.md`); the code paths do not overlap
  (TV-0020: `digitransit.ts`/`journey.ts`/`useVehicleTelemetry.ts`, this task:
  `hfp.ts`/`TelemetryCards.tsx`/`EventLog.tsx`).
- `occu` stays in the ADRs' raw field enumerations only where the enumeration
  describes what the feed publishes, not what the app models.

## Handoff (status: REVIEW → DONE — optional, delete before merge)

Outcome: occupancy is gone from the app; verified live against the pre-change
build on the same vehicle. Ready for the coordinator's merge (no independent
reviewer ran - see below).

What changed

- `src/lib/hfp.ts`: `HfpRawFields` and `HfpVehicleEvent` no longer declare
  `occu`, and `parseHfpEvent` no longer reads `body.occu`.
- `src/components/vehicle/TelemetryCards.tsx`: the "Occupancy" tile is removed
  (8 metrics -> 7); the module docstring no longer promises a raw `occu`
  readout.
- `src/components/vehicle/EventLog.tsx`: the `occu (occupancy)` row is removed
  (27 rows -> 26) and both docstrings note that `occu` is not modelled (the
  field set is now "every envelope field the page models").
- `Docs/ADR/0002-data-transport.md`: the amendment's status line, the retained
  telemetry list, the "Verified field facts" bullet (now: not modelled or
  shown at all, with both measurements) and the revisit note; the two raw
  field enumerations keep `occu` because they describe what the feed
  publishes.
- `Docs/digitransit.md`: the `occu` bullet states the removal and the
  measurements instead of the old "raw value only" rule.
- `Tasks/TV-0021-remove-occupancy-field.md`, `PLAN.md`.

Evidence (2026-09-25, live)

- The field is always 0: `/tmp/tv0021-occu-probe.mjs` (network `vp/tram/#`,
  70 s) = 22,882 messages, all carrying `occu`, 100% value `0`;
  `/tmp/tv0021-occu-events.mjs` (five routes' full vehicle streams, 55 s) =
  9,435 messages over 13 event types, every message that carries the field
  carrying `0` (the only type without it, `DA`, does not carry it). This
  repeats ADR-0002's earlier 100%-of-20,069 sample.
- DOM check (`/tmp/tv0021-verify.mjs`) on the **same live vehicle 40/640** in
  a worktree of `fbdf528` (port 5202) and in this branch (port 5199):
  `metricCount` 8 -> 7 with the `OCCUPANCY` label gone; `fieldCount` 27 -> 26
  with the `occu (occupancy)` row gone; `/occu/i` matches in the page text
  4 -> 0 (`bodyHasOccu: false`); every other telemetry label and reported-field
  row byte-identical; the stop-sequence, door, TLP and event-log cards still
  render; 0 console errors on both builds. A second pair on different vehicles
  (40/98 pre-change, 40/432 after) showed the same deltas.
- Parser diff on one live payload (`/tmp/tv0021-parse-compare.mjs`, the old and
  new `hfp.ts` parsing the same message): 29 -> 28 parsed fields,
  `onlyBefore: ["occu"]`, `onlyAfter: []`, no field with a different value.
- `rg -i occu src/` = only three doc comments naming the removal (no rendered
  label or value). `npm run lint`, `npm run format:check` green;
  `npm run build` green (431.15 kB JS / 29.96 kB CSS); `dist/` deleted; no
  `package.json` change; the key is in no tracked file.
- Screenshots + label-diff table for the human:
  `reports/tv0021-occupancy-removed.html` (+ `reports/tv0021/`).

Known limitations

- No independent reviewer ran (bb addendum: no unsolicited thread spawning).
- The removal is a UI/parser simplification only: if HSL starts populating
  `occu`, the field has to be re-modelled (the ADR revisit note says so).
- This branch is based on `main`; TV-0020's live-trip pattern fix is still
  unmerged on `bb/worker-tv-0020-live-trip-pattern-thr_8qw4c6yget`. Both
  touch the same three files (the two docs above and `PLAN.md`) in nearby
  places - check the merge
  of both (the code paths do not overlap).

Decision requested: none beyond the merge itself.
