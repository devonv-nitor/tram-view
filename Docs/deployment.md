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

## Public-site key policy (human decision, 2026 session)

The deploy build injects `VITE_DIGITRANSIT_API_KEY` from the repo secret
of the same name into the bundle (workflow build-step env). Consequences,
which the human accepted when choosing this policy:

- **The key is public.** Vite inlines `VITE_*` values into the served
  JavaScript; anyone on the site can read the key from devtools. GitHub
  Secrets hides it from the repo and CI logs, not from the artifact.
- The key stored in the secret **must therefore be domain/referer-
  restricted** at <https://digitransit.fi> (restricted to
  `devonv-nitor.github.io`), treated as public, revocable, and cheap to
  rotate. If it is not restricted, rotate to a restricted one before
  relying on the deployment.
- Only the line-metadata GraphQL query uses the key (one query per
  session; tram positions come from the key-less HFP stream, see
  [ADR 0002](./ADR/0002-data-transport.md)), so the exposed surface is
  small.
- The alternative considered — baking line metadata into a static file —
  remains available if the exposed key ever causes abuse (it is an
  ADR 0002 revisit).
- Do not add any other `VITE_*` value or a literal key to the workflow,
  and do not commit any key.

On the deployed site the status panel therefore shows live tram data
labeled with line numbers, instead of the key-less missing-key error
path.

## Key-less local builds (unchanged)

`.env.local` remains the mechanism for local development: untracked, git-
ignored, holding the developer's own key (see
[Docs/digitransit.md](./digitransit.md)). CI runners cannot see it, so a
local build and a CI build differ only in which key source fills the same
variable.

## Verifying the deployment

1. On push to `main`, the **Deploy to GitHub Pages** workflow run completes
   green (<https://github.com/devonv-nitor/tram-view/actions>).
2. Open <https://devonv-nitor.github.io/tram-view/> and hard refresh: the
   page loads with the Helsinki map, no wrong-base-path 404s.
3. The status panel goes live with line numbers labeled (the injected
   public key serves the line-metadata query); the tram position stream
   connects regardless (positions need no key).

If the repository is renamed or moved, the site URL changes and
`base` in `vite.config.ts` must change with it.
