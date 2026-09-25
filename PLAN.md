# Tram view plan

Status: `TV-0020 (the overview's stop sequence resolved from the vehicle's live trip) and TV-0021 (the overview's always-0 occupancy field removed) are DONE, merged together at d0a747a and re-verified on the deployed site; TV-0018 (HSL basemap tiles) is DONE, merged and re-verified on the deployed site; TV-0022 (a tram's line resolved from the Routing API's live trip when its HFP route id is not a GTFS route id; user decision 2026-09-25: option A) is DONE, merged at 3e7f94f and re-verified on the deployed site; TV-0019 (tram line overlay) is BLOCKED on a human decision; TV-0002..TV-0017 are merged, delta-reviewed and retired (MVP accepted; ADR-0003 key policy live; ADR-0004 vehicle overview page live; ADR-0001/ADR-0003 basemap amendments implemented by TV-0018).`

The application is a live view of all of the trams currently active in the HSL network,
providing an at-a-glance view of the state of the tram system.

## Open work

| Task | Deliverable |
| ---- | ----------- |
| [TV-0019](Tasks/TV-0019-tram-line-overlay.md) — `BLOCKED` | Tram line overlay on the basemap: source and scope undecided (`Decision requested` in the task) |

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

Dependency flow: TV-0002…TV-0021 — **all merged and verified; the MVP is
shipped, the post-MVP polish wave (TV-0012..TV-0016) is complete, the
per-vehicle overview (TV-0017, [ADR-0004](Docs/ADR/0004-vehicle-overview-page.md))
is live, the basemap is HSL's own style (TV-0018), and the overview's stop
sequence comes from the vehicle's live trip with the always-0 occupancy field
gone (TV-0020, TV-0021).** The deployed site is
live at <https://devonv-nitor.github.io/tram-view/> (public key policy per
ADR-0003). Open work is
[TV-0019](Tasks/TV-0019-tram-line-overlay.md) (tram line overlay, blocked on a
human decision).
