# ADR 0004: Vehicle overview page

- Status: **Accepted (2026-09-25, user decision); implemented (2026-09-25)**
  by [TV-0017](../../Tasks/TV-0017-vehicle-overview.md), merged after review.
- Decides: that the per-vehicle overview is a separate page, how it is
  reached, its URL contract, which data client it owns, and the capabilities
  it deliberately excludes.
- Affects: `src/App.tsx`, `src/map/TramMarkerPopup.ts`,
  `src/hooks/useVehicleTelemetry.ts` (new), `Docs/digitransit.md`.
- Data decisions for that page: amendment to
  [ADR 0002](./0002-data-transport.md).

## Context

Tram View today is one screen: a full-viewport Leaflet map with markers, a
status panel, and a marker popup (TV-0016). The user asked for an in-depth
per-vehicle view - speed, direction, acceleration, schedule deviation, door
state, traffic-signal-priority state - built from as much of the HFP message
set as is honest to display, and reviewed it as a mobile-first "journey
timeline" mockup in the 2026-09-25 session, with the stated core use case of
reading it **while riding a tram**.

Constraints that decide the URL shape:

- The app is a static front end on GitHub Pages with no backend and no router
  dependency; `package.json` holds only leaflet, react and react-dom, and the
  task paths for this work exclude `package.json`, so a routing library is
  not available.
- `vite.config.ts` sets `base: "/tram-view/"` for a project-site subpath.
- There is **no SPA fallback**: the repository has no `public/` directory and
  the deploy workflow publishes `dist/` as-is (verified 2026-09-25), so any
  path route other than `/tram-view/` returns GitHub Pages' 404 on a hard
  load or refresh. A path-based route would therefore need a new
  `404.html`-copying build step - a deployment change, not a UI change.

Two product decisions from the same session bound the scope: the page must
not try to detect that the user is on board a particular tram (no device
location, no QR/car-number entry), and it must not add arrival alerts or
screen-wake behaviour.

## Options

### Option A - In-app view switch with no URL

Render the overview in place of the map as component state; the URL never
changes.

- Pros: smallest change; nothing new in the deploy.
- Cons: not shareable and not refresh-safe (a reload silently returns to the
  map); browser back does not leave the page; and no way to send someone the
  vehicle being discussed - the opposite of what an inspector view is for.

### Option B - Hash route `#/vehicle/<oper>/<veh>` (chosen)

Keep one document and one entry point; the hash selects the view, and the
vehicle is identified by the operator/vehicle numbers the app already uses as
its vehicle identity (`vehicleKey`).

- Pros: deep-linkable and refresh-safe on GitHub Pages with no server support
  and no build change, because the fragment never reaches the server; no new
  dependency (a `hashchange` listener plus a parse function); back/forward
  work through normal history behaviour; the identity in the URL is the same
  key the MQTT topic is built from.
- Cons: fragment URLs are slightly uglier and are not indexed; the parse has
  to reject malformed input itself.

### Option C - Path route `/tram-view/vehicle/<oper>/<veh>`

- Pros: the cleanest, most conventional URL; still no router dependency if
  hand-parsed.
- Cons: requires an SPA fallback in the build (a `404.html` copy or a Vite
  multi-page setup) and a change to the deploy workflow, i.e. a deployment
  decision taken for a URL's appearance rather than for a capability the
  product needs; and a wrong path currently has no way to surface a
  correctable error.

## Decision

Option B.

1. **Separate page.** The overview is its own view with its own data client,
   rendered instead of the map. It is not a modal, a popup, or a panel over
   the map.
2. **URL contract.** `#/vehicle/<oper>/<veh>` (e.g. `#/vehicle/40/402`)
   selects the overview for those integers. No hash, or any hash that does
   not match, renders today's map page unchanged. Malformed routes render an
   explicit "unknown vehicle" state instead of throwing or falling back
   silently. The route is honoured on load and on `hashchange`, so the
   browser's back/forward buttons and pasted links both work.
3. **Entry point.** The existing marker popup keeps its TV-0016 debug readout
   and gains exactly one navigation affordance to that vehicle's overview.
   The overview supplies its own back control to the map.
4. **One data client at a time.** The overview owns the vehicle-scoped MQTT
   subscription; the map owns the network-wide one. Navigating closes the
   other, so exactly one connection is open at any moment (amendment to
   [ADR 0002](./0002-data-transport.md)).
5. **Excluded by decision (2026-09-25, user).** No "you are on board"
   detection (no device geolocation, no scanning or typing a car number); no
   arrival alerts, notifications, or Screen Wake Lock; no occupancy estimate;
   no second map on the overview page.

## Why

- It is the only option that gives a shareable, refresh-safe, deep-linkable
  vehicle URL under the existing deployment constraints without adding a
  dependency or a build step - the capability the user asked for, at the cost
  of a fragment URL's appearance.
- A separate page is also what makes the ~100x cheaper vehicle-scoped
  subscription possible (ADR 0002 amendment): the map's network-wide
  subscription is closed while a single vehicle is being watched, which is
  the honest reading of ADR 0002's "lowest possible API load" for this view.
- Everything the page displays stays inside the two transports already
  decided: MQTT for live vehicle state, the keyed Routing API for the
  stop-sequence metadata. No new data source, no new key, no backend.
- Excluding on-board detection, alerts and wake lock keeps the page free of
  permissions, background timers, and device-location handling, all of which
  would outlive the page and need their own decisions.

## Consequences

- The map's rendering, marker behaviour, popup content and status panel are
  unchanged; the popup gains one link (guard rail for TV-0017).
- Deep links are part of the product's public surface now: the `#/vehicle/`
  shape is referenced by tasks and documentation, and changing it later is a
  URL-contract change to be recorded here first.
- The hash is client-only, so a path-based URL remains available as a
  follow-up: it needs a `404.html` fallback in the deploy pipeline, which is
  a deployment decision to be taken on its own merits, not as part of this
  page.
- Because the vehicle is identified by `oper`/`veh` and not by a journey or
  trip id, the page follows the vehicle across journeys (a tram that changes
  line or goes out of service stays the same vehicle). This is deliberate: it
  is the identity the MQTT topic is built from and the one users read off the
  tram.
- Revisit this ADR if the app gains other pages that need real URLs, if path
  routes become a requirement, or if the route shape changes.
