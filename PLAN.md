# Tram view plan

Status: `TV-0003..TV-0005 COMPLETE - live map with moving tram markers on main`

The application is a live view of all of the trams currently active in the HSL network,
providing an at-a-glance view of the state of the tram system.

## Outstanding work

| Task                                           | Deliverable                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| ~~[TV-0003](Docs/ADR/0001-map-library.md)~~    | DONE — Helsinki map view (Leaflet + OSM raster)                   |
| ~~[TV-0004](Docs/ADR/0002-data-transport.md)~~ | DONE — Digitransit HFP client + local API key handling            |
| ~~TV-0005~~                                     | DONE — Live tram markers (circles with line numbers)              |
| [TV-0006](Tasks/TV-0006-github-pages.md)       | GitHub Pages deployment                                           |
| [TV-0008](Tasks/TV-0008-tram-direction.md)     | Direction indication on tram icons                                |
| [TV-0007](Tasks/TV-0007-mvp-acceptance.md)     | MVP acceptance verification                                       |

Dependency flow: ~~TV-0002~~, ~~TV-0003~~, ~~TV-0004~~, ~~TV-0005~~ (all
done) → {TV-0006, TV-0008} → TV-0007. TV-0008 should land before the
TV-0007 acceptance check.
