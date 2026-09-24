---
id: TV-0012
status: IN_PROGRESS
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0009, TV-0011]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Per-type live counts in the status panel legend

The status panel legend (`src/components/TramStatusPanel.tsx`, fed by
`TRAM_CATEGORY_LEGEND` in `src/lib/fleet.ts`) currently reads
`<swatch> A — MLNRV I/II (Valmet)`. The category letter ("A") is
internal bookkeeping, not user information, and the panel shows no
per-type counts. Change the legend to:

    <swatch> (count) Model name

e.g. `<swatch> (12) MLNRV I/II (Valmet)`, per the user's sketch — the
name may be styled (e.g. italic) for readability; drop the category
letter everywhere it was user-visible in the legend. Keep the colored
swatch (that is the actual legend signal). The model names come from
`src/lib/fleet.ts` `CATEGORY_INFO` labels — strip the letter prefix
there (or render without it) so the data stays in one place.

- Counts are **live**, computed from `trams.positions` (each position
  carries `vehicleNumber`; classify via the existing `src/lib/fleet.ts`
  resolver). Unknown-vehicle-number trams count into the "? Unknown
  type" entry. The counts must update as trams appear/disappear; keep
  the existing rendering approach (no new state, derive per render).
- The TV-0011 red-dot "Not in service" entry is not a vehicle type:
  leave it as-is by default. Adding a live count to it is a permitted
  refinement — if added, document the choice in the evidence.
- Counts are display only; do not change `TramCategory`, the marker
  rendering, or the fleet mapping itself.
- No ADR: pure UI change inside the existing legend component.

## Acceptance

- Live verification: legend shows `(count) Model` per type with counts
  matching the map (a headless-Chrome + CDP capture comparing the panel
  counts against a quick position tally from the same feed is enough;
  note any count mismatch honestly rather than hand-tuning).
- The red-dot entry unchanged (or its count documented if added).
- `npm run lint`, `npm run format:check`, `npm run build` green;
  no `package.json` change; key discipline unchanged.