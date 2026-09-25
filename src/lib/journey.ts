/**
 * TV-0017: journey derivations for the overview's spine - where the vehicle is
 * in its stop sequence, how far the next stop is, and what the timetable plus
 * the reported schedule deviation imply for arrival.
 *
 * Everything derived here is labelled as derived in the UI: the stop sequence
 * comes from the keyed trip-pattern query and is tied to the vehicle's own
 * live trip (TV-0020, `selectTripPattern`), the distance is straight-line from
 * the reported position to the pattern stop's coordinates, and the estimate is
 * `timetable - dl` using the *reported* deviation and its age - never
 * presented as a measurement.
 */
import type { TripPattern } from "./digitransit.ts";
import { formatClock } from "./format.ts";
import type { TelemetryEvent } from "./vehicleTelemetry.ts";

/** One stop of the spine, with everything the row can honestly show. */
export interface SpineStop {
  /** GTFS stop id, e.g. "HSL:1230407". */
  gtfsId: string;
  /** The bare stop id the HFP messages use, e.g. "1230407". */
  stopId: string;
  name: string;
  /** Position in the pattern, 0-based. */
  index: number;
  /** Where the vehicle is relative to this stop. */
  state: "passed" | "next" | "upcoming" | "terminus";
  /** Straight-line distance from the reported position, when it is the next
   * stop and a position exists. */
  distanceMeters: number | null;
  /** The most recent observed event for this stop, if any - including
   * position-only `vp` messages, which say where the vehicle was but never
   * carry a timetable time. */
  observed: TelemetryEvent | null;
  /** The most recent event for this stop that actually announced a timetable
   * time (`ttarr`/`ttdep`). The arrival estimate must use this: a `vp` for the
   * same stop is newer but has no timetable time to correct. */
  announced: TelemetryEvent | null;
}

export interface JourneyPosition {
  /** The stop the vehicle is heading to (or at), or null when unknown. */
  next: SpineStop | null;
  /** Ordered spine, one entry per pattern stop. */
  stops: SpineStop[];
  /** Number of stops before the next one. */
  passedCount: number;
  /** Number of stops after the next one. */
  remainingCount: number;
  /** True when the pattern is known and the next stop was found in it. */
  complete: boolean;
}

/** Great-circle distance in metres (haversine; no dependency). */
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The bare HFP stop id behind a GTFS stop id. */
export function bareStopId(gtfsId: string): string {
  return gtfsId.startsWith("HSL:") ? gtfsId.slice(4) : gtfsId;
}

/** The HFP identity of a vehicle as the Routing API names it in
 * `patterns.vehiclePositions.vehicleId`: `HSL:<operator>/<vehicle>`, unpadded
 * (vehicle `0040/00641` reports as `HSL:40/641`). Returns null for numbers
 * that are not non-negative integers. */
export function liveVehicleId(
  operatorId: number,
  vehicleNumber: number,
): string | null {
  if (!Number.isInteger(operatorId) || !Number.isInteger(vehicleNumber)) {
    return null;
  }
  if (operatorId < 0 || vehicleNumber < 0) return null;
  return `HSL:${operatorId}/${vehicleNumber}`;
}

/** Everything the pattern choice may look at. All of it comes from the
 * stream: the topic's 1-based `dir` and its (abbreviated) headsign, the next
 * stop id, and the vehicle's own identity. */
export interface PatternCriteria {
  direction: string | null;
  headsign: string | null;
  nextStopId: string | null;
  vehicleId: string | null;
}

/** Why no pattern could be chosen. */
export type PatternMissReason =
  "no-patterns" | "direction-unknown" | "no-pattern-for-direction";

export interface PatternSelection {
  pattern: TripPattern | null;
  /** True only when the Routing API reports this vehicle running a trip of
   * this pattern (`vehiclePositions`), which is the one case that is a fact
   * rather than an inference. */
  exact: boolean;
  /** The filters that actually narrowed the candidate set, in application
   * order - shown in the UI so an inferred choice is visible as one. */
  filters: string[];
  missReason: PatternMissReason | null;
}

/** Case- and punctuation-insensitive comparison form for headsigns: the HFP
 * topic abbreviates (`Olympiaterm.`) where GTFS does not
 * (`Olympiaterminaali`), so only containment can be compared. */
function comparableHeadsign(value: string): string {
  return value.toLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, "");
}

function narrow(
  candidates: TripPattern[],
  matching: TripPattern[],
  filter: string,
): { candidates: TripPattern[]; filters: string[] } {
  if (matching.length === 0 || matching.length === candidates.length) {
    return { candidates, filters: [] };
  }
  return { candidates: matching, filters: [filter] };
}

/** TV-0020: which of a route's patterns is this vehicle running?
 *
 * A route has many patterns per `directionId` (short-turn and service
 * variants), so `directionId` alone picks an arbitrary one - observed live on
 * `HSL:1005`, where one `directionId` group of three contains both
 * `Jätkäsaari`-bound patterns of 11 and 18 stops and an 8-stop
 * `Katajanokan term.` pattern going the other way.
 *
 * The Routing API does the HFP-to-trip matching itself and publishes the
 * result as each pattern's `vehiclePositions`, so an exact match on the
 * vehicle's own id wins outright. Only when the API reports no live trip for
 * the vehicle (just left the depot, changed line, stale match) does the
 * fallback chain run: direction, then headsign containment, then containment
 * of the reported next stop, then the longest candidate. Longest is the
 * measured best proxy: against the live-trip truth over the whole live fleet
 * it agreed on 63 of 84 vehicles versus 52 for shortest (25% vs 37% of the
 * inferred picks were a different variant of the same direction and
 * headsign). Every inferred choice is marked `exact: false` and labels its
 * filters, so the UI never presents a guess as the vehicle's trip. */
export function selectTripPattern(
  patterns: TripPattern[],
  criteria: PatternCriteria,
): PatternSelection {
  if (patterns.length === 0) {
    return {
      pattern: null,
      exact: false,
      filters: [],
      missReason: "no-patterns",
    };
  }
  if (criteria.vehicleId !== null) {
    const live = patterns.find((pattern) =>
      pattern.liveVehicles.includes(criteria.vehicleId as string),
    );
    if (live !== undefined) {
      return {
        pattern: live,
        exact: true,
        filters: ["live trip"],
        missReason: null,
      };
    }
  }
  const directionId = Number(criteria.direction) - 1;
  if (criteria.direction === null || !Number.isInteger(directionId)) {
    return {
      pattern: null,
      exact: false,
      filters: [],
      missReason: "direction-unknown",
    };
  }
  let candidates = patterns.filter(
    (pattern) => pattern.directionId === directionId,
  );
  const filters: string[] = [];
  if (candidates.length === 0) {
    return {
      pattern: null,
      exact: false,
      filters,
      missReason: "no-pattern-for-direction",
    };
  }
  filters.push("direction");
  if (criteria.headsign !== null) {
    const wanted = comparableHeadsign(criteria.headsign);
    if (wanted.length > 0) {
      const matched = candidates.filter((pattern) => {
        const candidate = comparableHeadsign(pattern.headsign ?? "");
        return (
          candidate.includes(wanted) ||
          (candidate.length > 0 && wanted.includes(candidate))
        );
      });
      const narrowed = narrow(candidates, matched, "headsign");
      candidates = narrowed.candidates;
      filters.push(...narrowed.filters);
    }
  }
  if (criteria.nextStopId !== null) {
    const matched = candidates.filter((pattern) =>
      pattern.stops.some(
        (stop) => bareStopId(stop.gtfsId) === criteria.nextStopId,
      ),
    );
    const narrowed = narrow(candidates, matched, "next stop");
    candidates = narrowed.candidates;
    filters.push(...narrowed.filters);
  }
  const pattern = candidates.reduce((best, candidate) =>
    candidate.stops.length > best.stops.length ? candidate : best,
  );
  if (candidates.length > 1) filters.push("longest");
  return { pattern, exact: false, filters, missReason: null };
}

/** Places the vehicle in its pattern using the next stop id it reports.
 * Without a pattern, or when the reported stop is not in it, the spine is
 * empty and `complete` is false - the caller shows why rather than a guess. */
export function describeJourney(
  pattern: TripPattern | null,
  nextStopId: string | null,
  position: { lat: number; lon: number } | null,
  events: TelemetryEvent[],
): JourneyPosition {
  if (pattern === null || pattern.stops.length === 0) {
    return {
      next: null,
      stops: [],
      passedCount: 0,
      remainingCount: 0,
      complete: false,
    };
  }
  const observedByStop = new Map<string, TelemetryEvent>();
  const announcedByStop = new Map<string, TelemetryEvent>();
  for (const event of events) {
    if (event.stopId === null) continue;
    if (observedByStop.has(event.stopId) === false) {
      observedByStop.set(event.stopId, event);
    }
    if (
      announcedByStop.has(event.stopId) === false &&
      (event.timetableArrival !== null || event.timetableDeparture !== null)
    ) {
      announcedByStop.set(event.stopId, event);
    }
  }
  const nextIndex =
    nextStopId === null
      ? -1
      : pattern.stops.findIndex(
          (stop) => bareStopId(stop.gtfsId) === nextStopId,
        );

  const stops: SpineStop[] = pattern.stops.map((stop, index) => {
    const stopId = bareStopId(stop.gtfsId);
    const isTerminus = index === pattern.stops.length - 1;
    const state: SpineStop["state"] =
      nextIndex < 0
        ? "upcoming"
        : index < nextIndex
          ? "passed"
          : index > nextIndex
            ? "upcoming"
            : isTerminus
              ? // The last stop is both "you are arriving" and the end of the
                // line; marking it terminus keeps the destination visible.
                "terminus"
              : "next";
    const distance =
      index === nextIndex && position !== null
        ? distanceMeters(position, { lat: stop.lat, lon: stop.lon })
        : null;
    return {
      gtfsId: stop.gtfsId,
      stopId,
      name: stop.name,
      index,
      state,
      distanceMeters: distance,
      observed: observedByStop.get(stopId) ?? null,
      announced: announcedByStop.get(stopId) ?? null,
    };
  });

  const next = nextIndex >= 0 ? stops[nextIndex] : null;
  return {
    next,
    stops,
    passedCount: nextIndex >= 0 ? nextIndex : 0,
    remainingCount:
      nextIndex >= 0 ? Math.max(0, stops.length - 1 - nextIndex) : 0,
    complete: nextIndex >= 0,
  };
}

export interface ArrivalEstimate {
  /** The timetable timestamp the estimate is based on, or null. */
  timetableAt: number | null;
  /** `timetable - dl`, when both are known, or null. */
  estimatedAt: number | null;
  /** True when the timetable time used is a departure (`ttdep`). */
  fromDeparture: boolean;
  /** Plain-language description of what the estimate is based on. */
  basis: string;
  /** Age of the reported deviation the estimate used, or null. */
  deviationAgeMs: number | null;
}

/** The estimate for the next stop: the timetable time of the latest observed
 * event for that stop, corrected by the reported `dl` (`actual = timetable -
 * dl`, and `dl` is positive when ahead). The estimate is only as good as the
 * deviation's age, which the caller shows - HFP recomputes `dl` at stop
 * events, so an old value can be minutes out of date. */
export function estimateNextArrival(
  nextStop: SpineStop | null,
  deviation: { dl: number | null; at: number | null },
  now: number,
): ArrivalEstimate {
  if (nextStop === null) {
    return {
      timetableAt: null,
      estimatedAt: null,
      fromDeparture: false,
      basis: "no next stop known",
      deviationAgeMs: null,
    };
  }
  const announced = nextStop.announced;
  if (announced === null) {
    return {
      timetableAt: null,
      estimatedAt: null,
      fromDeparture: false,
      basis:
        nextStop.observed === null
          ? `no message for stop ${nextStop.stopId} yet, and vp carries no timetable time`
          : `the messages for stop ${nextStop.stopId} so far carry no timetable time (only the stop events announce one)`,
      deviationAgeMs: null,
    };
  }
  // A departure event describes the stop the vehicle is leaving, an arrival
  // event the stop it is reaching; the event type decides which timetable
  // field applies, and the spine shows which one was used.
  const fromDeparture = announced.type === "dep" || announced.type === "pde";
  const iso = fromDeparture
    ? (announced.timetableDeparture ?? announced.timetableArrival)
    : (announced.timetableArrival ?? announced.timetableDeparture);
  const timetableAt = iso === null ? NaN : Date.parse(iso);
  const field = fromDeparture ? "ttdep" : "ttarr";
  if (!Number.isFinite(timetableAt)) {
    return {
      timetableAt: null,
      estimatedAt: null,
      fromDeparture,
      basis: `the ${announced.type} event for stop ${nextStop.stopId} carried no usable timetable time`,
      deviationAgeMs: null,
    };
  }
  if (deviation.dl === null || deviation.at === null) {
    return {
      timetableAt,
      estimatedAt: null,
      fromDeparture,
      basis: `${field} known, but the feed reported no schedule deviation`,
      deviationAgeMs: null,
    };
  }
  return {
    timetableAt,
    estimatedAt: timetableAt - deviation.dl * 1000,
    fromDeparture,
    basis: `${field} ${formatClock(timetableAt, false)}, announced by the ${announced.type} event at ${formatClock(announced.at)} and corrected by the reported dl (${deviation.dl > 0 ? "+" : ""}${Math.round(deviation.dl)} s)`,
    deviationAgeMs: now - deviation.at,
  };
}
