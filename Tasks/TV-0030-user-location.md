---
id: TV-0030
status: IN_PROGRESS
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

# The user's position: center the map on them and show a you-are-here marker

The user's 2026-10-13 request: use the browser's location to start the map
centered on the user, with a marker showing where they are. Zero new API
calls and zero new dependencies - the browser's Geolocation API
(`navigator.geolocation.watchPosition`) carries everything, and Leaflet
renders the marker. The user delegated the scoping ("I trust you to scope
it out") and wants the dev server up for testing when the implementation
lands.

## What is true now (code-verified 2026-10-13)

- `MapView` creates the map with a fixed center
  (`HELSINKI_TRAM_NETWORK_CENTER`) and `DEFAULT_MAP_ZOOM`
  (`src/map/constants.ts`); the map is not centered on the user today.
- Leaflet's marker/pane machinery is in active use (markers, a custom
  heatmap pane, the overlay pane); a user-location marker is one more
  marker on a dedicated Leaflet layer, or its own pane - simplest is a
  dedicated `L.Marker`/`L.CircleMarker` pair or one `L.LayerGroup`, added
  to the marker pane like the trams (the user marker must sit above the
  heatmap, above the overlay, and it must never be under the tram markers'
  hover hit area unless that is the honest behavior: the tram markers are
  non-interactive for clicks through their own listener, so a user marker
  may sit at the same tier - the coordinator's call: put the user marker
  in the markerPane tier as a normal Leaflet marker so it renders above
  the heatmap and overlay like the tram markers do).
- The map page mounts through `MapPage` (`src/App.tsx`) and owns
  `useTramPositions`; `MapView` receives `positions` and the toggle state.
- HTTPS is the deployment (GitHub Pages); `localhost` is a secure context
  too, so `navigator.geolocation` is available in both. A plain `http://`
  non-localhost origin would not expose the API - the app never runs on
  one (the ADR-0003 deployment is Pages/HTTPS), so no fallback needed.

## Requirements

1. **Ask once, on the map page's mount, only for the geolocation
   permission.** The prompt is the browser's own (no custom UI); the app
   never blocks on it: the map renders immediately with the default
   Helsinki view, and the user's position appears when (and if) the user
   grants it. A denial, an error, or a timeout leaves the default view -
   the map must never be a blank/throwing page because of geolocation.
2. **Center once, then track.** When the first fix arrives with a usable
   accuracy (≤ 500 m), the map centers on the user at the tram view's
   default zoom, and a marker shows their position. The centering is
   **once per session** (the first usable fix only - the once-guard
   latches only on a real centering, so unusable fixes before one leave
   centering available) - the map does not re-center
   or follow the user on later fixes; tracking keeps the marker moving
   but never moves the viewport afterwards (the user pans the map, not
   the app; a pan gesture after centering must not be fought by a
   re-center).
3. **The marker.** A distinct visual: a pulsing blue dot with a soft
   accuracy ring around it - the standard mapping convention
   (Leaflet renders it in its own layer: one `L.circleMarker`-like DOM
   element, or CSS-animated; the exact visual is a CSS class in
   `index.css` keyed to a dedicated class name, e.g. `.user-location`,
   with the pulsing animation in CSS, not a JS timer). The dot is
   `pointer-events: none`? No - the marker is a button target: clicking
   it centers the map on the user again (the one re-center affordance,
   deliberate and user-initiated; a pan since the last centering is what
   it undoes). The marker shows the fix's accuracy as the ring's radius
   (Leaflet's `L.circle` in meters, updated per fix).
4. **Only while the map page is mounted.** The `watchPosition` handle
   lives and dies with `MapView`'s map effect (the same dispose discipline
   as the marker layer and the heatmap layer); the vehicle overview page
   (a separate route, no map) runs no watch. No caching, no persistence -
   every session re-asks/re-grants per the browser's own memory.
5. **Honesty about uncertainty.** A fix's accuracy circle is shown only
   when `accuracy` is a number; when the accuracy is coarse (> 500 m)
   after the first centering, the marker still shows but a one-time
   `console.info` states that the fix is too coarse to have centered the
   map (no UI element lies about precision). `dl`-style staleness: if
   fixes stop arriving (watchPosition stalls), the marker keeps its last
   position - no invented movement, no expiry behavior for v1 (the
   browser handles its own accuracy; a stale-dot purge is a follow-up
   decision if the user ever notices one).
6. **Guard rails.** No new dependency; no new request of any kind
   (geolocation is local to the browser); `package.json` untouched; the
   tram/metro markers, strip, heatmap, overlay, toggles, and the overview
   page unchanged; the strip's anchor/stacking comments unchanged. The
   user-location layer must not block clicks meant for the map or the
   tram markers (its `L.circle` ring is `interactive: false`; only the
   dot marker itself takes the click).
7. **Docs.** `Docs/digitransit.md` gains a short section: what the
   feature does, that it is browser-API-only (no request), the
   center-once rule, the click-to-recenter affordance, and that the
   permission lives with the browser (never persisted by the app).

## Acceptance

1. `npm run lint`, `npm run format:check`, `npm run build` green; `dist/`
   deleted afterwards; no `package.json` change.
2. **Manual review on the dev server (the human gate)** - the user will
   be prompted by their browser for location permission; the checklist:
   - grant: the map centers on the user once, with the pulsing blue dot
     and the accuracy ring;
   - deny: the map stays on the default Helsinki view, nothing breaks;
   - pan after centering: the map stays where panned (no re-center);
   - click the dot: the map re-centers on the user;
   - move (or use the browser's device emulation): the dot follows,
     the viewport does not;
   - the tram markers stay clickable (the user dot does not swallow
     clicks in its area beyond its own dot body).
3. The reviewer may assume checks green and judges code-only against
   requirements 1-7 (per the flow).
4. Request discipline: no new network requests (verify by reading the
   diff for any fetch/GraphQL/tile/MQTT construction - there must be none
   beyond the existing ones).

## Notes

- The permission UX is the browser's own; the app adds no UI for it
  (requirement 1). The only custom UI is the marker itself.
- The re-center click (requirement 3) is the only viewport-affecting user
  affordance in this task; "follow me" as a persistent mode is out of
  scope and its own decision if the user wants it later.
- `navigator.geolocation.watchPosition` (not `getCurrentPosition`) is the
  right primitive: one handle, updates as the user moves, and the first
  fix is its first call.
