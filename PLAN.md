# Tram view plan

Status: `MVP shipped — TV-0003..TV-0011 merged (TV-0006 live, public key per ADR-0003); TV-0007 acceptance verified 2026-09-24; TV-0012 outstanding`

The application is a live view of all of the trams currently active in the HSL network,
providing an at-a-glance view of the state of the tram system.

## Outstanding work

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
| [TV-0014](Tasks/TV-0014-ui-cleanup.md)         | UI cleanup: hide empty Unknown row, no letters in tooltips        |

Dependency flow: ~~TV-0002~~, ~~TV-0003~~, ~~TV-0004~~, ~~TV-0005~~,
~~TV-0006~~, ~~TV-0007~~, ~~TV-0008~~, ~~TV-0009~~, ~~TV-0010~~,
~~TV-0011~~ — **all merged and verified; the MVP is shipped.** The deployed
site is live at <https://devonv-nitor.github.io/tram-view/> (public key
policy per ADR-0003). Post-MVP outstanding work: **TV-0012** (per-type
live counts in the status panel legend).
