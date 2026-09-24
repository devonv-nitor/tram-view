---
id: TV-0006
status: IN_PROGRESS
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0002]
allowed_paths:
  - "src/**"
  - ".github/**"
  - "*.json"
  - "*.ts"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# GitHub Pages deployment

Make the app deployable to GitHub Pages with no backend of its own.

- Configure Vite base path and asset URLs for GitHub Pages project-site
  serving (correct subpath handling for JS/CSS and any map tile config).
- GitHub Actions workflow: build on push to `main` and publish to Pages.
- Document the Pages enablement step (Settings → Pages → Source) in Docs.

## Acceptance

- Pushing to `main` produces a successful workflow run and the site
  loads at the GitHub Pages URL with the map rendering.
- A hard refresh on the Pages URL loads correctly (no wrong-base-path
  404s).

## Notes

- Requires the repo remote and GitHub Pages settings; as of TV-0001 the
  repository has no remote yet — coordinate with the human before
  final verification.
