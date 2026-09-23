# Tram View

A live, at-a-glance view of the HSL tram network in Helsinki. Data comes
from the [digitransit.fi](https://digitransit.fi) API. See
[Docs/Idea.md](Docs/Idea.md) for the product idea and [PLAN.md](PLAN.md)
for the plan.

## Stack

- Vite + React 19 + TypeScript (strict mode)
- No backend; deployable to GitHub Pages (task TV-0006)

## Local development

Requirements: Node 22 (see `.nvmrc`).

```sh
npm install
npm run dev       # serves on http://localhost:5173
```

Other scripts:

```sh
npm run build         # typecheck + production build to dist/
npm run preview       # serve the production build locally
npm run lint          # eslint
npm run format:check  # prettier check
```

## Digitransit API key

Live data tasks (TV-0004 onward) require a digitransit API key:

1. Get a key at <https://digitransit.fi/developers/getting-started/>.
2. Copy `.env.example` to `.env.local` and fill in the key.
3. `.env.local` is git-ignored — never commit it.
