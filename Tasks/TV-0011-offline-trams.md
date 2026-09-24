---
id: TV-0011
status: READY
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0009]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Show out-of-service trams (shunting/testing) on the map

Trams that report positions but are not assigned to a displayed line —
depot shunting, training or testing runs — currently never reach the
map: their route id resolves to no GTFS line, so the snapshot filter
drops them (`src/lib/digitransit.ts`). Live verification (2026-09-24,
coordinator census: route `1009TX`, Artic cars 414/424, moving around
the Töölö depot stops) shows such trams exist in the feed and carry the
same position/heading data as service trams. They should be visible.

- Render a tram whose latest position resolves to no displayed line as
  an **empty marker** (no line number inside) in a **distinct color**
  (red family, per the user) to signal "not in service but reporting".
  The marker keeps the TV-0008 teardrop shape, heading rotation, and
  the TV-0009 tooltip (model name; tooltip may add a hint like
  "not in service").
- How it works:
  1. In the snapshot (`src/hooks/useTramPositions.ts`), keep positions
     whose route id resolves to nothing instead of dropping them —
     `TramPosition` gains a way to distinguish "no line" from a line
     (e.g. `routeShortName: null`), and the line-number label renders
     only when a short name exists.
  2. Vehicle-number category mapping (`src/lib/fleet.ts`) still
     applies; an out-of-service tram keeps its fleet color *replaced*
     by the out-of-service color (the out-of-service state wins, per
     the user's intent).
  3. Legend gains an out-of-service entry.
  4. Known flicker from the coordinator census: a vehicle can report
     under both its service route and `1009TX` within the same second
     (e.g. car 414 on line 8 and depot simultaneously). Whatever
     behavior is chosen (latest-event-wins is acceptable; a grace
     period before dropping a service tram is a permitted refinement),
     document it in the evidence. Do not let the flicker regress
     TV-0005's "vehicles absent from the feed disappear" requirement.
- The `desi` field ("000" = no displayed destination) and the route
  id itself must not be trusted as "not in service" markers by
  themselves — the distinguishing signal is exactly "resolves to no
  GTFS tram line" (which covers absent routes like `1009TX`).
  `desi`/route-id evidence may be recorded as corroboration.
- No ADR change: this is a rendering/filter policy inside the existing
  transports. Record the decision (which trams count as out-of-service
  and why) in the commit evidence and, if it clarifies the data model,
  a sentence in `Docs/digitransit.md`.

## Acceptance

- Live verification shows at least one out-of-service (red, empty)
  marker when such trams are reporting (e.g. depot vehicles), with
  heading rotation working; if none are reporting during the window,
  verify by code-review of the mapping plus a synthetic injection,
  and say so.
- Service trams are unchanged: same lines, same colors, same
  disappearance-on-departure behavior.
- Legend documents the out-of-service color.
- `npm run lint`, `npm run format:check`, `npm run build` green; no
  `package.json` change; key discipline unchanged.

## Notes

- Depends on TV-0009 (shared variables/panel/legend) and TV-0008
  (marker shape); it must land after both, before TV-0007.
- The user accepted that "not officially on a line" includes depot
  shunting and testing; if the feed ever carries genuinely private or
  maintenance vehicles, the same red treatment applies, which is
  accepted.
- Known data quirk to re-check live during verification: a vehicle can
  appear on both a service line and an out-of-service route in the same
  minute (car 414 did on 2026-09-24).
