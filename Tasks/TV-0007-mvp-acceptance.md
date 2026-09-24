---
id: TV-0007
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0005, TV-0006]
allowed_paths:
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# MVP acceptance verification

Verify the MVP definition from TV-0001 end-to-end on the integrated
`main` (not per-branch results):

1. Runnable locally: fresh clone → install → `npm run dev` works.
2. Connected to digitransit.fi with a locally stored key (no key in
   the repository).
3. Map shows tram icons moving in near-realtime.
4. Deployed GitHub Pages URL shows the same live view.
5. Update `PLAN.md`: status out of INITIAL PLANNING, outstanding-work
   table reflects reality.

## Acceptance

- All checks pass with evidence recorded in the commit message
  (`Checks run` / `Evidence` fields).
- PLAN.md accurately describes the shipped MVP state.
