---
# Task file template — copy this file, rename it, and fill in every section.
# File name: Tasks/TV-XXXX-short-slug.md (id matching the front-matter id).
# Delete this instruction block from the copy. Keep the template itself in
# the repo so future tasks stay consistent.

# Front-matter: all fields are required unless marked optional.
id: TV-XXXX            # next free TV number (check PLAN.md and git history)
status: READY          # BLOCKED | READY | IN_PROGRESS | REVIEW | CHANGES_REQUESTED | DONE
owner: agent           # agent | human
gatekeeper: human      # who must sign off acceptance (see AGENTS.md: human/user fields)
required_approvals: [] # optional: list of ADRs/reviews required before merge
depends_on: []         # task ids this task needs merged first (from PLAN.md)
allowed_paths:         # the ONLY paths this task may change (AGENTS.md rule)
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2         # failed-approach retries before STOP-FAILED (AGENTS.md)
---

# <Imperative one-line summary of the task>

<Why this task exists: the user need or defect, with links to the source
(user request, ADR, prior task) and any live-verified facts the worker can
assume. State what is true NOW so the worker does not re-derive it.>

## Requirements

<Numbered, checkable requirements. Be precise about:
- exact values (colors, ids, thresholds) and their source (user/ADR/census)
- the distinguishing signals to use and which signals must NOT be trusted
- what wins when behaviors interact (precedence between special cases)
- what must NOT change (guard rails: untouched behavior, files, counts)>

## Acceptance

<Numbered, verifiable checks. Every check must state what evidence counts:
- live verification: what to capture, over what window, with what tool
- honest-fallback rules: if the live event cannot be observed, what
  synthetic/code-review substitute is acceptable, and that it must be
  DISCLOSED as such rather than implied
- the standard checks: `npm run lint`, `npm run format:check`,
  `npm run build` green; no `package.json` change unless disclosed; key
  discipline unchanged (never print/commit the API key, delete `dist/`)

## Notes

<Cross-task constraints, merge-order hints, known data quirks with dates,
and anything the coordinator told the worker that must survive into the
file. Omit if empty — do not pad.>

## Handoff (status: REVIEW → DONE — optional, delete before merge)

<Only current, necessary handoff information for the next agent. Git owns
history; do not duplicate the execution log here.>
