---
id: TV-0013
status: READY
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0009, TV-0011, TV-0012]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# SpåraKoff bar tram (car #175) as a special case

HSL car #175 is the **SpåraKoff** bar tram (per the user; the operator's
own spelling is "Spårakoff" — the user's spelling wins for the label).
It runs only at certain times, so it must be detected by identity, not
by route: the user does not know its line designation and explicitly
says the car number is sufficiently unique.

- **Detection**: `operatorId === 40 && vehicleNumber === 175` in the
  latest position (same latest-event-wins identity the snapshot
  already uses). Never key off `desi`, route id, or line metadata —
  the user's point is that the car number is the reliable signal.
  It currently classifies as category A via the number ranges in
  `src/lib/fleet.ts`; the special case must win over the range lookup
  (keep the range lookup untouched for all other numbers).
- **Marker**: interior `rgb(235, 79, 73)` and the letter **"K"** in
  place of the line number, whenever the car reports — including when
  it resolves to no line. That is the coordinator's reading of the
  user request ("the icon interior should be rgb(235, 79, 73) and it
  should say K", with the user conceding the line designation is
  unknown): the SpåraKoff style is unconditional for this car and
  wins over both the category color and the TV-0011 red dot. The
  teardrop shape, heading rotation, and tooltip stay; the tooltip
  identifies it (e.g. "SpåraKoff — bar tram"). Add the color as a
  dedicated CSS variable (e.g. `--tram-type-sparakoff`), distinct
  from all existing hues; check label ink contrast on it like
  TV-0010 did.
- **Status panel**: while the car is reporting, append a legend line
  in the TV-0012 format — `<swatch> (count) SpåraKoff` (count is
  normally 1). **Hidden by default**: no entry at all when car 175 is
  not in the current snapshot — never a zero-count line. The entry
  appears and disappears with the car.
- **Docs**: one sentence in `Docs/digitransit.md` (or the fleet doc
  section) noting the special case and its detection signal.
- No ADR: a display special case inside the existing legend/marker
  policy. Record the identity-based detection decision in the commit
  evidence.

## Acceptance

- Live verification: if car 175 is reporting during the window,
  capture its marker (interior rgb(235, 79, 73), "K" label, heading
  rotation, tooltip) and the legend line appearing; if it is not
  reporting, verify by code-review of the mapping plus a synthetic
  injection through the real marker layer, and say so honestly —
  including that the legend line stays hidden while it is absent.
- All other trams unchanged: category colors, line labels, red-dot
  offline behavior, and the TV-0012 per-type counts must be unaffected
  (car 175 must not double-count into the A/MLNRV entry while it has
  its own entry).
- `npm run lint`, `npm run format:check`, `npm run build` green; no
  `package.json` change; key discipline unchanged.

## Notes

- Depends on TV-0012 (legend line format) — that task is in review on
  a separate branch; base on current `origin/main` and expect the
  coordinator to merge after it, reconciling the legend code if both
  touched `TramStatusPanel.tsx`.
- The count in the legend line uses the same per-render derivation as
  TV-0012; it will be 1 whenever shown.
- If HSL ever renumbers the bar tram, the task evidence should note
  the observed `oper/veh` at verification time so the constant is
  traceable.
