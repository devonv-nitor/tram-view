---
id: TV-0008
status: READY
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0005]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Direction indication on tram icons

Make each tram's direction of travel visible on its map icon, so a
stopped tram's heading can be told at a glance.

- Replace the plain circle with a rounded-front, pointed-back shape —
  an "ice cream cone": rounded at the rear, tapering to a point at the
  front — with the point oriented toward the direction of travel.
  The line number stays inside the rounded body and remains readable.
- Direction source, in order of preference:
  1. **Built-in direction information from the API.** Inspect what the
     HFP payload actually carries (e.g. a heading/`hdg` field, route
     direction in `hdr`) and verify against live data whether it answers
     "which way is this tram pointed" — including for stopped vehicles.
  2. **Route-derived.** Bearing toward the next stop, aligned with the
     track geometry. Only pursue this if (1) is absent or ambiguous;
     check what extra requests it needs and weigh them against the
     API-load balance in `Docs/ADR/0002-data-transport.md` before
     committing to it.
  3. **Position delta (worst case).** Bearing from consecutive position
     snapshots. This must not be the mechanism for stopped vehicles —
     the delta is zero/noisy exactly when the problem occurs — so if
     only (3) is achievable, record that as a known limitation and say
     what (1) or (2) would need.
- Whichever source wins, record the decision and the evidence (what
  fields the feed actually carries, verified live). A pure rendering
  choice needs no new ADR — extend the consequences in
  `Docs/ADR/0002-data-transport.md` (or `0001` if it touches the map
  layer); if the winning approach changes the transport/load picture,
  that is an ADR-0002 revisit.
- The map is north-up: a heading in degrees maps directly to icon
  rotation.

## Acceptance

- Each tram icon points toward its direction of travel; moving trams
  update orientation as they turn.
- A stopped tram still shows a plausible heading, derived from source
  (1) or (2) — not from a stale position delta.
- Line numbers remain legible inside the new shape at the default and
  common zoom levels.
- Live verification in the browser shows mixed orientations across the
  fleet (e.g. visibly opposite directions on the same line), recorded
  with how it was verified.

## Notes

- Trams are bidirectional; if the feed's heading and the route's
  direction ever disagree (e.g. laying over at a terminal), surface the
  behaviour chosen and why in the evidence rather than hiding it.
- The end-to-end MVP check remains TV-0007; this task should land
  before that check runs.
