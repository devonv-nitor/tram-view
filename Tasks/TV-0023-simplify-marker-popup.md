---
id: TV-0023
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: []
allowed_paths:
  - "src/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Simplify marker popup content to a compact HUD dashboard

The current marker click popup (TV-0016) is a verbose debug readout covering
every input to the red-dot decision. It is useful for development but
overwhelming for everyday use. The popup should show only the passenger-facing
information a rider taps a marker for, in a compact dark HUD-style layout that
renders well on a mobile phone in portrait mode.

The user chose [Mockup 1](Tasks/mockups/mockup-01-hud-dashboard.html) as the
design direction. See that HTML file for the exact visual — the table below
captures the layout and styling.

## Requirements

1. **Fields shown.** The popup must display exactly these fields (in order):
   - **Line badge** — the tram's `routeShortName` (e.g. "5"), rendered as a
     `#fcb919` badge
   - **Vehicle key** — `operatorId/vehicleNumber` (e.g. "40/450")
   - **GTFS key** — `HSL:<routeId>` (e.g. "HSL:1005")
   - **Headsign** — as a pill tag, from the HFP topic's headsign level
   - **Speed** — formatted as "XX km/h" (convert from m/s: `Math.round(m/s * 3.6)`)
   - **Heading** — formatted as `XXX° CC` (degrees with compass octant, e.g.
     "215° SW")
   - **Door state** — "Open" (green dot + text, `#34d399`) or "Closed" (gray
     dot + text, `#6b7078`), derived from HFP `drst` bit 0
   - **Schedule deviation** — compact signed form (e.g. "+12 s"), colored:
     `#34d399` when ahead, `#fbbf24` when on time, `#f87171` when behind,
     `#6b7078` when unknown
   - **Next stop name** — from the HFP topic's next-stop level or payload's
     `stop` field, resolved to a name (use the existing `describeJourney` /
     pattern matching from the overview, or show the bare stop id when
     unresolvable)

2. **Layout.** Match the HUD dashboard layout from [mockup-01-hud-dashboard.html](Tasks/mockups/mockup-01-hud-dashboard.html):
   - A header row: line badge | (vehicle key + GTFS key stacked) | headsign pill
   - A speed+heading pair side by side
   - A doors+deviation pair side by side
   - A next-stop row with a `#fcb919` left accent border
   - The deviation is shown **only** in the grid (doors+deviation row); the
     next-stop row must **not** repeat it

3. **Styling.** The popup must use the dark HUD theme:
   - Popup container: `background: #0f1114`, border `1px solid #2a2d33`,
     border-radius `16px`
   - Header: `background: #1a1d23`, `border-bottom: 1px solid #2a2d33`
   - Metric cells: `background: #1a1d23`, `border-radius: 8px`
   - Next-stop row: `background: #1a1d23`, `border-left: 3px solid #fcb919`,
     `border-radius: 8px`
   - All text light-on-dark: values in `#e0e2e6`, labels in `#6b7078`,
     monospace font for values
   - Headsign pill: `background: #2a2d33`, text `#b0b4bb`

4. **Data enrichment.** The `TramPosition` type currently lacks door state,
   next stop, schedule deviation, and headsign. The worker must enrich the
   snapshot data so the popup can render these fields. Specifically:
   - Add `doorState: "open" | "closed" | null`, `headsign: string | null`,
     `nextStopId: string | null`, and `scheduleDeviation: number | null`
     (the HFP `dl` value) to the `TramPosition` interface (or create a
     parallel `TramPopupData` type that the popup builder consumes)
   - Wire these fields through the snapshot assembly in
     `useTramPositions.ts` from the raw `HfpVehiclePosition` (note: the
     HFP `vp` payload already carries `drst`, `dl`, and `stop`, and the
     topic carries the headsign — the `HfpVehiclePosition` interface will
     need those fields added from `parseHfpPosition`)
   - Parse `drst` (bit 0), `dl`, and `stop` from the HFP VP payload
   - Parse the headsign from the HFP topic (already parsed by
     `parseHfpTopic` — the topic split gives `headsign` as `parts[11]`)

5. **What must NOT change.**
   - The debug popup (TV-0016) is **replaced**, not retained alongside a
     simplified version. `buildTramDebugHtml` becomes `buildTramPopupHtml`
     with the new design
   - The marker layer (TramMarkers.ts) behaviour, marker icons, heading
     rotation, offline dots, category colors, SpåraKoff special case — all
     unchanged
   - The vehicle overview page (TV-0017) and its components are untouched
   - The `TramPosition` routeShortName resolution logic (index lookup,
     live-trip fallback) is unchanged
   - The "Open vehicle overview →" link from the popup must be preserved
     (the nav affordance to `#/vehicle/<oper>/<veh>`)
   - No `package.json` changes unless disclosed; key discipline unchanged
   - `npm run lint`, `npm run format:check`, `npm run build` must stay green

## Acceptance

1. **Build and lint.** `npm run lint`, `npm run format:check`, `npm run build`
   all pass with no warnings.

2. **Visual match.** Open the deployed app on a ~390px wide viewport, click
   any tram marker, and verify the popup matches the HUD dashboard layout
   (mockup-01-hud-dashboard.html): header with line badge/vehicle/headsign,
   speed+heading row, doors+deviation row, next-stop row. Deviation appears
   only in the grid, not repeated in the next-stop row. The "Open vehicle
   overview →" link is present.

3. **Data correctness.** On the live site, click a tram that is moving and
   verify:
   - Speed shows a plausible km/h value
   - Heading shows degrees with compass octant
   - Door state matches expectation (Closed while moving, Open when stopped
     at a stop with reported `drst` bit 0 = 1)
   - Schedule deviation shows signed seconds with correct color
   - Next stop shows a stop name (or the bare id if the pattern is
     unavailable)
   - Headsign shows the destination direction

4. **Red dot vehicles.** Click a tram that is out of service (red dot on the
   map). The popup must still render all fields with whatever data is
   available; `routeShortName` null means the line badge shows nothing
   (matching the current marker behaviour — the offline dot replaces the
   number on the marker, and the popup follows the same data). The "Open
   vehicle overview →" link must still work.

5. **Stale vehicles.** A vehicle that disappears from the snapshot while its
   popup is open must close the popup (existing Leaflet behaviour: marker
   removal closes its popup). No crash or stuck open popup.

6. **Honest-fallback rule.** If live data for doors/next-stop/deviation is
   not yet reported for a vehicle (e.g. just appeared in the snapshot), the
   popup shows "—" or "unknown" for those fields — never an invented value.
   This must be verified by code review.

## Notes

- The `HfpVehiclePosition` interface in `src/lib/hfp.ts` currently parses
  only `routeId`, `directionId`, `operatorId`, `vehicleNumber`, `lat`, `lon`,
  `heading`, `speed`, and `receivedAt` from the VP payload. The payload also
  carries `drst` (door state bitfield), `dl` (schedule deviation in seconds),
  and `stop` (stop id) — the `parseHfpPosition` function must be extended to
  parse these fields, and the `HfpVehiclePosition` interface extended to carry
  them. The topic's headsign is already parsed by `parseHfpTopic` — the
  subscription callback in `useTramPositions` receives both `topic` and
  `payload`, but the current code ignores the topic. The worker will need to
  thread the topic through to the snapshot.
- The `subscribeTramPositions` function in `src/lib/hfp.ts` passes only the
  payload to `onPosition`. The worker will need to either: (a) change the
  callback signature to include the topic, or (b) parse the topic inside the
  callback and include headsign in `HfpVehiclePosition`. Option (b) is
  simpler and keeps the API surface change minimal.
- The popup content is rebuilt from `TramPosition` on every snapshot while
  open (see `TramMarkerLayer.update()`), so fresh doors/next-stop/deviation
  data will appear live.
- The "Open vehicle overview →" link's CSS class may change; keep the same
  visual appearance (rounded button, light background) but it can be renamed
  if the old class naming no longer fits.
- Mockup 1 CSS classes are for illustration only. The worker is free to adapt
  naming to the project's conventions.

## Handoff

**Design:** Mockup 1 (HUD dashboard) at `Tasks/mockups/mockup-01-hud-dashboard.html` — the user's chosen direction.

**Implementation.** `buildTramDebugHtml` is replaced by `buildTramPopupHtml`
(`src/map/TramMarkerPopup.ts`): the mockup's dark HUD (line badge, vehicle key
over GTFS key, headsign pill; speed+heading row; doors+deviation row; next-stop
row with the `#fcb919` accent), plus the preserved "Open vehicle overview →"
link. The dark shell is scoped by the `.tram-hud-shell` className passed to
`bindPopup` (`src/map/TramMarkers.ts`) and styled in `src/index.css` — Leaflet's
light wrapper, tip, and close button are restyled for this one popup type.
`TramPosition` gains `doorState`, `headsign`, `nextStopId`, `scheduleDeviation`
(`src/lib/digitransit.ts`), populated from the enriched `HfpVehiclePosition`
(`drst`, `dl`, `stop`, topic headsign) in `src/hooks/useTramPositions.ts`.
`positionsEqual` now also compares the popup-only fields so a stopped tram
opening its doors refreshes the open popup. `src/lib/format.ts` gains
`formatSpeedKmh` and `formatHeadingCompact`.

The next-stop row resolves the id to a name: `loadRouteStopNames`
(`src/lib/digitransit.ts`) builds a bare-stop-id → name map from the route's
patterns (reusing the cached `loadRoutePatterns` the overview already uses),
and `TramMarkerLayer` asks for it only while a popup is open — one request per
route per session — then rewrites the open popup when the names arrive
(`popupHtml` / `nextStopName` / `ensureStopNames` / `refreshOpenPopups`). An
empty HFP topic headsign segment is normalized to null
(`src/lib/hfp.ts`), so the header pill shows the honest `—` rather than an
empty "→ ".

**Evidence.** `npm run lint`, `npm run format:check`, `npm run build` all
green. Two live runs against the real feed (dev server + headless Chrome,
390 px viewport, 104–106 trams): clicking a marker opened
`.leaflet-popup.tram-hud-shell` with wrapper `rgb(15,17,20)`, radius `16px`,
header `rgb(26,29,35)`, `#fcb919` next-stop border, doors `Closed` with the
closed dot, `#f87171` deviation, and the deviation not repeated in the
next-stop row; the row showed a resolved stop name (`Haapaniemi`, route 7,
vehicle `40/461`) once the route's patterns arrived, and the bare id before
that. Computed-style checks confirmed every mockup color, that the
next-stop row never lacks a value, and the muted honest fallbacks (`—` for
unreported speed/heading/doors/next-stop, `#6b7078` for unknown deviation).

**Known limitations.** Stop names come from the route's patterns, so the row
shows the bare HFP id until that one request per route resolves, and keeps it
when the route has no patterns or the request fails (the design's stated
fallback). The next stop comes from the payload's `stop` field, not the
topic's next-stop level.
