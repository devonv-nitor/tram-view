---
id: TV-0027
status: IN_PROGRESS
owner: agent
gatekeeper: human
required_approvals: []
depends_on: ["TV-0019"]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Redesign the map status panel as a compact bottom-left strip

The map's status panel (`src/components/TramStatusPanel.tsx` + the
`.debug-panel` block in `src/index.css`, collapsible since TV-0015) is a
24rem-wide card pinned to the top-right corner. The user's 2026-10-08 report:
it takes up valuable map real estate, and when a marker's HUD popup opens the
panel often covers the popup's info, so the user must close the panel
constantly.

Measured NOW (2026-10-08, `src/index.css`): the expanded panel and the
collapsed circle share one top-right anchor (`top: 1rem; right: 1rem`) at
`z-index: 1000` - above Leaflet's popup pane (700), which is why the panel
draws over an open popup. Leaflet's default pane/control order:
tilePane 200 < overlayPane 400 (the ADR-0001 tram overlay, TV-0019) <
markerPane 600 < tooltipPane 650 < popupPane 700 < control containers 1000.
The zoom control sits top-left; the attribution sits bottom-right (~1.1rem
tall). The panel mounts inside MapPage's `.app` after `<MapView />`
(`src/App.tsx`).

User decision 2026-10-08: option B of a three-option design round (A compact
bottom-left card, B single-row status strip, C dark bottom-center dock) -
**B, the single-row strip**: the info visible on launch, moved to the bottom,
more compact. The round also established the stacking fix: the strip drops
below the popup pane so an open popup is never covered.

Design source: `Tasks/mockups/mockup-06-bottom-status-strip.html`, iterated
with the user 2026-10-08 (two-row layout: centered status row with the
collapse button pinned right, the legend chips on their own row, no
separator; chips wrap inside their row when narrow) and created in this task
before the implementation (the TV-0023 pattern; the popup's mockup-01 stays
untouched).

## Requirements

1. **Anchor.** `.debug-panel` and `.debug-panel-toggle` move from the
   top-right (`top: 1rem; right: 1rem`) to the bottom-left, above the
   attribution band (e.g. `left: 1rem; bottom: 2rem` - verify the exact
   clearance). One shared anchor rule for both states stays (the TV-0015
   mechanism, comment updated). The strip stays inside MapPage's `.app`,
   after `<MapView />`.
2. **Live-state shape.** One row, ~36-40 px tall, full content visible on
   launch without interaction, same color-scheme-aware surface as today:
   the status segment (dot, `Live · N trams · updated HH:MM` - minute
   precision is the width choice, the per-snapshot render cadence unchanged)
   followed by the legend as inline chips - one chip per always-present
   category (A/B/C counts), the Unknown and SpåraKoff chips only while
   present (never a zero-count row, TV-0014/TV-0013 logic unchanged), and
   the always-present red-dot chip (TV-0011).
3. **Chip labels.** Short display labels - MLNRV, Artic, X54, Unknown,
   SpåraKoff, Not in service - with the full `fleet.ts` label (or
   `Not in service (shunting/testing)`) on the chip's `title`.
   `src/lib/fleet.ts` is unchanged.
4. **Collapse.** One click/tap/Enter/Space collapses the strip to a compact
   pill at the same bottom-left anchor - the live count (`● 87`) while live,
   the chevron otherwise (the current circle logic, restyled);
   `aria-expanded` on both affordances with the state in the aria-label; the
   TV-0015 focus hand-off (the focused toggle unmounts on toggle - move
   focus to the other affordance) preserved; per-session state, expanded on
   every load, nothing persisted.
5. **Stacking.** The strip's z-index drops from 1000 to 640: above the
   marker pane (600 - the strip still covers markers in its own corner, as
   the top-right panel does today), at or below the tooltip pane (650 - a
   marker hover tooltip may paint above the strip when they overlap),
   strictly below the popup pane (700) and the control containers (1000).
   The properties these values satisfy: an open marker popup is never
   covered by the strip, and the attribution/controls keep winning any
   overlap. Update the index.css comment that currently says the panel wins
   via DOM order. The ADR-0001 overlay order (tilePane < overlay <
   markerPane) is untouched.
6. **Variants.** Loading, connecting, and error keep the same strip shape and
   anchor. The error variant keeps its red border-color; the full error
   message must remain reachable - wrap within the strip (a second line is
   fine) or an expand affordance/title - never clipped to invisibility.
   `aria-live="polite"` and the `Live tram data status` semantics are
   preserved on every variant (error heading included).
7. **Narrow viewports (390 px).** The strip never overlaps the attribution
   control and never causes horizontal scroll; chips wrap to at most a
   second line.
8. **Mockup first.** `Tasks/mockups/mockup-06-bottom-status-strip.html`
   (light theme, matching the strip) is committed before the src change; the
   implementation follows it.
9. **Docs.** `Docs/digitransit.md`'s panel prose (the "Verifying the data
   flow" section and the TV-0015 paragraph) is updated: bottom-left strip,
   chips, minute-precision time, collapse-to-pill, the popup-wins stacking
   note; the superseded top-right text is removed. No ADR amendment is
   needed - presentation-only within ADR-0001's rendering scope, no map-layer
   order change.
10. **Guard rails.** Only `src/components/TramStatusPanel.tsx`,
    `src/index.css`, `Docs/digitransit.md`, the new mockup, and `PLAN.md`
    (bookkeeping) change. `src/lib/fleet.ts`, `useTramPositions.ts`,
    `MapView.tsx`, `TramMarkers.ts`, `TramMarkerPopup.ts`, `App.tsx` and the
    data flow are unchanged; the request profile is unchanged (one
    `TramRoutes` query per session, no new stream); key discipline unchanged
    (never print/commit the API key, delete `dist/`).

## Acceptance

1. The mockup file exists and is committed before the src change (first
   commit in the branch).
2. `npm run lint`, `npm run format:check`, and `npm run build` pass; `dist/`
   is deleted afterwards; no `package.json` change.
3. Live verification (dev server + headless Chrome, ~1-2 min window):
   - On load, with no interaction, the strip is visible at the bottom-left
     with live counts (capture a screenshot).
   - Click a marker - including one whose popup opens near the bottom-left -
     the popup's full content (header row, metrics, next stop, link) is
     visible, not covered by the strip (capture evidence).
   - The legend counts update as snapshots change (observe ≥2 distinct
     values in the window).
   - 390 px viewport: no strip/attribution overlap, no horizontal scroll
     (capture).
   - Collapse → pill (count while live), expand → strip; keyboard: Tab
     reaches the affordance, Enter/Space toggles, the focus hand-off is
     verified (no focus dropped to `<body>` on toggle).
4. Honest fallback: if no Unknown-numbered or SpåraKoff tram appears in the
   live window, verify those conditional chips by code review of the
   unchanged conditional logic and DISCLOSE that as a code-review
   substitute, not a live observation.
5. Request discipline: the network log shows one `TramRoutes` query per
   session, no new requests and no new WebSocket.
6. `grep -rn "top-right"` over the panel's own comments
   (`src/index.css` `debug-panel`/`debug-panel-toggle` blocks,
   `src/components/TramStatusPanel.tsx`) and `Docs/digitransit.md`'s panel
   prose returns no stale description. The unrelated popup close-button
   comment near index.css line ~375 stays.

## Notes

- Queue correction 2026-10-08 (coordinator, measured at dispatch): the
  queued-behind-TV-0019 premise is wrong — TV-0019's branch
  (`origin/bb/tv-0019-tram-line-overlay-worker-thr_uuza5w5hc6`, in REVIEW)
  does not touch `src/index.css`. TV-0027 runs in parallel on top of
  `origin/main` at `e2db4d7`; the only plausible overlap is `PLAN.md`
  bookkeeping, which merges trivially. Merge order is unconstrained.
- The z-index reasoning, so it need not be re-derived: with an explicit
  z-index on the strip (`.app` is not a stacking context - it is
  `position: relative` with no z-index), the strip's paint order against
  Leaflet's panes is resolved in the root stacking context, so DOM order no
  longer decides; the explicit values do. Leaflet's default z-indexes
  (leaflet.css 1.9.x): tilePane 200, overlayPane 400, markerPane 600,
  tooltipPane 650, popupPane 700, control containers 1000. Verify against
  the pinned Leaflet version if in doubt.
- The strip's chips derive from the same `countByCategory` /
  SpåraKoff-reduction logic (unchanged); only the rendering moves from
  `<ul class="legend">` rows to inline chips. Class names are the panel's
  own - renaming is allowed, but keep one shared anchor rule for the two
  states.
- User decision record: 2026-10-08, the three-option round (A card /
  B strip / C dark dock), B chosen. The HUD popup (mockup-01, TV-0023) is
  untouched.
