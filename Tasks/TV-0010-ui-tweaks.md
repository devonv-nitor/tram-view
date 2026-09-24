---
id: TV-0010
status: READY
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0009]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# UI tweaks: brand category colors + stable panel width

Two small, independent UI fixes. No architectural impact — no ADR
changes needed.

## 1. Category colors

Update the tram-type colors in `src/index.css` (the `--tram-type-*`
variables, TV-0009):

- Cat A (MLNRV I/II): `#FCB919` (replaces `#007ac9`)
- Cat B (Artic): `#00A664` (replaces `#15803d`)
- Cat C (Artic X54): `#00BBE7` (replaces `#b45309`)
- Unknown stays as-is unless contrast demands otherwise; note any such
  adjustment in the evidence.

These are user-specified brand colors — apply them as given. Check the
line-number label and heading rotor remain readable on the new hues,
and that the legend swatches pick the colors up automatically (they
share the variables).

## 2. Fixed status-panel width

The live status line's clock (`updatedAt.toLocaleTimeString()`) makes
the panel breathe by a few pixels every second. Pin the panel to a
fixed width:

- Pick a width that fits the widest expected content with comfortable
  margin (the panel holds the live line, the legend, and error/loading
  variants — the error variant's long message wraps, which is fine).
- The current responsive clamp (`max-width: min(24rem, calc(100% -
  8rem))`, TV-0002 merge review) must keep working on narrow
  viewports; the fixed width replaces only the shrink-to-fit behavior,
  not the responsive ceiling.
- Implement it however is cleanest (e.g. `width` with the existing
  `max-width` clamp retained, or `min-width` == `max-width` within the
  clamp); the acceptance is no width change over time, at any viewport.

## Acceptance

- Markers, legend swatches, and tooltips use the new colors; line
  numbers and heading rotors remain legible on all three hues (live or
  screenshot-verified, not asserted).
- The status panel's rendered width is pixel-identical across
  consecutive seconds while the clock ticks (verified in the browser,
  e.g. two timed DOM measurements a few seconds apart), including a
  check at a narrow viewport.
- `npm run lint`, `npm run format:check`, `npm run build` all green;
  no `package.json` change; key discipline unchanged (never print or
  commit the key, `dist/` deleted after builds).

## Notes

- Depends on TV-0009 (both touch the same variables/panel).
- Live data may not be required for (2), but (1) needs the real feed or
  at minimum the legend to verify hue application end-to-end; `.env.local`
  with the real key is provided in the worktree by the coordinator.
- This is the last UI polish before TV-0007; keep the diff minimal.
