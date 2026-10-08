---
id: TV-0028
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

# Punctuality heatmap layer on the map page

The user's 2026-10-08 request: a map layer showing how "on-time" the network
is at any moment — areas with behind-schedule trams shift red, ahead-of-
schedule green. The user also asked the feasibility question first; the
coordinator's verified answer (2026-10-08): **no new API calls are needed.**
Every HFP `vp` message carries `dl` (schedule deviation, seconds, positive =
ahead), already parsed on every message (`src/lib/hfp.ts:104`), deduped to
the latest position per vehicle, and carried on the snapshot as
`scheduleDeviation` (`src/hooks/useTramPositions.ts:222`) — the same field
the popup's Deviation cell renders. The map page holds this for every
vehicle every snapshot tick (~1/s).

The user skipped the mockup round (2026-10-08): the visual parameters below
are the design, changeable at the dev-server review.

## Requirements

1. **Layer.** A canvas overlay on the map page showing per-area punctuality
   as a color field: one soft radial blob per contributing vehicle, colored
   by that vehicle's deviation (green = ahead, red = behind, neutral = near
   on-time), alpha-composited additively onto one canvas that sits **above
   the basemap and below the tram markers**. No pane-created DOM beyond the
   canvas; no tile or GraphQL request is added; no new dependency.
2. **Input, unchanged data.** Read only the existing snapshot
   (`TramPosition[]`): `scheduleDeviation`, coordinates, `routeShortName`,
   and vehicle identity. Do not touch the data clients (`hfp.ts`,
   `useTramPositions.ts` unchanged) — the layer is a pure renderer over the
   same state the markers read.
3. **Exclusion rule (the user's opetusajo filter).** A position contributes
   to the heatmap only when all hold: `scheduleDeviation !== null`; the
   vehicle is not the SpåraKoff bar tram (`isSparakoffBarTram`,
   `src/lib/fleet.ts:117` — a tourist cruise with no timetable, guaranteed
   noise); and **|dl| ≤ 900 s** (the user's ±15 min clamp; values beyond it
   are excluded entirely, not clamped into the scale). Everything else
   contributes.
4. **Color mapping.** `dl` in seconds → color: negative (behind) → red,
   0 → neutral, positive (ahead) → green. Use the palette the app already
   trusts: red `#d32f2f` (`--tram-type-offline`), green `#34d399` (the
   popup's ahead tone) or `#137333` — pick one green and record it in code
   as the chosen hue; neutral may be transparent (no blob) within a small
   dead-band. The user may change these at review; make the constants
   named and obvious at the top of the module.
5. **Rendering.** ~1 Hz with the snapshot cadence, full redraw per tick
   (the vehicle count is small; simplicity wins over incremental updates).
   Blob radius in *pixels*, derived from a *meters* radius via the map's
   current zoom — the field must stay geometrically consistent while
   panning/zooming, and it must redraw on zoom/pan (the same mechanism
   TV-0019's overlay uses). No interaction: the canvas is `pointer-events:
   none`, below the markers, above the basemap.
6. **Placement among panes.** Heatmap canvas between the basemap and the
   markers. TV-0019's overlay amendment (ADR-0001) fixed the route-overlay
   order as tilePane (200) < overlay < markerPane (600); TV-0019's branch
   is unmerged and also edits `MapView.tsx`, so: **give the heatmap its own
   Leaflet pane at z 250** (above tiles, below TV-0019's overlay tier and
   the markers), and record in the code comment that TV-0019's merge must
   slot its overlay between 250 and 600 (its current branch uses the
   overlayPane default 400 — no conflict; if it conflicts at merge, the
   coordinator re-decides). Never above the markers.
7. **Toggle.** The strip gains a third state row? No — **the strip is not
   extended by this task.** The heatmap is always-on with no toggle, no
   legend entry, no settings (matching ADR-0001's "always on" overlay
   decision); if the user wants a toggle later it is its own task.
8. **Honesty.** The layer is an estimate of *last-reported* deviations:
   `dl` is only recomputed at stop events, so the field lags reality by up
   to a stop event per tram, and only vehicles currently reporting color
   the map (areas without reporting trams stay uncolored — absence of
   color is not "on time"). Document this in `Docs/digitransit.md` next to
   the existing `dl` honesty notes, and in the module's header comment.
9. **Guard rails.** `package.json` unchanged (no new dependency — canvas
   2D only); key discipline unchanged; the popup, markers, strip, vehicle
   overview, and all data flow unchanged; `dist/` deleted after builds.
   The strip's z-indexes and the popup stacking limitation (TV-0027's
   accepted limitation) are untouched.

## Acceptance

1. `npm run lint`, `npm run format:check`, `npm run build` green; `dist/`
   deleted afterwards; no `package.json` change.
2. Manual review on the dev server (the human gate): the field appears
   above the basemap, below the markers; colors shift as trams' deviations
   change; panning/zooming keeps blobs geographically anchored; excluded
   vehicles (|dl| > 900 s, SpåraKoff, `dl === null`) do not color the map.
   A concrete 1-minute checklist for the user is in the handoff.
3. The reviewer may assume checks green and judges the diff against these
   requirements (code-only, per the 2026-10-08 flow).
4. No new network requests vs main: same one `TramRoutes` query, same HFP
   subscription, no new tiles/fetches. (The reviewer verifies this by
   reading the diff for any `fetch`/`GraphQL`/tile-layer construction —
   not by running the app.)

## Notes

- The snapshot dedups per vehicle (latest position wins), so one blob per
  vehicle maximum; vehicles stop reporting and drop from the snapshot per
  the existing staleness rule, so their blobs disappear with them.
- Blob radius: pick ~250 m at the heatmap's purpose scale (a soft area
  read, not a pin); render radius is that meters → pixels via the current
  zoom. Record the constant in code.
- The 15-min clamp: the threshold is `Math.abs(dl) > 900` → excluded. If
  live data makes 900 s too tight/loose at the review, it is a one-constant
  change.
- Merge interplay with TV-0019: TV-0019's branch (`MapView.tsx`) predates
  this task; the coordinator handles the merge order and the pane-slot
  reconciliation at merge time (both effects are additive; the documented
  intent is tiles < heatmap(250) < route overlay(400) < markers(600)).
