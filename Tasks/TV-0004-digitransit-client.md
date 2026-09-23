---
id: TV-0004
status: REVIEW
owner: agent
gatekeeper: human
required_approvals: []
depends_on: [TV-0002]
allowed_paths:
  - "src/**"
  - "Docs/**"
  - "Tasks/**"
  - "PLAN.md"
retry_limit: 2
---

# Digitransit data client + API key handling

Connect the app to the digitransit.fi API and fetch live tram vehicle positions.

1. Write `Docs/ADR/0002-data-transport.md`: choose the transport and
   refresh strategy (GraphQL polling interval vs realtime subscription)
   that balances near-realtime updates against API load. Record options,
   decision, why.
2. API key stored locally only: read from an environment variable sourced
   from an uncommitted file (e.g. `.env.local` with a `VITE_`-prefixed var).
   Add the file to `.gitignore`, document setup in Docs, never commit a key.
3. Implement the client: query vehicle positions filtered to tram mode
   (route short names 1–15, optional trailing letter, or single letter).

## Acceptance

- With a locally stored key, fetched tram positions are visible
  (devtools log or debug panel is sufficient at this stage).
- Missing key produces a clear error message, not a silent failure.
- `git grep` for the key value finds nothing; `.env.local` is ignored.

## Notes

- Rendering is TV-0005; this task delivers data only.
