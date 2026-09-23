# Tram view plan

Status: `TASKS DEFINED - no implementation yet`

The application is a live view of all of the trams currently active in the HSL network,
providing an at-a-glance view of the state of the tram system.

## Outstanding work

| Task                                           | Deliverable                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| [TV-0002](Tasks/TV-0002-scaffold-app.md)       | Runnable Vite + React + TypeScript app shell                      |
| [TV-0003](Tasks/TV-0003-map-view.md)           | Helsinki map view (ADR-0001: map library)                         |
| [TV-0004](Tasks/TV-0004-digitransit-client.md) | Digitransit client + local API key handling (ADR-0002: transport) |
| [TV-0005](Tasks/TV-0005-tram-markers.md)       | Live tram markers (circles with line numbers)                     |
| [TV-0006](Tasks/TV-0006-github-pages.md)       | GitHub Pages deployment                                           |
| [TV-0007](Tasks/TV-0007-mvp-acceptance.md)     | MVP acceptance verification                                       |

Dependency flow: TV-0002 → {TV-0003, TV-0004, TV-0006} → TV-0005 → TV-0007.
TV-0003 and TV-0004 can proceed in parallel after TV-0002.
