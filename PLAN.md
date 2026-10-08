# Tram view plan

Status: `TV-0020 (the overview's stop sequence resolved from the vehicle's live trip) and TV-0021 (the overview's always-0 occupancy field removed) are DONE, merged together at d0a747a and re-verified on the deployed site; TV-0018 (HSL basemap tiles) is DONE, merged and re-verified on the deployed site; TV-0022 (a tram's line resolved from the Routing API's live trip when its HFP route id is not a GTFS route id; user decision 2026-09-25: option A) is DONE, merged at 3e7f94f and re-verified on the deployed site; TV-0023 (the marker click popup replaced by the compact HUD dashboard the user chose, mockup 1) is DONE, merged at 8602955 and re-verified on the deployed site; TV-0025 (the popup's Heading cell replaced by an ETA to the next stop, in seconds, from the Routing API's live-trip timetable corrected by the reported deviation) is DONE, merged at 9d0a3f1 and re-verified on the deployed site; TV-0026 (the popup's ETA anchored to the day the tram is running, and the muted dash for a materially passed estimate - the user's 2026-09-28 report of trams stuck at `0 s`) is DONE, merged at 640470d and re-verified on the deployed site; TV-0019 (tram line overlay: user decision 2026-09-28 - draw it, from the Routing API, every pattern; ADR-0001 overlay amendment) is READY, queued ahead of [TV-0024](Tasks/TV-0024-retire-debug-route-plumbing.md) because both edit `src/lib/digitransit.ts`; TV-0027 (the map status panel redesigned as a compact bottom-left strip; user decision 2026-10-08: option B of three; STOP-DECISION RESOLVED 2026-10-08 - the user accepted option 4: the strip keeps z-index 640, a popup overlapping the strip's corner band may be covered by it, Leaflet's autoPan keeps naturally-anchored popups clear, and the popup-outside-the-map-pane fix is NOT authorized) is REVIEW on branch bb/worker-tv-0027-bottom-status-strip-thr_ee5b9d3bbffd4pWv (see the task's handoff and Tasks/TV-0027-handoff-STOP-DECISION.md); TV-0002..TV-0017 are merged, delta-reviewed and retired (MVP accepted; ADR-0003 key policy live; ADR-0004 vehicle overview page live; ADR-0001/ADR-0003 basemap amendments implemented by TV-0018).`

The application is a live view of all of the trams currently active in the HSL network,
providing an at-a-glance view of the state of the tram system.

## Open work

| Task | Deliverable |
| ---- | ----------- |
| [TV-0019](Tasks/TV-0019-tram-line-overlay.md) — `READY` | Tram line overlay on the basemap: every pattern of every tram route from the Routing API (one session-cached request, map page only) drawn above the basemap and below the markers, HSL white casing + `#00985F`. Decision: [ADR-0001 overlay amendment](Docs/ADR/0001-map-library.md) |
| [TV-0024](Tasks/TV-0024-retire-debug-route-plumbing.md) — `READY` | Remove the TV-0016 debug route-resolution plumbing whose only consumer was the deleted debug popup. Queued behind TV-0019 (both edit `src/lib/digitransit.ts`) |
| [TV-0027](Tasks/TV-0027-bottom-status-strip.md) — `REVIEW` | Map status panel redesigned as a bottom-left strip (two rows: centered status line + legend chips) visible on launch, z-index 640 - above the map pane's root stacking tier (Leaflet's `.leaflet-map-pane` is its own stacking context), so the strip covers map content in its corner including an overlapping popup; Leaflet's autoPan keeps naturally-anchored popups clear and that corner-band limitation is accepted and documented (STOP-DECISION resolved 2026-10-08, option 4); collapses to a count pill at the same anchor. Branch: `bb/worker-tv-0027-bottom-status-strip-thr_ee5b9d3bbffd4pWv` (mockup committed first). Decision: user 2026-10-08, option B of three (A bottom-left card, B strip, C dark dock); stacking resolution user 2026-10-08, option 4. Runs parallel to TV-0019 (no `src/index.css` overlap on that branch) |


## Completed work

All work through TV-0018 is merged and retired; the retired
tasks are listed below. New work is defined from
[_template.md](Tasks/_template.md) and listed under
[Open work](#open-work).

| Task                                           | Deliverable                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| ~~[TV-0003](Docs/ADR/0001-map-library.md)~~    | DONE — Helsinki map view (Leaflet + OSM raster)                   |
| ~~[TV-0004](Docs/ADR/0002-data-transport.md)~~ | DONE — Digitransit HFP client + local API key handling            |
| ~~TV-0005~~                                    | DONE — Live tram markers (circles with line numbers)              |
| ~~TV-0006~~                                    | DONE — GitHub Pages deployment, live (public key per ADR-0003)    |
| ~~TV-0011~~                                    | DONE — Out-of-service (shunting/testing) trams as red-dot markers |
| ~~[TV-0010](Docs/ADR/0001-map-library.md)~~    | DONE — UI tweaks: brand category colors, stable panel width       |
| ~~TV-0008~~                                    | DONE — Direction indication on tram icons                         |
| ~~[TV-0009](Docs/ADR/0002-data-transport.md)~~ | DONE — Tram type (rolling stock category) on icons                |
| ~~TV-0007~~                                    | DONE — MVP acceptance verified (local + deployed, no key in repo; merged at bd9a0ab) |
| ~~TV-0012~~                                    | DONE — Per-type live counts in the status panel legend            |
| ~~TV-0013~~                                    | DONE — SpåraKoff bar tram (car #175): special marker + panel entry |
| ~~TV-0014~~                                    | DONE — UI cleanup: hide empty Unknown row, no letters in tooltips |
| ~~TV-0015~~                                    | DONE — Collapsible status panel: semi-transparent circle when collapsed |
| ~~TV-0016~~                                    | DONE — Marker click popup: red-dot decision debug readout         |
| ~~TV-0017~~                                    | DONE — Per-tram overview page over a vehicle-scoped HFP subscription |
| ~~[TV-0018](Docs/ADR/0001-map-library.md)~~    | DONE — HSL basemap tiles (`hsl-map`, keyed Map API) replacing OSM standard, with the ADR-0001/ADR-0003 amendments; merged at 048731c, deployed site re-verified (no key-free tile fallback) |
| ~~[TV-0020](Docs/ADR/0002-data-transport.md)~~ | DONE — Vehicle overview's stop sequence resolved from the vehicle's own live trip (was the arbitrary first `directionId` match, which broke line 5); merged at d0a747a, deployed site re-verified on line 5 |
| ~~TV-0021~~                                    | DONE — Always-0 `occu` field removed from the parser and the vehicle overview (telemetry tile + reported-fields row) |
| ~~[TV-0022](Docs/ADR/0002-data-transport.md)~~ | DONE — A tram's line resolved from the Routing API's own live-trip match when its HFP route id is not a GTFS route id (a red dot now means: not a GTFS route id *and* no live trip); merged at 3e7f94f, deployed site re-verified (14 of 14 matched vehicles green, the one red had no trip) |
| ~~TV-0023~~                                    | DONE — Marker click popup replaced by the compact HUD dashboard the user chose ([mockup 1](Tasks/mockups/mockup-01-hud-dashboard.html)): line badge, vehicle/GTFS keys, headsign, speed, heading, doors, deviation, resolved next stop; merged at 8602955, deployed site re-verified. The TV-0016 debug route-resolution plumbing it orphaned is [TV-0024](Tasks/TV-0024-retire-debug-route-plumbing.md) |
| ~~TV-0025~~                                    | DONE — The popup's Heading cell replaced by an ETA to the next stop in whole seconds (`35 s`, clamped at `0 s`), the Routing API's live-trip timetable for that stop minus the reported schedule deviation; the timetable rides the popup's existing per-route request, so no second query and no second stream; the HFP topic's next-stop id lifted next-stop coverage from 48.9% to 100%. Merged at 9d0a3f1, deployed site re-verified. Round 1 caught a `Files changed` claim for `Docs/digitransit.md` that was not actually written; fixed before PASS |
| ~~TV-0026~~                                    | DONE — Popup ETA correctness (user report 2026-09-28: some trams stuck at `0 s`, e.g. line 5 #650). The tram reported correctly: the Routing API matched line-5 vehicles to trips dated three days earlier while their stop times lined up with the wall clock, and the ETA anchored that timetable to the trip id's day, so the clamp at 0 printed the error as a confident zero. The stop-time seconds now resolve against the trip-id day and today, the candidate with the nearest corrected arrival winning; `0` prints only when the answer is genuinely 0 (within the 90 s dwell tolerance) and a materially passed estimate shows the muted dash. Merged at 640470d, deployed site re-verified |

Dependency flow: TV-0002…TV-0021 — **all merged and verified; the MVP is
shipped, the post-MVP polish wave (TV-0012..TV-0016) is complete, the
per-vehicle overview (TV-0017, [ADR-0004](Docs/ADR/0004-vehicle-overview-page.md))
is live, the basemap is HSL's own style (TV-0018), and the overview's stop
sequence comes from the vehicle's live trip with the always-0 occupancy field
gone (TV-0020, TV-0021).** The deployed site is
live at <https://devonv-nitor.github.io/tram-view/> (public key policy per
ADR-0003). Open work is
[TV-0019](Tasks/TV-0019-tram-line-overlay.md) (tram line overlay, decided
2026-09-28: draw it, from the Routing API, every pattern) and
[TV-0024](Tasks/TV-0024-retire-debug-route-plumbing.md) (remove the dead
TV-0016 debug route-resolution plumbing).
