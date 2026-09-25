# Tram view plan

Status: `TV-0020 (resolve the overview's stop sequence from the vehicle's live trip) and TV-0021 (the overview's always-0 occupancy field) are REVIEW - both implemented and verified live, merged together; TV-0018 (HSL basemap tiles) is DONE, merged and re-verified on the deployed site; TV-0019 (tram line overlay) is BLOCKED on a human decision; TV-0002..TV-0017 are merged, delta-reviewed and retired (MVP accepted; ADR-0003 key policy live; ADR-0004 vehicle overview page live; ADR-0001/ADR-0003 basemap amendments implemented by TV-0018).`

The application is a live view of all of the trams currently active in the HSL network,
providing an at-a-glance view of the state of the tram system.

## Open work

| Task | Deliverable |
| ---- | ----------- |
| [TV-0020](Tasks/TV-0020-resolve-live-trip-pattern.md) — `REVIEW` | Vehicle overview showed the wrong trip pattern (arbitrary first `directionId` match) → resolved from the vehicle's live trip |
| [TV-0021](Tasks/TV-0021-remove-occupancy-field.md) — `REVIEW` | Vehicle overview showed a permanent `Occupancy 0` tile and `occu` row for a field the feed always reports as 0 → removed from the parser and the page |
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

Dependency flow: TV-0002…TV-0018 — **all merged and verified; the MVP is
shipped, the post-MVP polish wave (TV-0012..TV-0016) is complete, the
per-vehicle overview (TV-0017, [ADR-0004](Docs/ADR/0004-vehicle-overview-page.md))
is live, and the basemap is HSL's own style (TV-0018).** The deployed site is
live at <https://devonv-nitor.github.io/tram-view/> (public key policy per
ADR-0003). Open work is
[TV-0019](Tasks/TV-0019-tram-line-overlay.md) (tram line overlay, blocked on a
human decision).
