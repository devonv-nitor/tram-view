# Tram view plan

Status: `TV-0003..TV-0005 + TV-0008..TV-0010 merged; TV-0006 awaiting human Pages enablement; TV-0007 final check outstanding`

The application is a live view of all of the trams currently active in the HSL network,
providing an at-a-glance view of the state of the tram system.

## Outstanding work

| Task                                           | Deliverable                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| ~~[TV-0003](Docs/ADR/0001-map-library.md)~~    | DONE — Helsinki map view (Leaflet + OSM raster)                   |
| ~~[TV-0004](Docs/ADR/0002-data-transport.md)~~ | DONE — Digitransit HFP client + local API key handling            |
| ~~TV-0005~~                                     | DONE — Live tram markers (circles with line numbers)              |
| [TV-0006](Tasks/TV-0006-github-pages.md)       | GitHub Pages deployment (merged; pending human Pages enablement)  |
| ~~[TV-0010](Docs/ADR/0001-map-library.md)~~        | DONE — UI tweaks: brand category colors, stable panel width       |
| ~~[TV-0008](Docs/ADR/0002-data-transport.md)~~    | DONE — Direction indication on tram icons                         |
| ~~[TV-0009](Docs/ADR/0002-data-transport.md)~~    | DONE — Tram type (rolling stock category) on icons                |
| [TV-0007](Tasks/TV-0007-mvp-acceptance.md)     | MVP acceptance verification                                       |

Dependency flow: ~~TV-0002~~, ~~TV-0003~~, ~~TV-0004~~, ~~TV-0005~~,
~~TV-0008~~, ~~TV-0009~~, ~~TV-0010~~ (all merged) → TV-0007.
TV-0006 is merged; its final acceptance waits on the human enabling
Pages (Settings → Pages → Source: GitHub Actions), then a green run
and the site loading. Only then runs the TV-0007 acceptance check.
