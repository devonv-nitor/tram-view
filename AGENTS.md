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

- Execute work with parallel subagents. Default worker provider is Pi with
  Lyceum `lyceum/z-ai/glm-5.3-flash` and thinking at max reasoning; restart
  an agent on failure. Never switch to Claude without explicit human authorization.
- The coordinator merges completed work once its reviewer PASS and required
  hosted checks are green; that standing authorization satisfies task
  `gatekeeper: human/user` fields (user decision 2026-09-15). Workers stop at
  REVIEW and never merge their own branches.
- After parallel merges, per-branch PASS and hosted checks do not prove the
  integrated result: a rebase can break another branch's acceptance flow or
  drop changes (e.g. an exec bit) that every per-branch run passed. The
  coordinator has a reviewer explicitly review each merge delta — the
  previous and new `origin/main` tips, reported and verified like any
  review — before the wave is done, and routes findings back to the
  responsible worker.
- Agents report roadblocks, errors, and requests for assistance to the
  coordinator instead of idling. Once their work is complete they report to
  their subagent or parent and stop; no agent runs idle.
- The coordinator stops a thread as soon as its role ends — work merged,
  agent superseded, or task reassigned — and never leaves agents idle.
  Reviewer children are parented to the worker that will act on their
  findings; when a worker is replaced, its reviewers are stopped with it and
  their findings are relayed to the successor explicitly. Queued messages
  are never the handoff mechanism: a delivered message wakes a stopped
  thread, so nothing of value is left queued on a dying thread.
- On completion an agent launches a reviewer child: default Claude Code
  `claude-opus-5[1m]` at medium thinking. The worker's
  review request reports the exact origin tip SHA to review. Reviewers judge
  the diff (not the agent's report) against the task's requirements.
- Reviewers judge only what is on the remote. At the start of every review
  turn run `git fetch origin --prune`, then verify `git rev-parse
  origin/<branch>` equals the reported tip SHA; a missing branch is a
  mismatch. On mismatch, report it and stop — never pick another ref or
  review what is merely available. Then review
  `origin/main..origin/<branch>`, never resolving a bare local branch name,
  checkout, or chat-pasted diff: force-pushes and unfetched refs make every
  name a cache, and only the SHA is immutable. Every verdict states the ref
  and SHA it reviewed.
  Reviewers always report their verdict to their parent worker, then stop.
  On PASS the worker stops and reports the PASS to the coordinator; on
  CHANGES_REQUESTED the worker implements the requested changes and starts a
  new reviewer.

## Task flow and evidence

Use `BLOCKED`, `READY`, `IN_PROGRESS`, `REVIEW`, `CHANGES_REQUESTED`, and `DONE`.
For a ready task: mark `IN_PROGRESS`, implement only its allowed paths, run its
checks plus relevant live verification, self-review the diff, then mark `REVIEW`
and `DONE` when acceptance is met. Serialize repository writes. Delete the task from `tasks/` and `PLAN.md` after completion.

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