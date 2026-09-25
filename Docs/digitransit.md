# Digitransit data: API key and live tram positions

Tram View reads live HSL tram positions and tram line metadata from two
digitransit-provided transports. The transport decision (MQTT push vs
polling) is recorded in
[ADR 0002](./ADR/0002-data-transport.md); this page is the setup runbook.

## Data architecture at a glance

| Data | Transport | API key |
| ---- | --------- | ------- |
| Map basemap (HSL's generic map style, no transit geometry) | Digitransit Map API raster tiles, `GET https://cdn.digitransit.fi/map/v3/hsl-map/{z}/{x}/{y}{r}.png?digitransit-subscription-key=<key>` (512 px tiles, CDN-cached 7 days; TV-0018) | required |
| Tram vehicle positions (lat/lon, heading, speed, direction, route id, vehicle number) | HFP MQTT over WebSockets, `wss://mqtt.hsl.fi:443/`, topic `/hfp/v2/journey/ongoing/vp/tram/#` (push, ~1 update/s per vehicle) | not needed |
| Tram line metadata (route id -> short name, mode) | Routing API v2 GraphQL, `POST https://api.digitransit.fi/routing/v2/hsl/gtfs/v1`, query `routes { gtfsId shortName mode }`, fetched once per session and cached | required |
| One vehicle's full HFP event stream (position, stop events, doors, traffic-light priority) | same MQTT broker, filter `/hfp/v2/journey/ongoing/+/tram/<oper>/<veh>/#` - one vehicle, every event type (TV-0017) | not needed |
| One line's stop sequences | Routing API v2 GraphQL, query `route(id: "HSL:<routeId>") { patterns { directionId headsign stops { gtfsId name lat lon } vehiclePositions { vehicleId } } }`, once per route per session and cached; which pattern is shown is chosen per vehicle from the API's own live-trip match (TV-0017, TV-0020) | required |
| The line of a vehicle whose HFP route id is not a GTFS route id | Routing API v2 GraphQL, query `routes(ids: [<the indexed tram route ids>]) { gtfsId patterns { vehiclePositions { vehicleId } } }`, fetched only while such a vehicle is present and refreshed at most once per 60 s (TV-0022) | required |

The positions subscription is anonymous. The line-metadata query and the
basemap tiles require a digitransit subscription key; without one the app
shows a clear error instead of silently hiding data or silently switching to a
different map style: the line numbers cannot be resolved without the metadata,
and the map renders no basemap layer at all (TV-0018 - no key-free fallback).

Out-of-service trams (TV-0011, TV-0022): a vehicle's line is resolved in
this order and by nothing else - (1) its latest position's HFP route id
resolved through the per-session tram-line index, (2) else the Routing API's
live-trip match for that vehicle, resolved through the same index, (3) else
no line. A vehicle with no line is kept in the snapshot with
`routeShortName: null` instead of being dropped, and renders as its normal
category-colored marker with the line number replaced by a red dot
(`--tram-type-offline`). Step 2 exists because HSL publishes
variant-suffixed HFP route ids for real service runs (`1001H6` is a run of
line 1H, `1007 9` a run of line 7); those ids are absent from the whole GTFS
route list, so step 1 alone painted 12-17% of the live fleet as out of
service (the 2026-09-25 measurement and the full decision are in the
[ADR 0002 amendment](./ADR/0002-data-transport.md#amendment-a-red-dot-trams-line-from-the-routing-apis-live-trip-tv-0022)).
A red dot therefore asserts that the route id is not a GTFS route id **and**
that the API reports no live trip for that vehicle - the honest reading for
depot shunting, training/testing and a test route such as `1009TX`. The
resolution never uses `desi`, the route-id string's shape, the HFP `line`
field or `dir`, and the live-trip match is a snapshot refreshed at most once
per 60 s, so a vehicle entering service can stay red for up to one refresh.
Dedup stays latest-position-per-vehicle, so a vehicle that reports under both
a service route and an out-of-service route shows whichever event arrived
last, and vehicles that stop publishing still disappear after the staleness
cutoff.

Special case (TV-0013): HSL car #175 - the SpåraKoff bar tram - is detected
by identity, `operatorId === 40 && vehicleNumber === 175` on the latest
position (`src/lib/fleet.ts`), never by `desi`, route id, or line metadata,
and whenever it reports it is rendered with its own marker color
(`--tram-type-sparakoff`, rgb(235, 79, 73)) and a `K` in place of the line
number - even when its route resolves to no displayed line, where any other
vehicle would show the red dot - plus its own legend entry; it never tallies
into the MLNRV (category A) count the number ranges would otherwise give it.

Debug route resolution (TV-0016): the one per-session line-metadata query
also retains the raw GTFS route list (gtfsId, mode, shortName) alongside the
filtered tram-line index (`src/lib/digitransit.ts`). The rendering logic
never consults it; `resolveTramRouteDebug()` uses it - no extra request - so
the marker popup can tell the index's conflated null-reasons apart: route
absent from the GTFS route list, not TRAM mode, TRAM route without a GTFS
shortName, or a shortName failing the tram-line criteria. The popup's
live-trip rows (TV-0022) are the second half of the same readout: they show
whether that fallback was consulted, what it answered (matched route and
line, no live trip, or the failure reason) and how old its map is.

## API key setup

1. Register for a digitransit subscription key at
   <https://digitransit.fi/developers/getting-started/>.
2. Copy `.env.example` to `.env.local` in the repo root.
3. Set your key in `.env.local` as `VITE_DIGITRANSIT_API_KEY=<your key>`.
4. Restart the dev server - Vite only reads env files at startup.

`.env.local` is listed in `.gitignore` and must never be committed. Only
variables prefixed with `VITE_` are exposed to the app, and they are compiled
into the served bundle, so never commit a key or embed one in deployed code.

For the deployed GitHub Pages site, the key comes from the repo secret
`VITE_DIGITRANSIT_API_KEY` instead of `.env.local` (see
[Docs/deployment.md](./deployment.md)); because it is inlined into the
served bundle either way, the deployed key is public and must be
domain-restricted at digitransit.fi. The policy and its accepted
trade-offs are recorded in
[Docs/ADR/0003-public-api-key-policy.md](./ADR/0003-public-api-key-policy.md).

## Verifying the data flow

Run `npm run dev` and open the app. In the top-right corner of the map, a
small status panel (`src/components/TramStatusPanel.tsx`) reports the state
of the data client:

- an error box with the reason when the API key is missing or rejected, or
  the connection fails (since TV-0018 that includes the basemap: the same key
  serves it);
- the map itself: the HSL basemap tiles are requested with the key in their
  URL, so a working key means the HSL style is visible under the markers,
  and no key means no basemap layer and no tile request at all (key-less
  pages draw no markers either: `useTramPositions` starts the vehicle stream
  only once the keyed line metadata has resolved);
- "Loading tram line metadata..." while the keyed GraphQL query runs;
- "Connecting to the tram position stream..." while the MQTT subscription
  comes up;
- once live, a status line with the number of trams currently tracked and
  the time of the last update, plus a color legend for the tram rolling
  stock categories (`src/lib/fleet.ts`) shown on the map markers, each
  category entry carrying its live count of trams currently in the
  snapshot (TV-0012), the Unknown type entry only while an
  unknown-numbered tram is in the snapshot (TV-0014 - never a zero-count
  row), a SpåraKoff entry only while car #175 is in the snapshot
  (TV-0013 - never a zero-count row), and a red-dot entry for
  out-of-service trams (TV-0011).

TV-0015: the panel is collapsible with one click/tap. The chevron button in
its header row collapses it to a small semi-transparent circle pinned to the
same top-right spot; one click/tap (on the header chevron when expanded, on
the circle when collapsed) restores it. While the client is live the circle
shows the live tram count as a compact glanceable indicator. While collapsed
the panel content is unmounted - removed from the accessibility tree - and
the circle button itself is the keyboard- and screen-reader-operable control
(`aria-expanded`, the state in its aria-label). Collapse state is
per-session only: every page load starts expanded, nothing is persisted.

TV-0017: `index.html#/vehicle/<oper>/<veh>` is a second page: the
per-vehicle overview. It is reached from the marker popup's link (and by
typing the URL), and it owns the only data client while it is mounted - the
map's network-wide subscription is closed first, so one subscription runs at
a time (the routing decision and the URL contract are
[ADR 0004](./ADR/0004-vehicle-overview-page.md); the data and field facts are
the [ADR 0002 amendment](./ADR/0002-data-transport.md#amendment-vehicle-scoped-subscription-for-the-vehicle-overview-page)).
Live-measured load, 2026-09-25: the map's `vp/tram/#` stream carried ~380-400
raw messages/s, the one-vehicle stream 3-7 raw messages/s (about 55-100x
less). What the page shows, and the honesty limits on each reading:

- **One subscription, every event type.** The scoped filter carries `vp`,
  `due`, `arr`, `ars`, `dep`, `pde`, `pas`, `doo`, `doc`, `tlr`, `tla` for
  that vehicle; `oper` is padded to 4 digits and `veh` to 5, and `#` must
  terminate the filter (`tlr`/`tla` add one more topic level).
- **Duplicate deliveries.** The broker repeats most messages about four times
  on one subscription (measured: 120 raw = 33 distinct on a bare client; the
  app's own trace, 392 raw `vp` = 98 distinct `tsi`). The page therefore
  collapses a message whose topic, event type and `tst` were just seen before
  retaining anything, and shows both counts ("97 distinct of 349 received")
  instead of hiding the transport's behaviour.
- **`dl` sign and age.** `dl` > 0 is ahead of schedule, `dl` < 0 is behind,
  and it is only recomputed at stop events - so it is always shown with the
  age of the message that carried it, never as a live measurement.
- **Estimated arrival.** Only a stop event's own `ttarr`/`ttdep` is used
  (`timetable - dl`); a `vp` for the same stop is newer but carries no
  timetable time, so the estimate names the event and field it used. Nothing
  is shown when no stop event has announced a time.
- **`occu`** is present but 0 for every tram (100% of 20,069 sampled
  messages on 2026-09-25, and re-measured for TV-0021: 22,882 `vp` messages
  plus 9,435 messages across 13 event types, all 0), so it is not modelled or
  shown at all - the overview has no occupancy card and the reported-fields
  table has no `occu` row. The field's absence from the app is deliberate: see
  the [ADR 0002 amendment](./ADR/0002-data-transport.md#verified-field-facts-2026-09-25).
- **`drst`** appeared only as 0 or 1; only bit 0 (doors open) is interpreted,
  and the bits are printed as well as the interpretation.
- **`tlr`/`tla`** are traffic-light-priority requests and their
  acknowledgement, paired by `tlp-requestid` (live-verified: request
  `DOOR_CLOSE` id 134 acknowledged by `tla` decision `ACK` id 134). They are
  never presented as a signal colour or a countdown, and `DOOR_OPEN`/
  `DOOR_CLOSE` request types are labelled as being about doors.
- **`loc`** (`GPS`, or `DR` dead reckoning on ~1% of messages) is
  informational and never gates rendering.
- **Two staleness budgets.** 15 s without a `vp` marks the telemetry stale
  while keeping the last values and the event history; the map's 5-minute
  `POSITION_STALENESS_MS` removal rule stays map-only.
- **Per-session only.** No `localStorage`, `sessionStorage`, IndexedDB or
  cookies; the retained 200-event list, the 400 message identities and the
  15-minute `dl` window are dropped when the page closes.
- **Which pattern of the line is shown (TV-0020).** A route has several
  patterns per `directionId`, so the page resolves the vehicle's own trip from
  the routing API's `patterns.vehiclePositions` (the API matches HFP to trips
  itself) and only falls back to an inference - direction, then headsign
  containment, then the reported next stop, then the longest pattern - when no
  live trip is reported. The card labels an inferred pattern, and the raw
  reported stop id plus the "next stop is not in this pattern" note remain the
  honest output when the chosen pattern really does not contain that stop. The
  measured failure the selection replaced: the first pattern with a matching
  `directionId` did not contain the reported next stop for 16.5% of live
  vehicles
  ([ADR 0002 amendment](./ADR/0002-data-transport.md#additional-keyed-graphql-query)).
- **Which route the page asks about, and which line it shows (TV-0022).** The
  page applies the map's two-step resolution (see the out-of-service paragraph
  above): the reported route id first, else the Routing API's live-trip match.
  When that match is what labels the vehicle, the **matched** route id is what
  the pattern query asks about, so a vehicle whose HFP route id has no GTFS
  route entry (e.g. `1001H6`) renders its stop sequence instead of the "no trip
  patterns" note; the note always names the route that was queried, and a
  vehicle with no match still queries its reported route id. While that
  vehicle is unresolved the page keeps the match fresh on the map's cadence
  (at most one request per 60 s, none while the tab is hidden); a vehicle whose
  route id resolves in the index issues no such request at all.

Positions and line metadata are produced by `src/lib/hfp.ts` and
`src/lib/digitransit.ts`, and surfaced to UI code as `TramPosition` objects
via the `useTramPositions()` hook (`src/hooks/useTramPositions.ts`).
`src/map/MapView.tsx` renders the live markers (one teardrop-shaped marker
per vehicle: the line short name inside the rounded body, the body colored
by the vehicle's rolling stock category, the point rotated toward the
vehicle's reported heading, and a hover tooltip with the full model name,
managed by `src/map/TramMarkers.ts`; an out-of-service vehicle swaps the
line short name for the red not-in-service dot, and the SpåraKoff bar tram
(TV-0013) always shows its `K` and its own color instead of both).

TV-0018: the basemap is the Digitransit Map API's `hsl-map` source (HSL's
generic style, 512 px raster tiles) instead of OpenStreetMap standard tiles;
the decision, the compared alternatives and the measured tile facts are in the
[ADR 0001 amendment](./ADR/0001-map-library.md), and the key's new surface in
the [ADR 0003 amendment](./ADR/0003-public-api-key-policy.md). The tile URL is
built in `src/map/constants.ts` (`mapTileUrl()`, with Leaflet's `{r}` retina
placeholder) and the layer is added in `src/map/MapView.tsx` with
`tileSize: 512` and `zoomOffset: -1` - the mapping measured on 2026-09-25,
where a 512 px tile at z/x/y covers the same ground as the 256 px source at the
same z/x/y, so the app asks for the tile one zoom below the map zoom. The key
is read through `tryGetDigitransitApiKey()`: with no key there is no basemap
and no unauthenticated tile request, and the status panel's missing-key error
is the explanation. `MAX_MAP_ZOOM` stays 19, which requests at most URL zoom 18
(above that the service adds no detail); zoom levels 11-19 and the default
center/zoom are unchanged.

TV-0016: clicking or tapping a marker body opens a Leaflet popup bound to
that marker (`src/map/TramMarkerPopup.ts`), so it follows the tram as it
moves. It is the in-field diagnostic for the red-dot decision: identity
(oper/veh key), fleet type and its source (vehicle-number range lookup vs
the SpåraKoff special case, including what the range lookup alone would say
for car #175), the full route resolution (raw HFP `routeId`, the `HSL:`
GTFS key, membership in the tram-line index, the GTFS shortName, whether it
passes `isTramLineShortName`, and the distinct null-reason when absent -
route absent from GTFS / not TRAM mode / no GTFS shortName / shortName
failing the line criteria), the live-trip input (whether it was consulted
at all - it is not, when the raw route id resolves in the index - and, when
it was, the matched `gtfsId`, route and line, or "no live trip" for this
vehicle, or the lookup's failure reason, always with the age of the
live-trip map), the line the snapshot actually shows, the
computed offline boolean, a one-line red-dot verdict, and freshness
(`receivedAt`, its age in seconds, and the staleness budget). The readout
refreshes with every snapshot while open and closes by itself when the
vehicle drops from the snapshot; one popup shows at a time, and closing is
normal Leaflet behavior (× button, map click, Esc). It is presentation
only: the popup reads the same state the markers render, never mutates it,
and nothing is persisted. The native hover tooltip is untouched.
While the tab is hidden, the position stream and the one-second snapshot tick pause
entirely and resume on focus, so a hidden tab pulls no feed traffic.
