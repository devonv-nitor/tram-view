---
id: TV-0024
status: READY
owner: agent
gatekeeper: human
required_approvals: []
depends_on: ["TV-0023"]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Retire the dead TV-0016 debug route-resolution plumbing

TV-0023 replaced the marker popup's TV-0016 debug readout with the compact HUD
dashboard. That readout was the only consumer of the debug route resolution the
routing client retains, so the plumbing is now dead code: it still ships and
still builds a second Map on the one per-session metadata query.

Measured at the TV-0023 merge (`8602955`) by grep across `src/`:
`src/lib/digitransit.ts` exports `resolveTramRouteDebug` with its
`TramRouteResolution` / `TramRouteResolutionReason` types, and keeps
`rawRouteListForDebug`, `tramLineIndexForDebug`, and the `RawRouteRecord`
interface, plus the retention writes in `buildTramRouteIndex`. No module
outside `src/lib/digitransit.ts` reads any of them.

## Requirements

1. Remove the debug-only exports and state from `src/lib/digitransit.ts`:
   `resolveTramRouteDebug`, `TramRouteResolution`,
   `TramRouteResolutionReason`, `RawRouteRecord`, `rawRouteListForDebug`,
   `tramLineIndexForDebug`, and the code in `buildTramRouteIndex` that
   populates them.
2. `loadTramRouteIndex` keeps resolving the same tram-line index (gtfsId →
   short name) for the same input, and the render path's route resolution is
   unchanged.
3. Update `Docs/digitransit.md` so no paragraph describes a debug route
   resolution the popup no longer has, and none describes this plumbing as
   live - remove the TV-0023 sentence that labels the removal as pending.
4. Nothing else changes. `TRAM_ROUTES_QUERY` stays the single per-session
   line-metadata request.

## Acceptance

1. `npm run lint`, `npm run format:check`, and `npm run build` pass; `dist/`
   is deleted afterwards.
2. `grep -rn` over `src/` finds no reference to any removed name.
3. Live check (dev server + headless Chrome, ~390 px): markers still render
   their line numbers and the marker popup still opens with its full HUD
   content - the removal is invisible on screen. Capture the marker count and
   one popup's fields.
4. The line-metadata request count is unchanged: one `TramRoutes` query per
   session, no new and no missing request in the network log.

## Notes

- `src/lib/digitransit.ts` owns the retained state; the
  "Debug route resolution (TV-0016)" paragraph in `Docs/digitransit.md` is the
  owning prose.
- TV-0022's live-trip fallback (`resolveLiveTramTrip`, `ensureLiveTramTrips`)
  is **not** debug code - it decides the line the map renders. Leave it
  untouched.
