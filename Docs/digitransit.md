# Digitransit data: API key and live tram positions

Tram View reads live HSL tram positions and tram line metadata from two
digitransit-provided transports. The transport decision (MQTT push vs
polling) is recorded in
[ADR 0002](./ADR/0002-data-transport.md); this page is the setup runbook.

## Data architecture at a glance

| Data | Transport | API key |
| ---- | --------- | ------- |
| Tram vehicle positions (lat/lon, heading, speed, direction, route id, vehicle number) | HFP MQTT over WebSockets, `wss://mqtt.hsl.fi:443/`, topic `/hfp/v2/journey/ongoing/vp/tram/#` (push, ~1 update/s per vehicle) | not needed |
| Tram line metadata (route id -> short name, mode) | Routing API v2 GraphQL, `POST https://api.digitransit.fi/routing/v2/hsl/gtfs/v1`, query `routes { gtfsId shortName mode }`, fetched once per session and cached | required |

The positions subscription is anonymous. The line-metadata query requires a
digitransit subscription key; without one the app shows a clear error instead
of silently hiding data, because the tram-line filter (short names 1-15 with
an optional trailing letter, or a single letter) cannot be applied without
the metadata.

Out-of-service trams (TV-0011): a vehicle whose latest position resolves to
no displayed GTFS tram line - depot shunting, training/testing, or an absent
route such as `1009TX` - is kept in the snapshot with `routeShortName: null`
instead of being dropped, and renders as its normal category-colored marker
with the line number replaced by a red dot (`--tram-type-offline`). The
distinguishing signal is exactly that route resolution, not the `desi` field
or the route-id string; dedup stays latest-position-per-vehicle, so a vehicle
that reports under both a service route and an out-of-service route shows
whichever event arrived last, and vehicles that stop publishing still
disappear after the staleness cutoff.

## API key setup

1. Register for a digitransit subscription key at
   <https://digitransit.fi/developers/getting-started/>.
2. Copy `.env.example` to `.env.local` in the repo root.
3. Set your key in `.env.local` as `VITE_DIGITRANSIT_API_KEY=<your key>`.
4. Restart the dev server - Vite only reads env files at startup.

`.env.local` is listed in `.gitignore` and must never be committed. Only
variables prefixed with `VITE_` are exposed to the app, and they are compiled
into the served bundle, so never commit a key or embed one in deployed code.

For the deployed GitHub Pages site, the key comes from the repo secret
`VITE_DIGITRANSIT_API_KEY` instead of `.env.local` (see
[Docs/deployment.md](./deployment.md)); because it is inlined into the
served bundle either way, the deployed key is public and must be
domain-restricted at digitransit.fi. The policy and its accepted
trade-offs are recorded in
[Docs/ADR/0003-public-api-key-policy.md](./ADR/0003-public-api-key-policy.md).

## Verifying the data flow

Run `npm run dev` and open the app. In the top-right corner of the map, a
small status panel (`src/components/TramStatusPanel.tsx`) reports the state
of the data client:

- an error box with the reason when the API key is missing or rejected, or
  the connection fails;
- "Loading tram line metadata..." while the keyed GraphQL query runs;
- "Connecting to the tram position stream..." while the MQTT subscription
  comes up;
- once live, a status line with the number of trams currently tracked and
  the time of the last update, plus a color legend for the tram rolling
  stock categories (`src/lib/fleet.ts`) shown on the map markers and a
  red-dot entry for out-of-service trams (TV-0011).

Positions and line metadata are produced by `src/lib/hfp.ts` and
`src/lib/digitransit.ts`, and surfaced to UI code as `TramPosition` objects
via the `useTramPositions()` hook (`src/hooks/useTramPositions.ts`).
`src/map/MapView.tsx` renders the live markers (one teardrop-shaped marker
per vehicle: the line short name inside the rounded body, the body colored
by the vehicle's rolling stock category, the point rotated toward the
vehicle's reported heading, and a hover tooltip with the full model name,
managed by `src/map/TramMarkers.ts`; an out-of-service vehicle swaps the
line short name for the red not-in-service dot).
While the tab is hidden, the position stream and the one-second snapshot tick pause
entirely and resume on focus, so a hidden tab pulls no feed traffic.
