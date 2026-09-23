---
id: TV-0005
status: READY
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0003, TV-0004]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Live tram markers

Render trams on the map as live-updating icons.

- Icon is a circle with the line number inside, per Docs/Idea.md:
  digits 1–15, optionally with a trailing letter (e.g. `9N`, `5T`),
  or a single letter (e.g. `H`).
- Marker positions update live from the TV-0004 client at the cadence
  chosen in ADR-0002.
- Vehicles no longer present in the feed disappear from the map.
- Update loop pauses when the tab is hidden (respects the API-load
  balance from ADR-0002).

## Acceptance

- Opening the app locally shows tram icons moving around Helsinki in
  near-realtime; labels match the line-number rules above.
- Leaving the tab in the background stops API requests until focus
  returns.

## Notes

- This task completes the "map with trams moving" MVP core; the
  end-to-end check is TV-0007.
