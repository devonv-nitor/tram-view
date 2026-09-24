---
id: TV-0014
status: IN_PROGRESS
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0009, TV-0011, TV-0012]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# UI cleanup: hide empty Unknown row, drop category letters from tooltips

Two small residuals from the TV-0009→TV-0012 line, per the user:

1. **Hide the "? Unknown type" legend row unless an unknown tram is
   actually in the current snapshot.** Same conditional pattern the
   planned TV-0013 SpåraKoff entry uses: render the row only when its
   count is > 0 — never a zero-count row. The legend is a summary of
   what is on the map right now; a persistent `(0) ? Unknown type`
   line is noise. The row must come back whenever an unknown vehicle
   number appears and vanish again when the last one leaves.
2. **Remove the category letter from tooltips.** `tooltipText` in
   `src/map/TramMarkers.ts` renders `... ${info.model} (type ${info.category})`
   — the letters (A/B/C) were removed from user-visible text in
   TV-0012 but still leak here. The tooltip keeps "Line N — Model"
   (and the unknown-vehicle variant "Line N — Unknown tram type
   (vehicle N)", which has no letter and stays).

- Pure presentation change: no changes to `TramCategory`, the fleet
  resolver, marker classes, or counts; the legend row's swatch and
  `(count)` format from TV-0012 stay exactly as they are when shown.
- The TV-0011 red-dot row is not a type row: it stays always-visible,
  unchanged.
- Docs: if `Docs/digitransit.md` describes the legend rows or tooltip
  text, update it to match.
- No ADR: presentation-only inside the existing legend/tooltip policy.

## Acceptance

- Live verification (headless Chrome + CDP over the real feed, ~60 s):
  the "? Unknown type" row is absent while no unknown-numbered tram is
  reporting (this is the common state — the fleet census has never
  seen one), and tooltips contain no "type A/B/C" fragment. Capture
  at least one tooltip's full text as evidence. If an unknown tram
  happens to appear, capture the row appearing (bonus evidence, not
  required); otherwise verify the conditional rendering by code
  review plus a synthetic injection through the real panel component,
  and say so honestly.
- Legend sums still equal the status-line total (sum over shown rows
  may be less than the total only when the Unknown row is hidden, and
  that difference must equal the unknown count, i.e. 0 in the common
  case — state what you observed).
- `npm run lint`, `npm run format:check`, `npm run build` green; no
  `package.json` change; key discipline unchanged.

## Notes

- Independent of TV-0013 (SpåraKoff): no shared acceptance, but both
  touch `TramStatusPanel.tsx` conditional rendering. Base on current
  `origin/main` (a14f04a); whichever merges second reconciles.
- TV-0013 (not yet started) must keep its row hidden when its count
  is 0 — same pattern; no ordering constraint between the two.
