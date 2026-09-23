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

### Carried review notes (TV-0003/TV-0004, non-blocking)

- `src/lib/mqtt.ts`: a malformed remaining-length varint permanently
  kills that connection's parser (needs a non-conformant broker frame;
  onError fires, so not silent) — reset the buffer or drop-and-reconnect
  in that catch.
- `src/lib/mqtt.ts`: the drain loop keeps processing pipelined packets
  after close/drop; harmless today.
- `src/lib/mqtt.ts`: varint length guard is off by one; no practical
  effect.
- `src/hooks/useTramPositions.ts`: snapshot setState runs unconditionally
  each tick (re-render even when nothing changed) — relevant once markers
  render per tick.
- `src/index.css`: `.debug-panel--error` fixed `#b3261e` is ≈2.9:1
  contrast on the dark Canvas background; use
  `light-dark(#b3261e, #f2b8b5)` when touching panel styles.
- `src/index.css`: `color-scheme: light dark` vs light OSM raster tiles —
  decide how markers/labels behave in dark mode.
- `#root { width: 100vw }` can induce horizontal overflow with a
  scrollbar; prefer `100%` if a sidebar or overlay lands.
