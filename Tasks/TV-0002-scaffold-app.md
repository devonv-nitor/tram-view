---
id: TV-0002
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: []
allowed_paths:
  - "src/**"
  - "public/**"
  - "*.json"
  - "*.ts"
  - "*.js"
  - "*.html"
  - ".gitignore"
  - ".nvmrc"
  - "Docs/**"
  - "Tasks/**"
  - "AGENTS.md"
  - "PLAN.md"
retry_limit: 2
---

# Scaffold React + TypeScript app

Create the minimal runnable application shell per Docs/Idea.md:

- Vite + React + TypeScript (strict mode), no backend.
- `npm install && npm run dev` serves the app locally.
- `npm run build` and typecheck pass with zero errors.
- Basic lint/format tooling configured.
- Placeholder landing content proving the app renders.
- README section (or Docs/) documenting local run steps.

## Acceptance

- Fresh clone: install, `npm run dev` → app visible in browser on localhost.
- `npm run build` succeeds; typecheck is part of build or a separate script.

## Notes

- No map, API, or styling work in this task — shell only.
- Keep dependency count minimal; map library is chosen in TV-0003.
