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
| One line's stop sequences | Routing API v2 GraphQL, query `route(id: "HSL:<routeId>") { patterns { directionId headsign stops { gtfsId name lat lon } vehiclePositions { vehicleId trip { gtfsId stoptimes { scheduledArrival realtimeArrival stop { gtfsId } } } } } }`, once per route per session and cached; which pattern is shown is chosen per vehicle from the API's own live-trip match (TV-0017, TV-0020); TV-0025 adds each matched vehicle's trip and its stop times, which is the timetable the marker popup's ETA corrects by the reported deviation | required |
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

TV-0023: the marker popup carries passenger-facing content only and no longer
shows the TV-0016 debug route resolution. Nothing reads that resolution now:
the raw GTFS route list the metadata query still retains, and
`resolveTramRouteDebug()` (`src/lib/digitransit.ts`), have no caller - removing
them is [TV-0024](../Tasks/TV-0024-retire-debug-route-plumbing.md).

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

Run `npm run dev` and open the app. A compact status strip
(`src/components/TramStatusPanel.tsx`) pinned to the bottom-left corner of
the map, above the attribution band, reports the state of the data client:

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
  the time of the last update (minute precision), plus the tram rolling
  stock legend (`src/lib/fleet.ts`) as inline chips on a second row, one
  chip per present category with a count of the trams of that type
  currently in the snapshot (TV-0012), the Unknown type chip only while an
  unknown-numbered tram is in the snapshot (TV-0014 - never a zero-count
  row), a SpåraKoff chip only while car #175 is in the snapshot (TV-0013 -
  never a zero-count row), and a red-dot chip for out-of-service trams
  (TV-0011; TV-0027: the chip carries its live count - the out-of-service
  trams are excluded from the category chips, so the status line's total
  equals the sum of the category counts + the Not-in-service count + the
  SpåraKoff count, 0 or 1). The chips show short labels (MLNRV, Artic, X54,
  Unknown, SpåraKoff, Not in service); the full `fleet.ts` model name is
  on each chip's `title` tooltip.

TV-0027: the strip is z-index 640 - above the map pane's tier in the root
stacking context (.leaflet-map-pane carries a transform, so it is its own
stacking context and the panes' internal z-indexes - marker 600, tooltip
650, popup 700 - order only inside it), so the strip covers map content in
its own corner, an open popup included when one overlaps the strip's band;
Leaflet's autoPan keeps a naturally-anchored popup clear of the strip. A
popup guaranteed above the strip needs the popup rendered outside the map
pane's subtree (a MapView/TramMarkers change - recorded as the TV-0027
STOP-DECISION for a follow-up). The strip sits at
`left: 1rem; bottom: 2.25rem`, clear of the attribution band; on narrow
viewports the chips wrap inside their row and the strip clamps to the
viewport, so it never overlaps the attribution and never causes horizontal
scroll.

TV-0015: the strip is collapsible with one click/tap. The collapse button
pinned to the status row's right edge folds it to a small pill pinned to
the same bottom-left spot; one click/tap (on the row's collapse button
when expanded, on the pill when collapsed) restores it. While the client
is live the pill shows the live tram count as a compact glanceable
indicator; while loading, connecting, or errored it shows an expand
chevron. While collapsed the strip content is unmounted - removed from
the accessibility tree - and the pill itself is the keyboard- and
screen-reader-operable control (`aria-expanded` on both affordances, the
state in the aria-label, and the focus handed to the other affordance on
every toggle). Collapse state is per-session only: every page load starts
expanded, nothing is persisted.

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

TV-0023: clicking or tapping a marker body opens a Leaflet popup bound to
that marker (`src/map/TramMarkerPopup.ts`), so it follows the tram as it
moves. It is the passenger-facing HUD the user chose from the design round
(Tasks/mockups/mockup-01-hud-dashboard.html): a line badge, the vehicle key
over the GTFS route key, a headsign pill, speed and ETA side by side (TV-0025
replaced the Heading cell - the heading stays on the marker's direction
rotor), door state and schedule deviation side by side, and the next stop. It is
drawn in a dark shell - Leaflet's popup chrome is restyled under the
`tram-hud-shell` class - and it **replaced** the TV-0016 debug readout rather
than joining it. The next stop is the id the HFP payload reports (`stop`),
with the HFP topic's level-13 next-stop id filling the roughly half of `vp`
messages whose payload omits it (the two agreed in every sampled position;
TV-0025), resolved against the stop names of the route's patterns (the same
cached per-session query the vehicle overview's spine uses, via
`loadRouteStopNames`); the bare id is the honest fallback until that load
resolves and when it fails, and names are asked for only while a popup is
open, once per route per session. Door state comes from `drst` bit 0, the
deviation from `dl`, and the headsign from the HFP topic, all carried on the
snapshot (`src/hooks/useTramPositions.ts`); a field the feed has not reported
reads "—" rather than a guess. The readout refreshes with every snapshot
while open and closes by itself when the vehicle drops from the snapshot; one
popup shows at a time, and closing is normal Leaflet behavior (× button, map
click, Esc). It is presentation only: the popup reads the same state the
markers render, never mutates it, and nothing is persisted. The native hover
tooltip is untouched.

TV-0025: the popup's ETA cell is the estimated time to the next stop, in
whole seconds (`35 s`, `252 s` - seconds only, never `M:SS`). HFP `vp`
payloads carry no timetable field, so the instant comes from the keyed
Routing API: the extended per-route pattern query also carries each matched
vehicle's trip with its stop times (`loadRoutePatterns`, shared with the
stop-names load and the overview's spine), and the timetable instant for the
next stop is that trip's stop time matched by bare stop id. Stop times are
seconds since Europe/Helsinki local midnight (not epoch), and TV-0026 anchors
them to the day the tram is actually running: the day is resolved against
both candidates - the day parsed from the trip's gtfsId and the current
Helsinki date - and the candidate whose corrected arrival (midnight +
seconds - `dl`) is nearest to `now` wins. Nearest-to-now is what makes the
anchor honest in both directions: the API's live match can name a trip whose
gtfsId day is days behind the day the vehicle is running (measured
2026-09-28: 70 of 105 live-matched trips dated three days back, while the
trip's own stop times lined up with the wall clock, and `Trip.serviceDay`
being no queryable field), while a genuine post-midnight trip (`25:30` on
yesterday's service day) must still resolve to today 01:30, the nearer
candidate. The corrected arrival is the timetable instant minus the
*reported* `dl` (positive = ahead of timetable, so it is subtracted - the
same model as the vehicle overview's `estimateNextArrival` in
`src/lib/journey.ts`), rendered from `now` at render time, so the value
counts down with the popup's snapshot rebuild and no second timer exists. A
differing `realtimeArrival` is preferred when the API supplies one (measured
2026-09-26: it never differs today).

TV-0026: `0` prints only when the answer is genuinely 0. The old clamp at 0
(`max(0, round(etaMs / 1000))`) reported a passed estimate as a confident
`0 s`: a large positive `dl` alone pushes the corrected arrival into the
past (measured 2026-09-28: a vehicle standing at its trip origin reported
`dl` +359 s), and a stop time anchored days back landed there too. The
rendering is now the rule in `etaSecondsToNextStop` (`src/lib/journey.ts`):
the rounded countdown while the corrected arrival is in the future (`0` only
within half a second of `now`), `0` while it is at most 90 s past
(`ETA_PAST_TOLERANCE_MS`; the tram is at or leaving the stop, where 0 is the
true answer), and the muted `—` beyond that. A materially passed estimate
therefore never prints a negative value and never prints a false `0`. The
value is an estimate and is
labelled one: the cell carries an accessible one-line explanation (and a
hover title) that the figure is the timetable corrected by the reported
deviation, not a measurement. The muted "—" is the fallback when the
vehicle has no live trip in the API's match, the trip has no stop time for
the next stop, the reported deviation is missing, the load has not
resolved, or the corrected arrival is materially in the past - never a
guess. The patterns request happens only while a popup
is open, once per route per session (cached per session alongside the
stop-names load); there is **no second data stream** - no polling, no extra
MQTT subscription, no new dependency (verified live 2026-09-28: the
WebSocket connection count does not change across popup opens).
While the tab is hidden, the position stream and the one-second snapshot tick pause
entirely and resume on focus, so a hidden tab pulls no feed traffic.
