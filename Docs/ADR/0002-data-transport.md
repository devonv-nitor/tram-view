# ADR 0002: Data transport for live tram positions

- Status: Accepted (2026-09-23)
- Decides: how Tram View receives live tram vehicle positions and tram line
  metadata, how often data refreshes, and how the digitransit API key is used.
- Affects: `src/lib/mqtt.ts`, `src/lib/hfp.ts`, `src/lib/digitransit.ts`,
  `src/hooks/useTramPositions.ts`.
- Implemented by: TV-0004.

## Context

Tram View is a static front end deployed to GitHub Pages with no backend of
its own (Docs/Idea.md). It needs live tram positions, and the tram line short
names (1-15, optional trailing letter, or a single letter) that TV-0005 will
show inside the map markers. The product requires near-real-time updates
"while also balancing against not slamming the API with too many requests".

The live-data landscape was verified against the running APIs on 2026-09-23:

- The digitransit Routing API v2 GraphQL
  (`https://api.digitransit.fi/routing/v2/hsl/gtfs/v1`, keyed, CORS-enabled)
  has no vehicle-positions query: introspection of its Query type lists none.
  Real-time information in that API means predicted times inside itineraries,
  not vehicle positions.
- The former GraphQL/HTTP vehicle-position endpoints
  (`realtime/vehicle-positions/v1` and `/v2/hsl`) were deprecated 26.11.2024
  and removed 3.4.2025 per the digitransit deprecations page.
- The current HSL GTFS-RT feed
  (`https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl`, protobuf,
  regenerated every 1 s) sends no CORS headers, so a browser cannot fetch it;
  using it would require a backend proxy, which Docs/Idea.md excludes.
- The HSL high-frequency positioning (HFP) API over MQTT
  (`wss://mqtt.hsl.fi:443`) works in browsers - WebSockets are not subject to
  CORS - publishes each vehicle's position about once per second, and filters
  server-side by transport mode through its topic tree. This is the transport
  digitransit-ui itself uses.
- Line metadata (short names, mode) is available from the keyed Routing API
  GraphQL query `routes { gtfsId shortName mode }` (CORS-enabled, ~28 KB).
  GTFS route ids cannot be mapped to short names by string manipulation
  (e.g. route `1030` is line 15; route `100H` is line `H`).
- TV-0004's allowed paths (`src/**`, `Docs/**`, `Tasks/**`) exclude
  `package.json`, so no new npm dependency can be added in that task.

## Options

### Option A - GraphQL polling at a fixed interval

Poll a GraphQL vehicle-positions query every N seconds with plain fetch.

- Pros: stateless request/response; predictable, bounded load; no persistent
  connection; no reconnect logic.
- Cons: unavailable - no GraphQL vehicle-positions API exists (see Context).
  The option carries over from the pre-2025 digitransit v1 routing API, which
  did expose `vehiclePositions` and motivated this task's framing.

### Option B - Poll the HSL GTFS-RT protobuf feed over HTTP

Fetch `realtime.hsl.fi/realtime/vehicle-positions/v2/hsl` every N seconds and
decode the protobuf client-side.

- Pros: standard GTFS-RT format; stateless requests; feed regenerated every
  1 s, so a 5 s poll keeps staleness near the interval.
- Cons: the feed sends no CORS headers, so a static browser app cannot call it
  directly; each snapshot carries the whole HSL fleet (~1 MB uncompressed, all
  modes) repeated per tab, the heaviest load option; protobuf decoding adds
  bundle weight.

### Option C - Subscribe to HFP over MQTT (chosen)

Hold one MQTT-over-WebSocket subscription to
`/hfp/v2/journey/ongoing/vp/tram/#` and receive each tram's position as it is
published (~1/s per vehicle). Fetch tram line metadata once per session from
the keyed Routing API GraphQL and cache it.

- Pros: true push with ~1 s latency; lowest API load of all options - only
  tram vehicles' updates over one connection, zero polling; the topic tree
  enforces tram-mode filtering server-side, so client traffic stays minimal;
  works in a static browser app with no backend; the transport digitransit-ui
  itself uses in production.
- Cons: one persistent connection with connect/reconnect/keepalive states to
  manage; payloads are an HSL-custom JSON format, not GraphQL - they are
  typed with TypeScript interfaces in `src/lib/hfp.ts`; the broker is
  currently anonymous, so the digitransit API key plays no role in positions.

## Decision

Option C.

- Positions: an MQTT 3.1.1 over WebSocket subscription to
  `/hfp/v2/journey/ongoing/vp/tram/#` (ongoing-journey vehicle-position
  events, tram mode). Refresh strategy is push, not polling: updates arrive as
  published, with no client-side interval driving API traffic. Positions are
  deduplicated to the latest message per vehicle. The app-facing snapshot for
  UI consumers refreshes every 1 s - an app-local refresh of already-received
  data, not an API poll.
- Line metadata: one keyed Routing API GraphQL query
  (`routes { gtfsId shortName mode }`) per session, cached, mapping HFP route
  ids to short names and providing the tram-line filter (short name 1-15 with
  an optional trailing letter, or a single letter).
- MQTT client: a minimal in-repo MQTT 3.1.1 over WebSocket client
  (`src/lib/mqtt.ts`, subscribe-only, QoS 0) instead of an npm package, since
  TV-0004's allowed paths exclude `package.json` and the repo minimizes
  dependencies. The needed protocol surface (CONNECT, SUBSCRIBE, QoS 0
  PUBLISH, PING, DISCONNECT) is small and frozen.
- API key: `VITE_DIGITRANSIT_API_KEY` read from `.env.local` (untracked) is
  required by the line-metadata query. A missing or rejected key surfaces a
  clear error, and tram positions are not shown without it, because the
  tram-line filter cannot be applied without the metadata.

## Why

- Best balance of the stated criterion on both axes: push replaces polling
  entirely, so the app gets ~1 s updates with the lowest possible API load -
  one connection receiving only tram updates instead of repeated full-fleet
  snapshots.
- It is the only option that works inside the product's constraints (static
  hosting, no backend): GraphQL has no positions query and the GTFS-RT feed is
  not CORS-reachable from a browser.
- Keeping line metadata on the keyed, CORS-enabled GraphQL contract preserves
  a typed GraphQL response in the client and makes the mandated local-key
  handling functional rather than vestigial.
- Server-side filtering (topic) plus client-side narrowing (short-name filter)
  keeps the client processing only the tram lines the product displays.

## Consequences

- The client manages a persistent WebSocket with reconnect/keepalive logic;
  connection state is surfaced in the TV-0004 debug panel rather than failing
  silently.
- The HFP topic/payload structure is an HSL-specific contract; parsing is
  isolated in `src/lib/hfp.ts`. If HSL extends the topic structure, only that
  module needs updating.
- TV-0004 kept the latest position per vehicle without a staleness filter;
  TV-0005 added one (`POSITION_STALENESS_MS` in `src/hooks/useTramPositions.ts`)
  that drops vehicles which stop publishing, and also closes the stream
  while the tab is hidden (reopening it on focus), so a hidden tab pulls no
  feed traffic and generates no API requests.
- TV-0008 (direction indication on the icons) consumes the `hdg` field the
  VP payload already carries - a pure rendering choice over this decision,
  no additional requests and no change to the transport or refresh balance.
  Verified against live data on 2026-09-24 (38,404 tram VP messages over 90
  s, evidence in the TV-0008 commit record): `hdg` is present on ~100% of
  messages; for moving vehicles it matches the bearing between consecutive
  positions within ~1.2° mean; for stopped vehicles (`spd` 0) it persists
  (never 0/null, stable per vehicle). The journey direction (`dir`,
  "1"/"2") is not used for the icon because it is not a physical heading;
  a layover tram is drawn pointing where it faces (`hdg`), not where its
  journey points.
- The in-repo MQTT client covers subscribe-only QoS 0 usage; if the app later
  needs publish or QoS 1+, or if dependency policy allows a package.json
  change, a general MQTT library could replace `src/lib/mqtt.ts` - revisit
  this ADR before making that change.
- If HSL ever requires authentication on the MQTT broker or publishes a
  GraphQL positions API, revisit this ADR before changing the transport.
