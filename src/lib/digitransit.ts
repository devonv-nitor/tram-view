/**
 * Digitransit routing API GraphQL client: tram line metadata, API key
 * handling, and the tram-line short-name filter. Transport decision:
 * Docs/ADR/0002-data-transport.md. The key is read from import.meta.env
 * (sourced from the untracked .env.local) and only ever sent to the
 * digitransit routing API.
 */

const ROUTING_GRAPHQL_ENDPOINT =
  "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";

const TRAM_ROUTES_QUERY = `
  query TramRoutes {
    routes {
      gtfsId
      shortName
      mode
    }
  }
`;

/** Error thrown when the digitransit API key is missing or rejected. */
export class MissingApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingApiKeyError";
  }
}

/** A tram position filtered to a displayed tram line (TV-0005 consumes this). */
export interface TramPosition {
  routeShortName: string;
  directionId: string;
  operatorId: number;
  vehicleNumber: number;
  lat: number;
  lon: number;
  heading: number | null;
  speed: number | null;
  /** Epoch milliseconds of the vehicle-reported position event. */
  receivedAt: number;
}

interface TramRoutesData {
  routes: { gtfsId: string; shortName: string | null; mode: string }[];
}

interface GraphQLResponseBody<T> {
  data?: T;
  errors?: { message: string }[];
}

/** Reads the digitransit API key. import.meta.env is undefined when the
 * module runs outside Vite (e.g. under Node for live verification). */
export function getDigitransitApiKey(): string {
  const key = import.meta.env?.VITE_DIGITRANSIT_API_KEY;
  if (typeof key !== "string" || key.trim() === "") {
    throw new MissingApiKeyError(
      "Missing Digitransit API key: set VITE_DIGITRANSIT_API_KEY in .env.local (copy .env.example), then restart the dev server. See Docs/digitransit.md.",
    );
  }
  return key;
}

async function graphQlRequest<T>(query: string, apiKey: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ROUTING_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Digitransit-Subscription-Key": apiKey,
      },
      body: JSON.stringify({ query }),
    });
  } catch (cause) {
    throw new Error(
      `Digitransit routing API request failed: ${String(cause)}`,
      { cause },
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new MissingApiKeyError(
      `Digitransit API rejected the subscription key (HTTP ${response.status}). Check VITE_DIGITRANSIT_API_KEY in .env.local. See Docs/digitransit.md.`,
    );
  }
  if (!response.ok) {
    throw new Error(`Digitransit routing API returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as GraphQLResponseBody<T>;
  if (body.errors !== undefined && body.errors.length > 0) {
    throw new Error(
      `Digitransit GraphQL errors: ${body.errors.map((error) => error.message).join("; ")}`,
    );
  }
  if (body.data === undefined) {
    throw new Error("Digitransit GraphQL response has no data");
  }
  return body.data;
}

let tramRouteIndexPromise: Promise<Map<string, string>> | null = null;

/** Loads and caches tram line metadata (gtfsId -> short name) from the keyed
 * routing API. Cached per session; failures (including a missing API key)
 * reject rather than throw synchronously, and clear the cache so a later
 * call retries. */
export function loadTramRouteIndex(
  apiKey?: string,
): Promise<Map<string, string>> {
  tramRouteIndexPromise ??= buildTramRouteIndex(apiKey);
  tramRouteIndexPromise.catch(() => {
    tramRouteIndexPromise = null;
  });
  return tramRouteIndexPromise;
}

async function buildTramRouteIndex(
  apiKey: string | undefined,
): Promise<Map<string, string>> {
  const data = await graphQlRequest<TramRoutesData>(
    TRAM_ROUTES_QUERY,
    apiKey ?? getDigitransitApiKey(),
  );
  const index = new Map<string, string>();
  for (const route of data.routes) {
    if (route.mode !== "TRAM" || route.shortName === null) continue;
    if (!isTramLineShortName(route.shortName)) continue;
    index.set(route.gtfsId, route.shortName);
  }
  return index;
}

/** Tram lines Tram View displays: 1-15 with an optional trailing letter
 * (e.g. 9N, 10B), or a single letter (e.g. H). Case-insensitive. */
const TRAM_LINE_SHORT_NAME = /^(?:(?:[1-9]|1[0-5])[A-Z]?|[A-Z])$/;

export function isTramLineShortName(shortName: string): boolean {
  return TRAM_LINE_SHORT_NAME.test(shortName.trim().toUpperCase());
}

/** Maps an HFP route id (no feed prefix) to the line short name, or null
 * when the route is not a displayed tram line. */
export function resolveTramShortName(
  routeIndex: Map<string, string>,
  routeId: string,
): string | null {
  return routeIndex.get(`HSL:${routeId}`) ?? null;
}
