---
id: TV-0016
status: READY
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0005, TV-0011, TV-0013]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Marker click popup: red-dot decision debug info

User motivation (2026-09-24 session): many trams that were visibly
regular in-service vehicles (lines 5, 9) rendered as red dots in the
morning, while the same check later shows only a depot shunting tram —
an unexplained discrepancy the user wants to be able to debug
in-person. Clicking a marker must open a popup that follows the tram
and shows the exact parameter values that feed the red-dot decision
(and generally identify the vehicle), so the state can be inspected
live in the field.

- **Interaction**: click/tap a marker → Leaflet popup opens anchored
  to that marker and **follows the marker** as it moves (the popup is
  bound to the marker, not to a map point). One popup at a time;
  closing behaves like a normal Leaflet popup (× button, map click,
  Esc). Must not fight the existing tooltip (native `title` stays).
- **Content, at minimum — every input to the red-dot decision**
  (see `src/map/TramMarkers.ts` `offline` and
  `src/hooks/useTramPositions.ts` staleness):
  - identity: operator id, vehicle number (and the `oper/veh` key)
  - fleet classification: resolved category + model, and whether the
    vehicle-number range lookup or the SpåraKoff special case
    produced it (`isSparakoffBarTram` result)
  - **route resolution**: the raw HFP `routeId` (e.g. `1009TX`),
    whether `HSL:<routeId>` exists in the GTFS route index, the GTFS
    `shortName` if present, and whether that shortName passes
    `isTramLineShortName` — the three distinct null-reasons must be
    distinguishable (absent from GTFS / not TRAM mode or null
    shortName / shortName fails the line criteria)
  - the resolved `routeShortName` actually used by the snapshot
  - the computed `offline` boolean the marker will show
  - freshness: position `receivedAt` timestamp, its age in seconds,
    and the `POSITION_STALENESS_MS` budget it is judged against
  - heading (or "headingless" when null) and speed
  - render-decision summary line: why the marker is red-dot or not,
    phrased from the above (e.g. "red dot: route 1009TX is not in the
    GTFS line index")
- **Implementation constraints**:
  - Exposing the resolution detail will require a debug-oriented API
    on `src/lib/digitransit.ts` (e.g. a resolve variant returning the
    lookup outcome) — the *rendering* logic (`offline`, marker
    classes, counts, legend) must not change; the popup reads the
    same state, never mutates it.
  - Popup content updates with each snapshot while open (the tram
    keeps moving; stale debug info is worse than none). If the
    vehicle drops out of the snapshot (stale/departed), close the
    popup rather than leave a frozen readout.
  - Presentation/diagnostic only: no changes to data flow, MQTT,
    counts, legend, or red-dot behavior. No persistence.
  - Mobile is verified manually by the user after merge (same
    arrangement as TV-0015): keep popup sizing sane by construction
    (Leaflet default behavior, no custom breakpoint logic) and note
    small-viewport risks in `Known limitations`.

## Acceptance

- Live verification (headless Chrome + CDP over the real feed):
  click a service tram's marker → popup opens with all fields above,
  values consistent with the algorithm in the task; popup follows the
  marker over ≥30 s of movement with content refreshing (capture the
  route resolution fields for at least two vehicles, one red-dot if
  any are reporting — the depot `1009TX` tram(s) are the usual
  candidates); vehicle departure (or synthetic staleness) closes the
  popup.
- If no red-dot tram is reporting during the window, verify the
  red-dot popup content by synthetic injection through the real
  marker layer, disclosed as such.
- Clicking different markers moves/rewrites the single popup; the
  native tooltip still works on hover.
- `npm run lint`, `npm run format:check`, `npm run build` green; no
  `package.json` change; key discipline unchanged.

## Notes

- Depends on TV-0005 (markers), TV-0011/TV-0013 (offline/bar-tram
  logic being surfaced), TV-0012 (no interplay, but same panel/
  resolver code touched).
- The morning red-dot mystery may be an upstream data issue (e.g.
  feed route ids temporarily not matching GTFS); this task is purely
  the diagnostic tool — do not attempt to fix the discrepancy here.