/**
 * Digitransit routing API GraphQL client: tram line metadata, API key
 * handling, and the tram-line short-name filter. Transport decision:
 * Docs/ADR/0002-data-transport.md. The key is read from import.meta.env
 * (sourced from the untracked .env.local). TV-0018: the same key also
 * authenticates the map's basemap tile requests (Docs/ADR/0001-map-library.md
 * amendment, Docs/ADR/0003-public-api-key-policy.md amendment) - this module
 * stays the single owner of how it is read, and no key value is ever logged.
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

/** A tram position shown on the map (TV-0005 consumes this). `routeShortName`
 * is null when the vehicle's latest position resolves to no displayed GTFS
 * tram line - depot shunting, training/testing or an absent route (TV-0011
 * renders those vehicles out of service: red dot instead of a line number,
 * TV-0009 category color kept). */
export interface TramPosition {
  /** Line short name, or null when the route is not a displayed tram line. */
  routeShortName: string | null;
  /** Raw HFP route id without the feed prefix (e.g. "1009TX"), as reported
   * by the vehicle's latest position event (TV-0016: the marker popup's
   * route-resolution readout distinguishes the raw id from the resolved
   * line). Already flowed through the snapshot spread; only declared here.
   * Not part of the snapshot equality - consumers re-render on the resolved
   * routeShortName, never on the raw id, so rendering is unchanged. */
  routeId: string;
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

/** Reads the digitransit API key, or null when none is configured.
 * import.meta.env is undefined when the module runs outside Vite (e.g.
 * under Node for live verification). TV-0018: the map asks for the key
 * before adding the basemap tile layer, so that state must not throw - the
 * throwing accessor below stays the one the data clients use. */
export function tryGetDigitransitApiKey(): string | null {
  const key = import.meta.env?.VITE_DIGITRANSIT_API_KEY;
  return typeof key === "string" && key.trim() !== "" ? key : null;
}

/** Reads the digitransit API key. import.meta.env is undefined when the
 * module runs outside Vite (e.g. under Node for live verification). */
export function getDigitransitApiKey(): string {
  const key = tryGetDigitransitApiKey();
  if (key === null) {
    throw new MissingApiKeyError(
      "Missing Digitransit API key: set VITE_DIGITRANSIT_API_KEY in .env.local (copy .env.example), then restart the dev server. The basemap tiles and the tram line labels both need it. See Docs/digitransit.md.",
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

/** TV-0016: the raw route records from the one per-session metadata query,
 * retained as a byproduct of buildTramRouteIndex so the marker popup's
 * debug route resolution can tell the filtered index's conflated null-reasons
 * apart (route absent from GTFS vs not TRAM mode vs null shortName vs
 * shortName failing the line criteria) without a second request. The
 * rendering path never reads this; it is consulted only by
 * resolveTramRouteDebug. Populated once per session alongside the index and
 * never mutated afterwards. */
interface RawRouteRecord {
  gtfsId: string;
  shortName: string | null;
  mode: string;
}
let rawRouteListForDebug: Map<string, RawRouteRecord> | null = null;

/** TV-0016: the tram-line index itself, retained by buildTramRouteIndex so
 * the debug resolution answers "in the GTFS line index" against the exact
 * index the render path resolves with - the same Map instance the hook
 * stores, not a rebuild. Read-only for the debug path; the index and its
 * caching are unchanged. */
let tramLineIndexForDebug: Map<string, string> | null = null;

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
  // TV-0016: retain the raw routes and the built index for the popup's debug
  // resolution. One per-session fetch; the index below is byte-identical to
  // before, and this Map instance is the one the render path uses.
  const rawRoutes = new Map<string, RawRouteRecord>();
  for (const route of data.routes) {
    rawRoutes.set(route.gtfsId, {
      gtfsId: route.gtfsId,
      shortName: route.shortName,
      mode: route.mode,
    });
  }
  rawRouteListForDebug = rawRoutes;
  const index = new Map<string, string>();
  for (const route of data.routes) {
    if (route.mode !== "TRAM" || route.shortName === null) continue;
    if (!isTramLineShortName(route.shortName)) continue;
    index.set(route.gtfsId, route.shortName);
  }
  tramLineIndexForDebug = index;
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

/** Why one HFP route id resolves the way it does (TV-0016). The render path
 * only ever sees the filtered index, where an absent key conflates several
 * distinct reasons; the popup resolves against the retained raw route list
 * (same session fetch, no extra request) to distinguish them:
 * - `in-tram-line-index`: the render path's case - the route is in the
 *   tram-line index and resolves to a displayed line.
 * - `absent-from-gtfs`: no such gtfsId in the raw GTFS route list at all.
 * - `not-tram-mode`: the route exists but is another GTFS mode (e.g. BUS).
 * - `short-name-missing`: a TRAM route whose GTFS shortName is null.
 * - `short-name-fails-line-criteria`: a TRAM route whose shortName does not
 *   pass isTramLineShortName (the index's pre-filter). */
export type TramRouteResolutionReason =
  | "in-tram-line-index"
  | "absent-from-gtfs"
  | "not-tram-mode"
  | "short-name-missing"
  | "short-name-fails-line-criteria";

/** Debug-only route resolution for one raw HFP routeId (TV-0016). The
 * rendering logic never consults this - the popup reads the same session
 * index and the retained raw route list. */
export interface TramRouteResolution {
  /** The exact key looked up in the GTFS data: `HSL:` + the raw routeId. */
  gtfsId: string;
  /** True when the filtered tram-line index (the render path's index)
   * contains the route - the case resolveTramShortName resolves. */
  inTramLineIndex: boolean;
  reason: TramRouteResolutionReason;
  /** Route mode from the raw GTFS list; null when the route is absent from
   * it. For an indexed route this is the raw record's real mode (TRAM by
   * construction of the index). */
  mode: string | null;
  /** The GTFS shortName: the indexed value when the route is in the index,
   * else the raw GTFS shortName when the route exists there. */
  shortName: string | null;
  /** Whether the shortName passes isTramLineShortName, recomputed here;
   * null when there is no shortName to test. */
  passesLineCriteria: boolean | null;
}

/** Resolves one raw HFP route id for the marker popup's debug readout
 * (TV-0016). Reads the session state retained by buildTramRouteIndex - no
 * request is made and nothing is cached anew. Returns null while the
 * per-session metadata query has not completed (in practice never seen by a
 * popup: no marker exists before the route index loads). */
export function resolveTramRouteDebug(
  routeId: string,
): TramRouteResolution | null {
  const index = tramLineIndexForDebug;
  const raw = rawRouteListForDebug;
  if (index === null || raw === null) return null;
  const gtfsId = `HSL:${routeId}`;
  const rawRoute = raw.get(gtfsId) ?? null;
  const indexedShortName = index.get(gtfsId);
  if (indexedShortName !== undefined) {
    return {
      gtfsId,
      inTramLineIndex: true,
      reason: "in-tram-line-index",
      mode: rawRoute?.mode ?? "TRAM",
      shortName: indexedShortName,
      passesLineCriteria: isTramLineShortName(indexedShortName),
    };
  }
  if (rawRoute === null) {
    return {
      gtfsId,
      inTramLineIndex: false,
      reason: "absent-from-gtfs",
      mode: null,
      shortName: null,
      passesLineCriteria: null,
    };
  }
  if (rawRoute.mode !== "TRAM") {
    return {
      gtfsId,
      inTramLineIndex: false,
      reason: "not-tram-mode",
      mode: rawRoute.mode,
      shortName: rawRoute.shortName,
      passesLineCriteria:
        rawRoute.shortName === null
          ? null
          : isTramLineShortName(rawRoute.shortName),
    };
  }
  if (rawRoute.shortName === null) {
    return {
      gtfsId,
      inTramLineIndex: false,
      reason: "short-name-missing",
      mode: rawRoute.mode,
      shortName: null,
      passesLineCriteria: null,
    };
  }
  return {
    gtfsId,
    inTramLineIndex: false,
    reason: "short-name-fails-line-criteria",
    mode: rawRoute.mode,
    shortName: rawRoute.shortName,
    passesLineCriteria: isTramLineShortName(rawRoute.shortName),
  };
}

/**
 * TV-0017/TV-0020: the trip-pattern query behind the vehicle overview's
 * journey spine (ADR-0002 amendment). One query per **route** per session:
 * the pattern gives the ordered stop names with their coordinates, and
 * `vehiclePositions` gives the id of every vehicle the Routing API is
 * currently running on a trip of that pattern, which is what lets the
 * overview show the pattern of the vehicle's *own* trip instead of an
 * arbitrary one sharing its direction (TV-0020).
 */
const ROUTE_PATTERNS_QUERY = (routeGtfsId: string) => `
  query RoutePatterns {
    route(id: ${JSON.stringify(routeGtfsId)}) {
      patterns {
        directionId
        headsign
        stops {
          gtfsId
          name
          lat
          lon
        }
        vehiclePositions {
          vehicleId
        }
      }
    }
  }
`;

/** One stop of a trip pattern, with the coordinates the spine needs. */
export interface TripPatternStop {
  /** GTFS stop id, e.g. "HSL:1230407". */
  gtfsId: string;
  name: string;
  lat: number;
  lon: number;
}

/** One trip pattern of a route: the ordered stop sequence one trip runs. */
export interface TripPattern {
  /** GTFS direction id: 0-based, while the HFP topic's `dir` is 1-based
   * (ADR-0002 amendment). It is **not** unique per route: several patterns
   * share a direction (short-turn and service variants), so it only narrows
   * the candidates (TV-0020). */
  directionId: number;
  headsign: string | null;
  stops: TripPatternStop[];
  /** TV-0020: the ids of the vehicles the Routing API reports as running a
   * trip of this pattern right now, in the HFP identity form
   * `HSL:<operator>/<vehicle>` (unpadded numbers, e.g. `HSL:40/641`). Empty
   * when no vehicle is running this pattern or the API did not match one. */
  liveVehicles: string[];
}

interface RoutePatternsData {
  route: {
    patterns: {
      directionId: number;
      headsign: string | null;
      stops: { gtfsId: string; name: string; lat: number; lon: number }[];
      vehiclePositions: { vehicleId: string }[];
    }[];
  } | null;
}

const routePatternCache = new Map<string, Promise<TripPattern[]>>();

/** Loads **all** patterns of one HFP route id, cached per session per route.
 * Resolves to an empty array when the route has no patterns; rejects on
 * transport/key errors and clears its cache entry so a later call retries
 * (a failure must be retryable, a success must not be re-fetched). The
 * pattern a vehicle is on is chosen from the returned list by
 * `selectTripPattern` in `journey.ts` - this loader does not pick one. */
export function loadRoutePatterns(
  routeId: string,
  apiKey?: string,
): Promise<TripPattern[]> {
  const cached = routePatternCache.get(routeId);
  if (cached !== undefined) return cached;
  const promise = fetchRoutePatterns(routeId, apiKey);
  routePatternCache.set(routeId, promise);
  promise.catch(() => {
    if (routePatternCache.get(routeId) === promise) {
      routePatternCache.delete(routeId);
    }
  });
  return promise;
}

async function fetchRoutePatterns(
  routeId: string,
  apiKey: string | undefined,
): Promise<TripPattern[]> {
  const data = await graphQlRequest<RoutePatternsData>(
    ROUTE_PATTERNS_QUERY(`HSL:${routeId}`),
    apiKey ?? getDigitransitApiKey(),
  );
  return (data.route?.patterns ?? []).map((pattern) => ({
    directionId: pattern.directionId,
    headsign: pattern.headsign,
    stops: pattern.stops.map((stop) => ({
      gtfsId: stop.gtfsId,
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
    })),
    liveVehicles: pattern.vehiclePositions.map(
      (position) => position.vehicleId,
    ),
  }));
}
