# Tram View agent rules

## Authority and default action

Read [PLAN.md](PLAN.md), the task being executed, and its referenced ADRs before
editing. Authority, in order: current user instruction, accepted ADR, this file,
active task, `PLAN.md`, repository convention.

Pause only at `STOP-DECISION`: the work needs a new or changed architectural,
security, data, or public-contract decision that no accepted ADR records. State
the smallest decision needed, the affected boundary, and the options in the task
handoff. An accepted ADR is authority to implement its decision.

## Agent coordination

- The flow (user decision 2026-10-08, replacing the heavier verification
  process): the coordinator designs the task, the worker implements to a
  green build, a reviewer reads the code, the human verifies the running
  app, and the coordinator merges on approval. Browser automation and
  one-off driver scripts are the exception, not the default - this is a
  small app, and the human's eye replaces scripted browser drives.
- The coordinator designs work: writes the task file (next free TV id, per
  the template), settles the design with the user before implementation, and
  dispatches workers in parallel only when tasks are independent.
- The worker implements only the task's allowed paths with one end goal: the
  task's checks green (`npm run lint`, `npm run format:check`, `npm run
  build`, plus any test the task names). The worker commits, pushes its
  branch, and stops at REVIEW; it never merges its own branch and does not
  spin up a browser, write one-off driver scripts, or screenshot the app -
  unless the task file explicitly justifies automated live verification for
  behavior that cannot be checked by the build/tests or by eye.
- After parallel merges, per-branch PASS does not prove the integrated
  result: a rebase can break another branch's acceptance flow or drop
  changes (e.g. an exec bit) that every per-branch run passed. After merging
  a wave, the coordinator starts the dev server on the merged result and
  asks the user to re-verify the integrated app (the same human-verification
  gate as a single task), and routes regressions back to a new task.
- Agents report roadblocks, errors, and requests for assistance to the
  coordinator instead of idling. Once their work is complete they report to
  their parent and stop; no agent runs idle.
- The coordinator stops a thread as soon as its role ends — work merged,
  agent superseded, or task reassigned — and never leaves agents idle.
  Queued messages are never the handoff mechanism: a delivered message wakes
  a stopped thread, so nothing of value is left queued on a dying thread.
- On a worker's REVIEW report the coordinator spawns a reviewer (the user
  names the model per review; none is defaulted). The reviewer judges the
  code only: it may assume the build and checks are green — the worker
  attested that — and spends its effort on whether the diff implements the
  task's requirements, matches the approved design, and stays inside the
  allowed paths. It does not run the app, spin up browsers, or re-run
  checks.
- Reviewers judge only what is on the remote. At the start of every review
  turn run `git fetch origin --prune`, then verify `git rev-parse
  origin/<branch>` equals the reported tip SHA; a missing branch is a
  mismatch. On mismatch, report it and stop — never pick another ref or
  review what is merely available. Then review
  `origin/main..origin/<branch>`, never resolving a bare local branch name,
  checkout, or chat-pasted diff: force-pushes and unfetched refs make every
  name a cache, and only the SHA is immutable. Every verdict states the ref
  and SHA it reviewed.
  Reviewers report their verdict (PASS or CHANGES_REQUESTED, with numbered
  file:line findings) to the coordinator, then stop. On CHANGES_REQUESTED
  the coordinator routes the findings to the worker, or redesigns the task
  if the finding is in the design; the loop repeats.
- On PASS the coordinator starts the local dev server and asks the user to
  review the running app: the prompt carries a short summary of what changed
  and a checklist of what to verify manually. If the user approves, the
  coordinator merges and pushes to GitHub — that approval is the merge
  authorization, no further sign-off needed. If the user rejects, the
  coordinator turns the user's observations into a redesign (new or updated
  task) and the loop repeats from implementation.

## Task flow and evidence

Use `BLOCKED`, `READY`, `IN_PROGRESS`, `REVIEW`, `CHANGES_REQUESTED`, and `DONE`.
For a ready task: the coordinator marks `IN_PROGRESS` (in the worker's
branch), the worker implements only the task's allowed paths, gets the
checks green, self-reviews the diff, and pushes the branch — the coordinator
then marks `REVIEW`. After the reviewer's PASS, the user verifies the
running app; on approval the coordinator merges and marks `DONE`. Serialize
repository writes. Delete the task from `tasks/` and `PLAN.md` after completion.

New task files follow [Tasks/_template.md](Tasks/_template.md): copy it (do not
edit it in place), name the copy `Tasks/TV-XXXX-short-slug.md` with the next
free TV id, fill every front-matter field and section, and write requirements
and acceptance as checkable statements with explicit honest-verification rules.
`_template.md` itself is never assigned, implemented, or deleted.

Retry a failed approach twice for the same failure, changing the approach. After the retry limit, record `STOP-FAILED` and the evidence; do not conceal the failure.

Commit bodies and handoffs use only the
fields that add information: `Task`, `Outcome`, `Files changed`, `Checks run`,
`Evidence`, `Known limitations`, and `Decision requested`. Git history is the
execution record; do not create a duplicate execution log.

## Documentation

- Start with this file, `PLAN.md`, and the active task. Use
  [docs/README.md](docs/README.md) to find only the relevant source and runbook;
  do not load the entire documentation tree.
- Code/configuration owns implementation; link to its owning file instead of
  describing algorithms, fields, defaults, or command flags in prose.
- Contracts own externally required behavior. ADRs own options, chosen decision,
  and why. Preserve requirements that code alone cannot explain.
- Tasks contain remaining work, acceptance, blockers, and the latest necessary
  handoff only. Git owns historical attempts and completed-change evidence.
- Update the owning document with a behavior change; remove superseded text.
  Label accepted but unimplemented decisions and link their implementation task.