---
id: TV-0003
status: READY
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0002]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Map view foundation

Render an interactive map of the Helsinki region as the core view.

1. Write `Docs/ADR/0001-map-library.md`: choose the map library
   (candidates: Leaflet, MapLibre GL JS) and a tile source that works
   without a paid API key for MVP. Record options, decision, why.
2. Implement a full-viewport map centered on the Helsinki tram network.
3. Map reacts to viewport resize.

## Acceptance

- Map of the Helsinki region renders in the browser with visible tiles.
- No console errors; key-free tile usage (or key handling per ADR).
- ADR-0001 recorded and linked from this task's commit message.

## Notes

- No tram data yet — markers arrive in TV-0005.
