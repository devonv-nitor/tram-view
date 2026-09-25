# Tram view plan

Status: `TV-0017 (vehicle overview page) is implemented and in REVIEW — awaiting its reviewer and the merge-delta check. TV-0002..TV-0016 are merged and verified (MVP accepted; ADR-0003 key policy live).`

The application is a live view of all of the trams currently active in the HSL network,
providing an at-a-glance view of the state of the tram system.

## Open work

| Task | Deliverable |
| ---- | ----------- |
| [TV-0017](Tasks/TV-0017-vehicle-overview.md) — `REVIEW` | Per-tram overview page over a vehicle-scoped HFP subscription |

[ADR-0004](Docs/ADR/0004-vehicle-overview-page.md) (vehicle overview page and
its `#/vehicle/<oper>/<veh>` URL contract) and the
[ADR-0002 amendment](Docs/ADR/0002-data-transport.md) (vehicle-scoped
subscription, retained per-vehicle state, pattern query, verified field
facts) are accepted and implemented by TV-0017; the only remaining step for
them is that task's review and merge.

## Completed work

All work through TV-0016 is merged, delta-reviewed and retired; the retired
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

Dependency flow: TV-0002…TV-0014 — **all merged and verified; the MVP is
shipped and the post-MVP polish wave (TV-0012..TV-0016) is complete.** The
deployed site is live at <https://devonv-nitor.github.io/tram-view/>
(public key policy per ADR-0003). New work is listed under
[Open work](#open-work) and defined from
[Tasks/_template.md](Tasks/_template.md).
