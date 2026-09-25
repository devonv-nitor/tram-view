---
id: TV-0017
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: []
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Add the vehicle overview page: per-tram telemetry over a vehicle-scoped HFP subscription

The user asked (2026-09-25) for an in-depth per-vehicle view showing as much
of the HFP message set as is honest to display - speed, direction,
acceleration, schedule deviation, door state, traffic-signal-priority state -
with the core use case of reading it **while riding a tram**, so the page is
mobile-first. The user approved it as a **separate page** whose subscription
is **scoped to the chosen vehicle only**, and decided against on-board
detection, arrival alerts and Screen Wake Lock in the same session.

Decisions this task implements (authority, do not re-decide):

- [ADR 0004](../Docs/ADR/0004-vehicle-overview-page.md) - separate page, hash
  URL `#/vehicle/<oper>/<veh>`, marker-popup entry point, one data client at a
  time, and the excluded capabilities.
- The [ADR 0002 amendment](../Docs/ADR/0002-data-transport.md#amendment-vehicle-scoped-subscription-for-the-vehicle-overview-page) -
  the vehicle-scoped topic filter, the retained per-vehicle state and its
  bounds, the pattern query, and the verified field facts.

Facts already verified live (2026-09-25) and NOT to be re-derived: the topic
filter shape and padding, that one scoped filter carries every per-vehicle
event type, the `dl` sign, `occu` being always 0, `drst` being 0/1, the
`tlr`/`tla` request/decision semantics and their request-type values, the flat
per-event envelope every event type shares, `dir` = `directionId + 1`, and
`patterns.stops[].lat/lon` being present. All of them, with their sample
sizes and commands' results, are in the ADR 0002 amendment.

## Requirements

1. **Routing.** `index.html#/vehicle/<oper>/<veh>` (e.g. `#/vehicle/40/402`)
   renders the overview for those two integers. No hash, or any hash that
   does not match the shape, renders today's map page unchanged. Malformed
   input (missing/extra segments, non-numeric, negative, empty) renders an
   explicit unknown-vehicle state - never a throw, never a silent fallback to
   the map. The route is honoured on load and on `hashchange`, so
   back/forward and pasted links work. No routing dependency is added.

2. **Entry point.** `src/map/TramMarkerPopup.ts` gains exactly one navigation
   affordance: a link from a vehicle's popup to that vehicle's overview URL.
   Everything else about the popup is unchanged - the TV-0016 readout fields
   and their escaping, the refresh-while-open behaviour, self-close on drop
   from the snapshot, one-popup-at-a-time, closing by ×/map click/Esc, and
   the native hover tooltip.

3. **One subscription at a time.** While the overview is mounted, no
   network-wide subscription exists, and the overview subscribes to exactly
   one filter: `/hfp/v2/journey/ongoing/+/tram/<oper>/<veh>/#` with `oper`
   zero-padded to 4 characters and `veh` to 5, `#` last. Navigating between
   the map and the overview closes the previous subscription (no leaked
   socket, no two connections, no subscribe/unsubscribe churn while sitting
   on one page). `src/lib/mqtt.ts` is not modified: one filter per
   subscription is what the existing client already does.

4. **Retained state** (the ADR's bounds, all in memory, nothing persisted -
   no `localStorage`, `sessionStorage`, IndexedDB, or cookies): latest `vp`
   telemetry (position, `spd`, `acc`, `hdg`, `dl`, `odo`, `drst`, `occu`,
   `loc`, `desi`, `dir`, `jrn`, `line`, `start`, `oday`, `route`, `tst`); the
   next stop id and headsign from the payload when present, else from the
   topic; door state from `drst` bit 0
   plus the last `doo`/`doc`; the latest `tlr` paired with the `tla` sharing
   its `tlp-requestid`; a rolling event list capped at 200 *distinct*
   events; `dl` samples over a rolling 15-minute window. The broker repeats
   most messages about four times on one subscription, so a message whose
   topic, event type and `tst` were already seen within the last 400
   identities is counted but otherwise ignored: without that, every door
   event, priority request and `dl` sample would be retained four times. Raw
   and distinct counts are both shown.

5. **Honest field display** (verified constraints, not suggestions):
   - `dl` > 0 is **ahead of** schedule, `dl` < 0 is **behind**; no user-facing
     string may invert this, and no reading may present `dl` as precise
     (±minute timetables; outliers to ±hundreds of seconds exist).
   - `occu` may appear only as a raw reported value, and no occupancy visual
     (bar, scale, colour, "empty/full" word) may be derived from it.
   - `tlr`/`tla` are presented as traffic-light-priority requests and their
     decision, showing the request type (`DOOR_OPEN`, `DOOR_CLOSE`, `NORMAL`,
     `ADVANCE` observed), the request id, and the paired decision - never as a
     signal colour, a signal countdown, or a guaranteed green.
   - `drst` is presented as bit 0 (doors open/closed) only.
   - `loc` is informational text (`GPS`, or `DR` for dead reckoning on ~1%
     of messages) and must not gate rendering or alter any other value.
   - Stop names come from the pattern query; the only stop *times* shown are
     ones actually observed in a stop event (`ttarr`/`ttdep`). Rows must not
     imply a timetable that was not observed, and the arrival estimate must
     take its timetable time from the latest event *that announced one*: a
     `vp` for the same stop is newer but carries no timetable time, so using
     it would silently drop a known time.

6. **Pattern query.** One keyed GraphQL query per (route, direction) per
   session -
   `route(id: "HSL:<routeId>") { patterns { directionId headsign stops { gtfsId name lat lon } } }`
   - cached, so repeated mounts and repeated vehicles on the same line do not
   re-request. The pattern is selected by `directionId === Number(dir) - 1`,
   never by the headsign string (the topic abbreviates; GTFS does not). A
   failed, empty, or key-rejected pattern query must not block telemetry: the
   page renders the MQTT-derived data and marks the journey spine unavailable
   with the reason. The per-session `routes` index is reused, not re-fetched.

7. **Out-of-service and identity consistency.** The page reuses
   `resolveTramShortName` / the per-session route index, so a vehicle whose
   route resolves to no displayed tram line is shown as not in service,
   consistent with the map's red dot (TV-0011), and the SpåraKoff identity
   rule (TV-0013, operator 40 + vehicle 175) is applied the same way the map
   applies it.

8. **Staleness is shown, not dropped.** Before the first `vp` the page shows
   a no-data state; after 15 s without a `vp` it marks the telemetry stale
   while keeping the last known values and still showing the event history.
   The selected vehicle is never removed from the page. The map's
   `POSITION_STALENESS_MS` removal rule stays map-only and unchanged.

9. **Visibility behaviour.** While the tab is hidden the overview closes its
   stream and stops its snapshot tick, and reconnects on focus - the same
   behaviour and the same API-load argument as the map page (ADR 0002).

10. **Layout.** Mobile-first, verified at 360, 390, 430, 768 and 1440 px: no
    horizontal overflow at any of them; ≥900 px reflows the same components
    into the two-column desktop arrangement; every interactive control is at
    least 44×44 px; the next-stop summary is pinned in the thumb zone and
    clears `env(safe-area-inset-bottom)`; at maximum scroll no content is
    permanently hidden behind the pinned area. The map page keeps its
    full-viewport, non-scrolling behaviour (`#root`/`body` scrolling
    unchanged for the map); the overview scrolls its own content.

11. **Accessibility.** The next-stop summary and status changes are announced
    via `aria-live` (as the status panel already does), the pinned controls
    and the back control are real labelled buttons/links, the page has a
    visible way back to the map, and the page has a landmark/heading
    structure a screen reader can navigate.

12. **No scope creep.** No `package.json` change; no router, chart, or state
    library; no map/Leaflet view on the overview page; no alerts,
    notifications, Screen Wake Lock, device geolocation, or on-board
    detection (user decision 2026-09-25); no persistence of any kind; no
    change to the map's markers, panel, or popup other than requirement 2.

13. **Docs.** `Docs/digitransit.md` gains the overview's data flow: the
    vehicle-scoped filter, the retained event set and its bounds, the `dl`
    sign, `occu` never being populated, `drst` bit 0, the `tlr`/`tla`
    request/decision semantics, the `dir` ↔ `directionId` mapping, and the
    two staleness budgets. ADR 0004 and the ADR 0002 amendment lose their
    "not yet implemented" labels and link this task as the implementation.

## Acceptance

1. `npm run lint`, `npm run format:check` and `npm run build` are green;
   `dist/` is deleted afterwards; `.env.local` is verified git-ignored and
   its key is never printed, committed, or included in evidence; no
   `package.json` change (if one were unavoidable it must be disclosed
   explicitly rather than slipped in).

2. **Subscription scope, live.** With a headless browser and CDP over the
   real feed: open a real vehicle's overview (chosen from the network-wide
   stream) and capture evidence that exactly one `wss://mqtt.hsl.fi`
   WebSocket exists, that the subscription it sends is the vehicle-scoped
   filter for that vehicle, and that no network-wide `vp/tram/#` subscription
   is sent while the overview is open. Evidence = the captured subscribe
   frame(s)/network log plus the on-screen values.

3. **Values match the wire.** For at least 10 fields shown on the page
   (including `spd`, `acc`, `hdg`, `dl`, `odo`, `drst`, `desi`, `dir`, the
   next stop id, and the vehicle identity), capture raw broker payloads for
   that vehicle and second and show they agree with what the page displays.
   DISCLOSE any field that could not be cross-checked.

4. **`dl` wording, live.** Capture a live `dep`/`arr`/`pde` event for the
   displayed vehicle with its `tst` and `ttdep`/`ttarr` and show the page's
   early/behind wording matches `sign(dl)` per requirement 5. If the vehicle
   emits no stop event within the observation window, a `vp` `dl` with its
   timestamp is an acceptable substitute and must be DISCLOSED as such.

5. **Direction mapping and spine.** Show the decoded pattern actually used
   for the displayed vehicle, that it was selected by
   `directionId === Number(dir) - 1`, and that its stops/headsign agree with
   the live topic for that vehicle. Show that a vehicle changing direction
   (or line) mid-session causes a re-selection, or, if no such change occurs
   in the window, DISCLOSE that the re-selection was exercised by navigating
   to a vehicle on the opposite direction instead.

6. **Pattern-query budget.** Evidence that one route+direction is queried
   once per session despite repeated mounts/navigations, and that a rejected
   or failing pattern query (e.g. a deliberately bad key in a throwaway
   build/local override, without printing the key) still renders telemetry
   with the spine marked unavailable.

7. **Honesty checks.** Evidence that no occupancy visual exists anywhere in
   the rendered page (DOM inspection), that `occu` appears only as a raw
   reported value, that `tlr`/`tla` are labelled as a priority request and
   decision with no signal-colour or countdown claim, and that `drst` is
   presented as bit 0 only.

8. **Staleness, live.** Show the stale marker appearing after 15 s without a
   `vp` and the last known values remaining visible. Pointing the page at a
   vehicle that has ended its journey is the preferred live route; if no such
   case is observable, a synthetic demonstration (e.g. a temporarily
   interrupted feed) plus a code-review argument is acceptable and must be
   DISCLOSED as synthetic.

9. **Visibility.** Evidence that hiding the tab closes the overview's stream
   and stops the tick (no MQTT frames while hidden) and that focusing
   reconnects and resumes updates.

10. **Layout measurements.** At 360/390/430/768/1440 px: no horizontal
    overflow, every control ≥44×44 px, and no content permanently hidden
    behind the pinned area at maximum scroll - the same measurements the
    2026-09-25 mockups were checked with. Also show the map page at `#`
    still not scrolling the document while the overview does.

11. **Guard rail.** The map page at no hash renders as before: markers,
    category colours, red-dot out-of-service markers, SpåraKoff marker, the
    status panel's content/collapse behaviour, and the popup's existing rows
    all unchanged; the popup additionally links to the overview. Evidence:
    before/after capture of the map page plus the popup diff.

12. **Duplicate collapsing, live.** Evidence from the wire that the broker
    delivers a message more than once on one subscription, that the page
    counts those repeats without retaining them (the retained event count
    equals the distinct count, not the raw one), and that both counts are
    shown rather than one being hidden.

13. **Service check.** Repeatedly navigating map → overview → map leaves one
    connection open at a time and a stable connection count (no growth, no
    leaked handles), with the browser console free of errors and unhandled
    rejections throughout.

## Notes

- The page deliberately has no map. Do not mount Leaflet there (requirement
  12); the journey spine, coordinates and distance-to-next-stop are what
  replace it.
- `desi` is the display line name from MQTT and is sufficient for display;
  `line` is the GTFS line id (e.g. 32 for route `1004`) and must not be shown
  as a line name.
- The topic headsign segment can be a short-turn or `Ei linjalla` ("not in
  service"); it is display text, not an identity. Identity is `oper` + `veh`
  (the URL and the subscription), and journey/line identity is the topic's
  route + `dir`.
- Stop ids appear both as 7-character ids in topics/payloads and as
  `HSL:<id>` GTFS ids in GraphQL; map between them, do not assume they are
  the same string.
- Merge order: independent of every retired task; nothing else is open, so a
  single-branch wave is expected. Coordinator follow-ups after merge: verify
  the hosted Deploy to GitHub Pages run is green and review the merge delta
  against this task's requirements (AGENTS.md merge-delta rule).

## Handoff (status: REVIEW → DONE — optional, delete before merge)

Implemented 2026-09-25 in one pass (no subagents: the user asked for the work
directly). Files: `src/lib/{hfp,digitransit,vehicleTelemetry,journey,format,route}.ts`,
`src/hooks/{useVehicleTelemetry,useHashRoute}.ts`,
`src/components/vehicle/*.tsx`, `src/App.tsx`, `src/index.css`,
`src/map/TramMarkerPopup.ts`, `Docs/digitransit.md`, ADR-0004 and the ADR-0002
amendment.

Checks run (all green, 2026-09-25):

- `npx tsc -b`, `npm run lint` (0 warnings), `npm run format:check`,
  `npm run build`; `dist/` deleted after the last build.
- Live verification against the real feed with headless Chrome + CDP frame
  decoding (`/tmp/tv0017-verify-{1..6}.mjs`, evidence in `/tmp/tv0017/`):
  - map → popup (one link, `#/vehicle/40/612`) → overview → back to the map:
    one socket at a time, 1 close per navigation, and the overview's only
    subscription was `/hfp/v2/journey/ongoing/+/tram/0040/00612/#` with only
    that vehicle's messages on the wire.
  - production build (`vite preview`): 1 `TramRoutes` + 1 `TripPattern` POST
    (+ 1 CORS preflight) for the overview, 1 `TramRoutes` for the map; no
    StrictMode doubles (those are dev-only).
  - 10 DOM values matched the wire payload for the same `tst` (`oper/veh`,
    `desi`, `route`, `dir`, `jrn`, `oday`, lat/long, `loc`, `hdg`, `occu`,
    plus `dl` value and its ahead/behind wording).
  - `tlr` `DOOR_CLOSE` id 134 paired with `tla` `ACK` id 134 live; doors card
    matched the `doo`/`doc` events; spine row and estimate matched
    `ttarr 14:46` with the reported `dl`.
  - duplicates collapsed: 97 distinct of 349 raw received on the page, and the
    200-event list held one row per distinct message.
  - layout at 360 and 1280 px: no horizontal overflow, every control ≥44×44 px
    (the pinned "Map" button was 42×21 px before this was measured - fixed in
    `src/index.css`), the bar is in flow and no card is left unreachable.
  - staleness (offline emulation): pill "stale", last values and history kept,
    live again after reconnect; hidden tab closed the stream (1 close, no new
    subscribe) and focus reopened it (1 new subscribe).
  - `#/vehicle/abc`: explicit unknown state, no map fallback, no MQTT
    subscription and no GraphQL call. Map page at `#`: one network-wide
    subscription, one `TramRoutes` query.

Known limitations (honest):

- Hidden-tab behaviour was verified by stubbing `document.visibilityState` and
  dispatching the real `visibilitychange` event: headless Chrome keeps
  background pages "visible".
- Staleness was verified by taking the browser offline, not by pointing the
  page at a vehicle that ended its journey.
- The estimate only appears once a stop event for the current next stop has
  arrived in the session, which takes up to a stop interval (~25 s).
- `pos`-quality, `occu` and the TLP fields are shown as reported; HFP
  publishes no signal colour or countdown, and the page says so.

Reviewer instructions: judge the diff against the requirements above;
`origin/main..origin/<branch>`, verifying the reported tip SHA first.
