# TV-0027 — STOP-DECISION report to the coordinator (live verification evidence and the stacking discrepancy)

Date: 2026-10-08. Branch: `bb/worker-tv-0027-bottom-status-strip-thr_ee5b9d3bbffd4pWv`.
Worktree: `/Users/dv/Dev/tram-view-wt-tv0027`. Main tree untouched.

## Summary

The TV-0027 strip is implemented, all checks pass, and live verification is
done — **except one acceptance item, which the live measurement contradicts**:
the strip does **not** always lose to an open marker popup, because Leaflet's
`.leaflet-map-pane` is its own stacking context in this app (it always carries
a `transform`, even at identity). This requires a coordinator decision before
review: the task's z-index requirement (5) as written does not produce its
stated outcome ("an open marker popup is never covered by the strip") in the
real DOM.

## What is implemented and verified (evidence)

Checks (all green, `dist/` deleted after each build):
`npm run lint`, `npm run format:check`, `npm run build`.

Live verification (headless Chrome 155, CDP; screenshots + JSON in
`/private/var/folders/fm/s5563fhj3hqb228904nfwdfw0000gn/T/opencode/tv0027-evidence/`,
`report.json`, `popup-overlap-report.json`):

- Strip on load, 1280x800: `Live · 105 trams · updated 10:48`; 4 chips
  (18 MLNRV / 59 Artic / 28 X54 / Not in service); chip titles carry the full
  `fleet.ts` labels; collapse button 24x24 pinned to the row's right edge;
  `aria-expanded=true`, `aria-live=polite`, "Live tram data status" label;
  computed `z-index: 640`; anchor `left: 16px; bottom: 36px` (2.25rem);
  two rows confirmed (`desktop-strip-on-load.png`).
- Minute precision: `updated 10:48` (HH:MM only, verified `timeIsHHMM: true`).
- Popup near the strip (real click on a marker at (488, 632)): popup opened,
  fully readable, header painted by the popup; popup bottom 619 vs strip top
  715 → no coverage at that position (`desktop-popup-near-strip.png`).
- 390x844: strip rect (16, 741, 318x67); attribution (42, 827, 348x17);
  overlap `false`, gap 19px; `scrollWidth 390 == innerWidth 390` (no
  horizontal scroll); chips wrap onto 2 lines (`phone-390-strip.png`).
- Collapse: click on the collapse button → strip unmounts, pill appears at
  the same anchor (x 16, h 36) with the live count `● 105`
  (`aria-expanded=false`, "Show the live tram status strip, 105 trams");
  focus handed to the pill (`focusedClass: debug-panel-toggle`, never body).
  Keyboard: Enter collapses, Space expands (and the reverse) — focus hand-off
  verified in both directions; Tab reaches the affordance (8 tabs from body).
  While not live (error variant): the pill shows the chevron, not a count
  (`desktop-error-pill-chevron.png`).
- Error variant (API request blocked): red border `rgb(179, 38, 30)`,
  heading "Tram data error", the full message visible and wrapped inside the
  strip (`messageInStrip: true`, `stripWrapsMessage: true`), `aria-live=polite`,
  `z-index: 640` (`desktop-error-variant.png`).
- Legend updates: over a 16-sample window two distinct values (minute change
  `10:48 → 10:49`); a 30-sample chips window stayed constant (stable counts —
  see Known limitations).
- Request profile (clean load): exactly one `TramRoutes` GraphQL POST;
  the one extra GraphQL POST is the pre-existing TV-0022 `LiveTramTrips`
  (fired by the unchanged hook when some vehicle's route id does not
  resolve — present on main too, not introduced by this task); 12 keyed tile
  requests; exactly one app WebSocket `wss://mqtt.hsl.fi/` (plus Vite's dev
  HMR socket, a dev-only artifact). No key is printed in any log (URLs were
  redacted; the round-1 report that accidentally captured keyed tile URLs has
  been scrubbed and rewritten).

## The discrepancy (measured, reproduced, main-tree baseline confirmed)

Requirement 5 asks for z-index 640 "above the marker pane (600)… strictly
below the popup pane (700)", with the property that "an open marker popup is
never covered by the strip". Measured live:

- `.leaflet-map-pane` carries `transform: matrix(1, 0, 0, 1, 0, 0)` — Leaflet
  sets it at creation (its zoom-animation machinery) — so the map pane is a
  **stacking context**. The popup pane's 700 lives INSIDE it (its effective
  tier is the map pane's), not in the root stacking context alongside the
  strip.
- With the strip at 640 and a real HUD popup repositioned over the strip
  (263x14 px overlap band): hit-testing the band returns the strip for all
  33 columns (`stripColumns: 33, popupColumns: 0`) —
  **the strip covers the popup** (`desktop-real-popup-overlap.png`,
  probes 12–20 in the evidence dir).
- Lowering the strip to z 300 flips the verdict (popup wins 33:0), restoring
  640 restores the strip on top — the strip's z-index only competes with the
  map pane's tier (400), not with the popup pane's 700.
- Main-tree baseline (origin/main e2db4d7, the old top-right panel): with the
  popup repositioned over the panel, the panel covers the popup — this is the
  very defect the user reported, reproduced on main. The old panel never
  truly competed with the popup either; it won because 1000 > 400 (the map
  pane's tier), not because 1000 > 700.

So the mockup's "strip 640 / popup 700: the popup always wins" premise holds
only in a DOM where the panes and the strip share a stacking context. They do
not in this app.

## Options for the decision

1. **Keep z 640 as decided (accept the trade-off).** The strip stays above
   the marker pane (markers under the strip's corner are still covered, as
   today) but a popup anchored near the bottom-left is covered by the strip's
   band. Leaflet auto-pans a popup to stay in view, but with the strip 49px
   tall at bottom-left, a popup anchored near it can still be overlapped by
   up to the strip's height in the strip's x-range. This matches the mockup
   but not the requirement's stated outcome.
2. **Drop the strip below the overlay pane tier (z ≤ 399, e.g. 300).** The
   popup always wins (verified: popup 33:0). Cost: the strip would also lose
   to map overlays (markers at z 600 inside the pane still paint above it? —
   no: markers live inside the map pane too, so with the strip below the map
   pane, ALL pane content including tiles+markers paints above the strip;
   the strip would sit UNDER the map entirely — unacceptable).
   Correction: with z 300 the strip went UNDER the marker pane subtree too
   (the map pane covers it) — measured popupColumns 33 with the strip
   invisible beneath. This option hides the strip behind the basemap; not
   viable as stated.
3. **Give the strip its own stacking position above the map pane but below a
   popup that Leaflet renders OUTSIDE the map pane** — requires moving the
   popup's pane (Leaflet `pane` option on the popup, e.g. render the popup
   in a custom pane appended to `.app` instead of the map pane subtree, or a
   custom Leaflet pane with z 645 outside `.leaflet-map-pane`). This is a
   real code change in `MapView.tsx`/`TramMarkers.ts` (forbidden paths in
   this task) and/or an index.css-only experiment (a z-650 pseudo-pane can be
   added to `.app` — but the popup must be told to render there; that is a
   MapView/TramMarkers change).
4. **Keep z 640 and accept popup-overlap, but reduce the collision window**:
   the strip is only 49px tall at bottom-left; Leaflet's popup default
   `autoPan` already moves a popup whose body would leave the viewport up
   and away; the measured real overlap needed an artificial reposition
   (a popup anchored naturally near the strip auto-pans above it). The
   practical exposure is small; document the limitation in the task/commit
   and in Docs.

Recommendation (worker): option 4 for this task — keep the decided z 640
(chips, anchor, collapse, docs all match the mockup), document the measured
stacking-context reality in the commit and the task handoff, and file the
popup-panes-outside-the-map-pane fix as a follow-up task (it needs
`MapView.tsx`/`TramMarkers.ts`, which TV-0027 forbids). If the user prefers
the strict guarantee, option 3 is the correct follow-up; it is out of this
task's allowed paths.

## Status

- Branch tip (committed): `5e0c046` + the minute-precision fix awaiting
  commit; `PLAN.md` already updated to IN_PROGRESS in the first commit's
  tree (no further bookkeeping change needed).
- Not done: `git push` (withheld until the coordinator rules on the
  STOP-DECISION above; the strip as implemented matches the mockup and the
  chosen option-B design, but requirement 5's stated outcome is not met in
  the live DOM).
- No reviewer launched; task not marked DONE; nothing merged.
