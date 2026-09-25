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
- TV-0009 (rolling stock category on the icons) is a rendering-only choice
  over this decision - no additional requests and no change to the transport
  or refresh balance. The category source was verified live on 2026-09-24
  (evidence in the TV-0009 commit record): neither the HFP VP payload nor
  the keyed GraphQL metadata identifies a vehicle's model. The VP payload
  carries no make/model/subtype field (47,852 tram messages over 100 s,
  22 distinct fields; the vehicle identity is `oper` + `veh` only), and the
  Routing API GraphQL exposes no tram-vehicle query (introspection lists
  only rental-vehicle/parking queries; the `routes` metadata Tram View
  holds is per-line, `gtfsId`/`shortName`/`mode`). Categories therefore come
  from the vehicle number the TV-0004 client already parses (car-number
  ranges in `src/lib/fleet.ts`: 0-399 A, 400-499 B, 600-699 C); numbers
  outside the mapped ranges (e.g. 5xx) render as unknown rather than being
  relabeled.
- The in-repo MQTT client covers subscribe-only QoS 0 usage; if the app later
  needs publish or QoS 1+, or if dependency policy allows a package.json
  change, a general MQTT library could replace `src/lib/mqtt.ts` - revisit
  this ADR before making that change.
- If HSL ever requires authentication on the MQTT broker or publishes a
  GraphQL positions API, revisit this ADR before changing the transport.

## Amendment: vehicle-scoped subscription for the vehicle overview page

- Status: Accepted (2026-09-25, user decision); implemented and merged
  2026-09-25 by TV-0017 (retired task; merge commit `750d640`). Two
  corrections, both merged 2026-09-25 at `d0a747a` (both tasks retired):
  TV-0020 rewrote the "Additional keyed GraphQL query" section below (the
  query is per route and the pattern is resolved from the vehicle's live trip;
  the first-pattern-by-`directionId` rule it replaced was the defect), and
  TV-0021 removed the always-0 `occu` field from the parsed event and the
  page's surfaces (see "Verified field facts").
- Decides: the MQTT subscription scope, the retained per-vehicle event set
  and retention window, and the additional keyed GraphQL query that the
  vehicle overview page needs.
- Refines, does not replace, Option C / Decision above: the map page keeps
  its network-wide subscription `/hfp/v2/journey/ongoing/vp/tram/#` exactly as
  decided there.
- Affects: `src/lib/hfp.ts`, `src/lib/digitransit.ts`,
  `src/hooks/useVehicleTelemetry.ts` (new), `Docs/digitransit.md`.
- Page and URL contract: [ADR-0004](./0004-vehicle-overview-page.md).

### Subscription scope

The overview page subscribes to **one vehicle-scoped filter**:

```
/hfp/v2/journey/ongoing/+/tram/<oper>/<veh>/#
```

`<oper>` is the operator id zero-padded to 4 characters and `<veh>` the
vehicle number zero-padded to 5 (`oper` 40, `veh` 402 -> `0040`/`00402`);
both paddings, and the fact that the filter must end in `#` because HFP
topics carry a variable-length geohash tail (`tlr`/`tla` add one more `sid`
level than `vp`), were verified live on 2026-09-25 against real topics such
as `/hfp/v2/journey/ongoing/vp/tram/0040/00414/1004/2/Katajanokka/13:28/1150432/...`.

**Exactly one MQTT connection is open at a time.** The overview page owns the
vehicle-scoped filter and the map page owns the network-wide one; navigating
between them closes the other with no overlap. Measured load difference on
2026-09-25: the vehicle-scoped filter delivered 60-64 messages in 15 s for
six sampled vehicles (`vp` at ~1/s plus that vehicle's own `arr`/`ars`/
`dep`/`pde`/`doo`/`doc`/`tlr`/`tla`), against ~430 tram `vp` messages per
second for the network-wide tram filter - so a per-vehicle view is roughly
two orders of magnitude cheaper than the map view, and is the subscription
the product uses while a single vehicle is being watched.

The same live check confirmed that one vehicle-scoped filter carries **every**
per-vehicle event type (`vp`, `arr`, `ars`, `dep`, `pde`, `pas`, `doo`,
`doc`, `tlr`, `tla`, `vjout`), so the overview needs no second subscription
and no wildcard fan-out.

### Retained per-vehicle state (bounded)

| Data | Source | Retention |
| --- | --- | --- |
| Latest telemetry (position, `spd`, `acc`, `hdg`, `dl`, `odo`, `drst`, `loc`, `desi`, `dir`, `jrn`, `line`, `start`, `oday`, `route`, `tst`) | `vp` | latest only |
| Next stop id (7 characters) + headsign | `vp.stop` when present (49% of messages), else topic segments | latest only |
| Door state | `drst` bit 0, plus the last `doo`/`doc` event | latest only |
| TLP request + decision | `tlr`, paired with the `tla` carrying the same `tlp-requestid` | latest pair only |
| Stop events (`arr`, `ars`, `dep`, `pde`, `pas`, `doo`, `doc`) with `stop`, `ttarr`, `ttdep`, `dl` | MQTT | rolling: at most 200 *distinct* events, session only |
| Message identities used to collapse the broker's duplicate fan-out | topic + event type + `tst` | rolling: at most 400 identities, session only |
| `dl` samples for the trend chart | `vp` | rolling 15-minute window, in memory |

The state is a fold over *distinct* messages: the broker repeats most messages
several times on one subscription (fact below), so a message whose topic, event
type and `tst` were already seen within the last 400 identities is counted but
otherwise ignored. Without that, every door event and every priority request
would be retained four times. Raw and distinct counts are both shown, so the
transport's behaviour stays visible instead of being silently smoothed away.

Nothing is persisted: no `localStorage`, `sessionStorage`, IndexedDB or
backend. Closing the page discards the history.

Staleness is *shown*, not dropped: `vp` arrives about once per second per
vehicle, so the overview marks the vehicle stale after 15 s without a `vp`
and keeps the last known values (the user selected that vehicle explicitly).
The map's `POSITION_STALENESS_MS` removal rule in
`src/hooks/useTramPositions.ts` stays map-only.

While the tab is hidden the overview closes its stream and stops its snapshot
tick, and reconnects on focus - the same behaviour, and the same API-load
argument, as the map page above.

### Additional keyed GraphQL query

The overview resolves its journey-spine stop names from the keyed Routing API
by fetching **every trip pattern of one route per session**:

```
query { route(id: "HSL:<routeId>") { patterns { directionId headsign
  stops { gtfsId name lat lon } vehiclePositions { vehicleId } } } }
```

- Verified live on 2026-09-25: `HSL:1004` returns 4 patterns (23 stops for
  `directionId` 1) and `HSL:2015` returns 3 (34 stops), each stop with
  `lat`/`lon`, so stop names and ahead/behind distances come from this one
  cached query. The key is required (HTTP 401 without it, ADR-0003).
- The query is per **route**, not per route+direction (TV-0020): a route has
  several patterns per `directionId` (short-turn and service variants), so a
  result for one direction cannot answer for the other and does not say which
  variant the vehicle is on. Measured payload: ~0.3 KB per route for the
  whole live fleet (11 routes, 3.3 KB total), so one request per route is
  cheaper than one per route+direction pair.
- The topic `dir` is **1-based** and the GraphQL `directionId` is **0-based**.
- **`directionId` does not identify the pattern.** `HSL:1005` returns four
  patterns of which three share `directionId` 1 (8 stops -> `Katajanokan
  term.`, 11 stops -> `Jätkäsaari`, 18 stops -> `Jätkäsaari`), and the 8-stop
  one runs the opposite way; `HSL:1001` has `directionId` 0 patterns of 27,
  26 and 11 stops and `directionId` 1 patterns of 17, 16, 27 and 26.
- The pattern is therefore resolved from the **vehicle's own live trip**:
  each pattern carries `vehiclePositions { vehicleId }`, and `vehicleId` is
  the HFP identity as `HSL:<operator>/<vehicle>` (unpadded, e.g.
  `HSL:40/641`) - the Routing API performs the HFP-to-trip matching itself.
  Measured over the live tram fleet (two ~60-90 s samples, 84-88 vehicles):
  78 vehicles resolved, **no** vehicle claimed by more than one pattern, and
  **every** resolved pattern contained the stop the HFP stream reported next
  (78/78). The 6-10 unresolved vehicles are ones the API had no live trip
  for at that moment (just out of or entering service). Reproduced on the
  reported defect: vehicle `40/641` resolves to the 18-stop `Jätkäsaari`
  pattern, the one that contains the reported next stop `1040411`
  (Simonkatu).
- When no live trip resolves the vehicle, the pattern is **inferred** from the
  route's patterns: filter to `directionId` -> headsign containment ->
  containment of the reported next stop -> take the longest candidate, first
  in API order as the final tie-break. Measured against the live-trip truth
  over the same fleet, the inference agreed on 74% of vehicles and always
  returned a candidate (never an empty result); the disagreements were
  always a different variant of the same direction and headsign (e.g. 27 vs
  26 stops), which is why it is labelled as inferred in the UI rather than
  presented as the vehicle's trip.
- The headsign may be used **only** inside that inference, as a
  case/punctuation-insensitive containment test in either direction (the
  topic abbreviates where GTFS does not: `Olympiaterm.` vs
  `Olympiaterminaali`), and a headsign that matches nothing must leave the
  candidates unchanged. It is not a usable identifier: the per-pattern
  `headsign` describes the route direction's label, not the trip destination
  - live, the vehicle `40/641` reported as `dir=2`/`Jätkäsaari` by HFP sat on
  a pattern whose `headsign` is `Jätkäsaari` while running towards
  `Katajanokan term.`
- The old rule (`find` the **first** pattern with the matching `directionId`)
  was the defect this replaces: over the live fleet it selected a pattern
  that does not contain the stream's reported next stop for 13 of 79
  vehicles (16.5%), which is what produced the raw stop ids and the "next
  stop is not in this pattern" note on the vehicle page.
- Selection order and its evidence are recorded in the code
  (`selectTripPattern` in `src/lib/journey.ts`) and shown in the UI: the
  stop-sequence card labels an inferred pattern and lists the filters that
  narrowed it, and the genuine "reported next stop is not in this pattern"
  note is kept for the case where the chosen pattern really lacks the stop.
- The overview needs the per-session `routes` index as well, only to keep the
  out-of-service rule identical to the map's (TV-0011, `resolveTramShortName`)
  - that query is already cached per session and is not re-issued.
- A failed or absent pattern query must not block telemetry: the page renders
  the MQTT data and marks the journey spine unavailable with the reason.

### Verified field facts (2026-09-25)

Live-captured from `wss://mqtt.hsl.fi:443/` (20,069 tram messages over 45 s
for the field census, plus the targeted runs named below). These are
constraints on what the overview may claim, not implementation choices:

- **`dl` is positive when the vehicle is AHEAD of schedule and negative when
  it is BEHIND**, i.e. `dl` = timetable time minus actual time. Measured on
  `dep` events (n=34): `dl` -60 with `ttdep - tst` = -65 s, `dl` +59 with
  +50 s, `dl` 0 with -6/-10/-12 s; mean absolute error 18 s, limited by
  minute-resolution timetable times. A 20 s census over 8,522 tram `vp`
  messages (2026-09-25) found 5,390 negative (63%), 3,003 positive (35%),
  129 zero, range -8,460 s to +719 s. The value is **recomputed at stop
  arrival/departure computations**, so between them it is the last computed
  value and can disagree with the wall clock - observed: a tram departing
  34 s after `ttdep` reported `dl` 0 in the `dep` message itself and then
  `dl` -34 in the following `due`/`arr` messages. The UI must therefore
  present `dl` as a reported value with its own timestamp, not as a live
  measurement, and must never invert the sign.
- **`occu` is present but always 0 for trams**: `occu: 0` on 100% of the
  20,069 sampled tram messages on 2026-09-25, and re-measured for TV-0021
  (22,882 network-wide `vp` messages over 70 s, all 0; 9,435 messages over 13
  event types on five routes, every one that carries the field carrying 0). It
  therefore carries no information and is **not modelled or shown at all**
  since TV-0021: it is not a field of the parsed event and appears neither as
  a telemetry card nor in the reported-fields table. It may only come back if
  the feed starts populating it (see the revisit note below).
- **`drst` was observed only as 0 or 1** (`vp` 16,585 zeros / 2,984 ones;
  `doo` 1, `doc` 0). Only bit 0 (doors open) may be presented; other bits
  must not be invented.
- **`tlr`/`tla` are traffic-light-priority (TLP) request/decision pairs, not
  a signal colour or a countdown.** `tlr` carried `tlp-requesttype` values
  `DOOR_OPEN`, `DOOR_CLOSE`, `NORMAL`, `ADVANCE`, `tlp-prioritylevel`
  `normal`/`norequest`, `tlp-protocol` `KAR-MQTT`, plus `sid`,
  `signal-groupid`, `tlp-signalgroupnbr`, `tlp-requestid`, `tlp-line-configid`,
  `tlp-point-configid`, `tlp-frequency`, `tlp-att-seq`; the matching `tla`
  carried `tlp-requestid` and `tlp-decision` (`ACK` observed). Note that a
  TLP request is not only about signals: `DOOR_OPEN`/`DOOR_CLOSE` are request
  types too.
- **`loc` was observed as `GPS` on 98.9% of tram messages and `DR` (dead
  reckoning) on 1.1%** (20 s census: 8,425 `GPS` / 97 `DR` of 8,522). It is
  informational text and must not gate rendering; `DR` means the position is
  interpolated, which is worth showing but must not be presented as a
  position-quality metric HFP does not provide.
- **`vp.stop` is null in about half of tram `vp` messages** (20 s census:
  4,322 null / 4,200 populated of 8,522, i.e. 49.3% populated), so the next
  stop id must come from the payload when present and from the topic's
  next-stop segment otherwise. Stop events (`arr`/`dep`/`pde`/`pas`/`doo`/
  `doc`) always carried a real `stop` in the sampled window. (An earlier,
  smaller sample saw only nulls; that claim was wrong and is corrected
  here.)
- **Every tram event type carries the same flat envelope** - `desi`, `dir`,
  `oper`, `veh`, `tst`, `tsi`, `spd`, `hdg`, `lat`, `long`, `acc`, `dl`,
  `odo`, `drst`, `oday`, `jrn`, `line`, `start`, `loc`, `stop`, `route`,
  `occu` - plus type-specific extras: `ttarr`/`ttdep` on the stop events, the
  `tlp-*`/`sid`/`signal-groupid` block on `tlr`, and `tlp-requestid` +
  `tlp-decision` on `tla` (which has no `sid` field even though its topic
  carries the extra `sid` level). One parser therefore covers all of them,
  and a topic whose event type is unknown can still yield the envelope.
- Tram `vp` payload fields: `desi`, `dir`, `oper`, `veh`, `tst`, `tsi`,
  `spd`, `hdg`, `lat`, `long`, `acc`, `dl`, `odo`, `drst`, `oday`, `jrn`,
  `line`, `start`, `loc`, `stop`, `route`, `occu`. `desi` is the display line
  (digits with an optional trailing letter) and `line` is the GTFS line id
  (e.g. 32 for route `1004`), so `line` is not a display name.
- Only operator `40` appeared as a tram operator in the samples; the operator
  padding above is the only assumption made about it.
- `desi` (the display line) began with a digit in 99.1% of the 8,522 `vp`
  messages; it is display text and must not be parsed into a line number.
- **The broker repeats most messages about four times on a single
  subscription.** Measured with a bare MQTT-over-WebSocket client on
  `/hfp/v2/journey/ongoing/+/tram/0040/00608/#` (2026-09-25, 30 s): 120 raw
  messages were 33 distinct `topic|tst|type` values, and the multiplicity
  histogram was 29 messages arriving 4x and 4 arriving once; the repeats
  carry byte-identical payloads and arrive within the same millisecond. The
  browser trace of TV-0017's own page agreed independently: 392 raw `vp`
  messages were 98 distinct `tsi` values (exactly 4x), and the network-wide
  map filter showed the same ratio (~2,500 raw frames in 7 s for ~150
  vehicles). Duplicate collapsing is therefore a transport fact, not a
  display choice.

### Consequences

- The overview page's data path is one vehicle-scoped MQTT filter plus two
  cached per-session keyed queries (the existing `routes` index and the
  route's patterns). Its MQTT load is ~1/100th of the map page's;
  it never subscribes to the network-wide filter.
- The overview must collapse duplicate deliveries before retaining anything:
  a repeat counts as one received message, not as a second door event, a
  second priority request or a second `dl` sample. Counts of raw and distinct
  messages are both shown.
- Because `dl` is sign-inverted relative to the earlier mockups, every
  user-facing early/late string on the overview is a derived claim that the
  task's acceptance verifies against a live stop event.
- Revisit this amendment if HFP changes the topic layout (padding, the
  variable-length tail, or per-event fields), or if HSL starts populating
  `occu` (it may then be modelled again - TV-0021) or publishes stop sequences
  on the MQTT side.
