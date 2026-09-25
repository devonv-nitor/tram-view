# ADR 0003: Public-site digitransit API key policy

- Status: Accepted (2026-09-24)
- Decides: how the digitransit API key is provided to the deployed
  GitHub Pages build, and what that means for secrecy.
- Affects: `.github/workflows/deploy-pages.yml`, `Docs/deployment.md`,
  `src/lib/digitransit.ts` (consumer of `VITE_DIGITRANSIT_API_KEY`).
- Implemented by: coordinator on direct human instruction (2026 session);
  refines [ADR 0002](./0002-data-transport.md)'s key handling.

## Context

The app needs the digitransit key for exactly one thing: the per-session
GraphQL line-metadata query (route id → short name; see ADR 0002). Tram
positions come from the key-less HFP MQTT stream. TV-0004 stored the key
in an untracked `.env.local` for local development, and TV-0006 shipped a
deliberately key-less public build: Vite inlines `VITE_*` values into the
served bundle, so a key in CI would be public, and the deployed site
showed the missing-key error path instead of line numbers.

The human then decided the deployed site must work: the key was added to
the repository's GitHub Secrets, and the deploy workflow was changed to
inject it at build time. This ADR records what that does and does not
mean, so the change is not mistaken for secrecy.

## Options

### Option A - Key-less public build

Keep the TV-0006 posture: CI has no key; the public site renders the map
and live positions but cannot label lines, showing the missing-key error
path.

- Pros: zero key exposure; no policy burden.
- Cons: the deployed site is decorative - the product's core display
  (line numbers in icons) does not work publicly.

### Option B - Key in GitHub Secrets, injected at build time (chosen)

Store the key as the repo secret `VITE_DIGITRANSIT_API_KEY`; the deploy
workflow passes it to `npm run build` as an environment variable.

- Pros: the public site is fully functional; the key is not committed to
  the repo and does not appear in CI logs (GitHub Secrets are redacted
  from logs); rotation is a secret-store update plus a re-run, no commit.
- Cons: **the key is public anyway** - Vite compiles `VITE_*` into the
  bundle, and the bundle is served to everyone. GitHub Secrets protects
  source and logs, not artifacts. Anyone can read the key from devtools
  or the bundle, and non-browser clients can spoof the referer.

### Option C - Static line metadata, no key at all

Bake the (rarely changing) route-id → short-name mapping into a
versioned static file with a regeneration script.

- Pros: no key anywhere, no per-session keyed request, least load.
- Cons: an ADR 0002 revisit (transport change) plus a maintenance chore
  when HSL changes its line structure; deferred.

## Decision

Option B, on the human's instruction (2026 session), with these binding
constraints:

1. **The key in the secret is treated as public information.** Its only
   protection is the restrictions digitransit.fi puts on it: it must be
   domain/referer-restricted to `devonv-nitor.github.io`, and it must be
   cheap to revoke and rotate. If the stored key is not restricted,
   rotate it to a restricted one.
2. The secret is the **only** sanctioned key channel for CI: no literal
   key in any committed file, no other `VITE_*` values in the workflow.
3. Only this one key is published; the HFP stream stays anonymous and no
   other credential may join it.
4. If the exposed key is ever abused (quota exhaustion, spoofed-referer
   scraping), the fallback is Option C (static metadata) plus rotation -
   not adding protections that pretend the bundle is private.

## Consequences

- The deployed site labels lines with the keyed metadata query; the
  status panel goes live instead of showing the missing-key error path.
- `Docs/deployment.md` documents the injection and its verification.
- The misalignment risk is now carried permanently: any contributor may
  reasonably assume "GitHub secret" means "secret"; this ADR is the
  counterexample. The workflow header states the same constraint where
  the next contributor will actually see it.
- Local development keeps `.env.local` (a developer's own key); CI
  builds differ from local builds only in the key's source, not its
  handling.

## Amendment: the key also authenticates basemap tile requests

- **Status:** Accepted (2026-09-25, user decision); implemented by
  [TV-0018](../../Tasks/TV-0018-hsl-basemap-tiles.md).
- **Decides:** that the single published key now also covers the map's
  basemap tiles, and what does not change because of it.
- **Refines, does not replace, the Decision above:** the key is still the
  one public credential, still provided through the repo secret for
  deployed builds and `.env.local` locally, and still read in exactly one
  place (`src/lib/digitransit.ts`).

The Context above states that the key was needed for "exactly one thing"
(the per-session line-metadata query). The
[ADR 0001 basemap amendment](./0001-map-library.md) switches the basemap
from key-free OpenStreetMap tiles to HSL's style served by the keyed
Digitransit Map API, so that statement is no longer true: the key is now
sent

- as a `Digitransit-Subscription-Key` header on the line-metadata GraphQL
  query (once per session), and
- as a `digitransit-subscription-key` **query parameter** on every basemap
  tile request (a Leaflet `<img>` cannot send headers; the parameter is the
  documented alternative).

What does not change:

1. **Still public, still one key.** The tile parameter is readable from the
   page's own image URLs and devtools exactly like the inlined bundle value;
   no new secret, credential, or `VITE_*` value is introduced, and the HFP
   stream stays anonymous.
2. **Still domain/referer-restricted** to `devonv-nitor.github.io`, still
   treated as public, revocable, and cheap to rotate. Tile requests come from
   the same origin as the metadata query, so the existing restriction covers
   them; local development works because the API does not enforce a referer
   for a keyed request (probed 2026-09-25).
3. **The fallback is unchanged.** Option C (static metadata) still removes
   the metadata request, but it does not remove the tile requests — that
   fallback would now need a key-free or self-hosted raster style as well.

New consequences:

- Key traffic grows from one request per session to one per tile (dozens per
  pan/zoom), served by the CDN with `cache-control: public,max-age=604800`
  (7 days) and no user data in the request.
- A rejected or missing key now also removes the basemap: the map adds no
  tile layer and does not fall back to a key-free provider, and the status
  panel's missing-key error names both consumers. `tryGetDigitransitApiKey()`
  in `src/lib/digitransit.ts` is the non-throwing read the map uses.
- If the exposed key's tile traffic is ever abused, rotation plus a static or
  self-hosted style is the response, not a pretence of secrecy.
