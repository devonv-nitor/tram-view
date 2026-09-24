---
id: TV-0015
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0004, TV-0012]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Collapsible debug panel: circle in the top-right when collapsed

The status panel (TramStatusPanel) permanently occupies its corner and
takes too much room on mobile (user report, 2026-09-24 session). Make it
collapsible:

- **Default open.** On load the panel is expanded exactly as today —
  no behavior change for existing users.
- **One click/tap to collapse and to restore.** A clearly visible
  affordance (e.g. a chevron or × in the panel header, and the circle
  itself when collapsed) toggles the state with a single interaction;
  no double-tap, no long-press.
- **Collapsed state: a small, semi-transparent circle** in the same
  top-right spot — unobtrusive over the map, big enough to be a
  reliable touch target (≥ ~40 px hit area; visual circle may be
  smaller with padding around it). Consider showing the tram count
  inside (e.g. "105") as a compact live indicator, since the panel
  currently surfaces that at a glance — worker's choice, document it.
- **State survives nothing fancy**: per-session UI state (component
  state, default open on every load) is fine; no persistence required
  (do not add localStorage — YAGNI unless a later task asks).
- Keep all current panel content and a11y semantics while expanded
  (`aria-live`, legend, counts); the collapsed control must be
  keyboard-accessible (`button` semantics, aria-expanded /
  aria-label; the collapsed circle must be reachable and operable by
  keyboard and screen reader, not just a decorative div).
  Mobile behavior is verified manually by the user after merge — do
  not device-emulate; just keep the implementation free of
  breakpoint assumptions and note anything that might behave
  differently on small viewports in `Known limitations`.
- Presentation-only: no changes to data flow, snapshot logic, MQTT,
  or marker layers.

## Acceptance

- Live verification (headless Chrome + CDP over the real feed): panel
  defaults open with unchanged content; one click collapses to the
  semi-transparent circle in the top-right; one click restores
  identically; repeat twice. Verify the toggle with a click (not just
  programmatic class flips) and capture both states.
- Keyboard: tab reaches the toggle, Enter/Space toggles, aria-expanded
  reflects state.
- `npm run lint`, `npm run format:check`, `npm run build` green; no
  `package.json` change; key discipline unchanged.

## Notes

- Independent of all other tasks; nothing pending it.
- Do not rename existing CSS hooks used by tests/verification in prior
  tasks (`.debug-panel` etc.) without updating Docs references.

## Handoff (status: REVIEW → DONE — optional, delete before merge)

- Implementation at the origin tip of
  `bb/worker-tv-0015-collapsible-panel-thr_9ppbrhhbuw`; live-verified with
  headless Chrome + CDP over the real feed (34/34 checks, evidence in the
  commit body).
- Worker's choice documented: the collapsed circle shows the live tram
  count (updates with every snapshot); a chevron shows while loading,
  connecting, or errored. Focus moves to the surviving affordance on
  toggle. Mobile is verified manually by the user after merge; small-
  viewport risks are in the commit's `Known limitations`.
