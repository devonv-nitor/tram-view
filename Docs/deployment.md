# Deployment: GitHub Pages

Tram View is a static front end with no backend of its own
([Docs/Idea.md](./Idea.md)); it deploys to GitHub Pages as a project site.
The build is key-less - the digitransit API key handling it depends on is
described in [Docs/digitransit.md](./digitransit.md) and
[ADR 0002](./ADR/0002-data-transport.md).

## How deployment works

- Workflow: `.github/workflows/deploy-pages.yml`. Trigger: push to `main`.
- Build: `npm ci` on the Node version pinned in `.nvmrc`, then
  `npm run build`; the `dist/` output is published via the official
  `actions/upload-pages-artifact` + `actions/deploy-pages` pattern
  (`pages: write`, `id-token: write` permissions, scoped to the deploy job).
- Base path: `vite.config.ts` sets `base: "/tram-view/"`, so all asset URLs
  resolve at `https://<owner>.github.io/tram-view/` and a hard refresh at
  the subpath loads correctly. The dev server serves at the same subpath.

## Key-less build (do not change)

`.env.local` is untracked, so CI runners have no `VITE_*` variables and the
deployed bundle contains no digitransit API key. **Never add a `VITE_*` env
entry to the workflow or any committed env file**: Vite inlines `VITE_*`
values into the served bundle, so any key in CI would leak into the public
site. The public Pages site therefore shows the app's missing-key error
path - tram positions need no key, but the line-metadata query does, so the
status panel reports the missing key. That is the intended behavior until
the key policy for the public site is decided.

## One-time human step: enable Pages

The workflow cannot enable Pages itself. A human with repo admin access
must do this once:

1. Open <https://github.com/devonv-nitor/tram-view/settings/pages>.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

GitHub then creates the `github-pages` deployment environment the workflow's
deploy job targets. Until this is done, the workflow's deploy job fails.

## Verifying the deployment

1. On push to `main`, the **Deploy to GitHub Pages** workflow run completes
   green (<https://github.com/devonv-nitor/tram-view/actions>).
2. Open <https://devonv-nitor.github.io/tram-view/> and hard refresh: the
   page loads with the Helsinki map, no wrong-base-path 404s.
3. The tram position stream connects (positions need no key); the status
   panel shows the missing-key error box for line metadata - expected on
   the public site, see the key-less section above.

If the repository is renamed or moved, the site URL changes and
`base` in `vite.config.ts` must change with it.
