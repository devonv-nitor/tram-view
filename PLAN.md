# Tram view plan

Status: `TV-0002..TV-0014 merged and verified (MVP accepted; ADR-0003 key policy live). Outstanding: TV-0015 (collapsible status panel).`

The application is a live view of all of the trams currently active in the HSL network,
providing an at-a-glance view of the state of the tram system.

## Completed work

All tasks are merged, delta-reviewed, and retired; `Tasks/` holds only the
[_template.md](Tasks/_template.md) used for future task definitions.

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
| [TV-0015](Tasks/TV-0015-collapsible-panel.md)  | Collapsible status panel: semi-transparent circle when collapsed  |

Dependency flow: TV-0002…TV-0014 — **all merged and verified; the MVP is
shipped and the post-MVP polish wave (TV-0012..TV-0014) is complete.** The
deployed site is live at <https://devonv-nitor.github.io/tram-view/>
(public key policy per ADR-0003). Outstanding: **TV-0015**. New work:
define tasks from [Tasks/_template.md](Tasks/_template.md).
