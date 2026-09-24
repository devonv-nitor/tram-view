---
id: TV-0006
status: REVIEW
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

## Handoff (worker → reviewer/coordinator, 2026-09-24)

- Implemented on `bb/worker-tv-0006-github-pages-thr_zrrgwftw9x`, tip
  `a993ecda2bf615b17a6d0f2c83e815b35f069e5a`: `vite.config.ts` sets
  `base: "/tram-view/"`; `.github/workflows/deploy-pages.yml` builds key-less
  on push to `main` and publishes `dist/` via `upload-pages-artifact@v5` +
  `deploy-pages@v5` (deploy job scoped to `pages: write` + `id-token: write`,
  workflow-level `contents: read` for checkout); `Docs/deployment.md` is the
  deployment runbook including the one-time human enablement step
  (Settings → Pages → Source: GitHub Actions).
- Checks green: `npm install`, `npm run lint`, `npm run format:check`,
  `npm run build`. Local verification: built with 0 `VITE_` env vars and
  `.env.local` moved aside (Vite inlines `.env.local` values); served the
  built `dist/` at the `/tram-view/` subpath with `vite preview` — document
  and both subpath assets returned HTTP 200; headless Chrome rendered the
  Leaflet map and the missing-key error box (TV-0004 message), the intended
  public-site behavior. `dist/` deleted after verification; no key printed
  or committed anywhere.
- Remaining for acceptance: human enables Pages (see Docs/deployment.md),
  then a push to `main` produces a green run and the site loads at
  <https://devonv-nitor.github.io/tram-view/> with a hard refresh. The
  coordinator tracks that; the workflow itself cannot enable Pages.
