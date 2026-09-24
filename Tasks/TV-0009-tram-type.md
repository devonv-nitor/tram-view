---
id: TV-0009
status: IN_PROGRESS
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0005, TV-0008]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Tram type (rolling stock category) on tram icons

Make each tram's vehicle category visible on the map, so the fleet
mix can be read at a glance.

HSL rolling stock categories for this task:

| Category | Models (advertised by HSL)          | Treat as          |
| -------- | ----------------------------------- | ----------------- |
| A        | MLNRV I (Valmet Nr I), MLNRV II (Valmet Nr II) | one category |
| B        | Škoda Transtech Artic               | its own category  |
| C        | Škoda Transtech Artic X54           | its own category  |

Categories A's two models are visually the same thing; B and C must be
uniquely identified from each other and from A despite the similar
names.

- Data source, in order of preference:
  1. **API-provided identifier.** Inspect what the feed actually
     carries — a make/model or subtype field in the HFP payload or the
     keyed GraphQL metadata — and verify against live data whether it
     distinguishes B from C.
  2. **Car-number lookup (fallback).** Map the vehicle number to a
     category by range: 0–399 → A, 400–499 → B, 600–699 → C. The
     vehicle number is already parsed by the TV-0004 client.
     Whatever is unlisted (e.g. 5xx) must be handled explicitly —
     render as unknown, never crash or silently mislabel — and recorded
     in the evidence.
  Whichever wins, record the decision with live-verified evidence of
  what the feed actually provides. A rendering-only choice extends the
  consequences in `Docs/ADR/0002-data-transport.md`; a change to the
  transport/load picture (e.g. extra keyed requests) is an ADR-0002
  revisit.
- Visuals: **color** is the accepted encoding for now — distinct,
  clearly different hues per category that stay readable over the OSM
  raster tiles and alongside TV-0008's shape/direction changes.
  Additionally give each marker a `title` (tooltip) with the full
  model name, so the meaning of a color is one hover away.
- A color legend (e.g. in the status panel) is welcome if cheap; a
  fuller accessible encoding (pattern/shape per category) is out of
  scope and belongs in a follow-up task.

## Acceptance

- Each tram icon is distinguishable by category; B (Artic) and C
  (Artic X54) are uniquely identified.
- The category source is live-verified and recorded (API field or
  car-number mapping), including how unknown ranges behave.
- Tooltips show the full model name per vehicle.
- Live verification in the browser shows the categories actually in
  service during the window, recorded with how it was verified; for a
  category not observable live (e.g. if no Valmet is running), the
  mapping is code-verified and that is stated instead of fabricated.

## Notes

- Depends on TV-0008 as well as TV-0005 because both tasks modify the
  tram icon; they must not run in parallel.
- Color-only separation is a known accessibility limitation, accepted
  for now by the user (2026 session); note it in the commit's `Known
  limitations` and in the task handoff.
- The end-to-end MVP check remains TV-0007; this task should land
  before that check runs.
