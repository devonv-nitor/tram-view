/**
 * TV-0017: the vehicle overview's one data client
 * (Docs/ADR/0002-data-transport.md amendment). While this page is mounted it
 * subscribes to **one** vehicle-scoped HFP filter; the network-wide position
 * stream the map page owns is not open at the same time, because exactly one
 * page is mounted at a time (see App).
 *
 * It mirrors the map page's client behaviour deliberately:
 * - the per-session tram-line index is the same cached query, so the
 *   out-of-service rule (TV-0011) resolves identically;
 * - the stream and the snapshot tick both pause while the tab is hidden, so a
 *   hidden tab generates no API traffic;
 * - event folding happens off-render (in the stream handler) and the rendered
 *   snapshot is published once a second, which is also what refreshes the
 *   relative times and countdowns the page shows.
 *
 * Where it differs is on purpose: the map drops a stale vehicle, this page
 * keeps showing the last known values and marks them stale, because the user
 * picked this vehicle explicitly.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadTramRouteIndex,
  loadRoutePatterns,
  resolveTramShortName,
  type TripPattern,
} from "../lib/digitransit.ts";
import {
  liveVehicleId,
  selectTripPattern,
  type PatternSelection,
} from "../lib/journey.ts";
import {
  subscribeVehicleEvents,
  vehicleTopicFilter,
  type HfpVehicleEvent,
  type TramStreamHandle,
} from "../lib/hfp.ts";
import {
  applyVehicleEvent,
  createVehicleTelemetry,
  distinctMessageCount,
  isStale,
  type DlSample,
  type TelemetryEvent,
  type VehicleTelemetry,
} from "../lib/vehicleTelemetry.ts";
import { TRAM_SNAPSHOT_INTERVAL_MS } from "./useTramPositions.ts";

export type VehicleTelemetryStatus = "connecting" | "live" | "error";

export type PatternStatus = "idle" | "loading" | "ready" | "missing" | "error";

/** What the overview renders. Every field is React state - the hook never
 * reads a ref during render - and `now` is the snapshot time, so all relative
 * times and countdowns within one render agree. */
export interface VehicleTelemetryView {
  /** The identity the route named; every event carries it too, which is what
   * makes a mismatch visible. */
  operatorId: number;
  vehicleNumber: number;
  status: VehicleTelemetryStatus;
  error: Error | null;
  /** Retained state as of the last snapshot. */
  retained: VehicleTelemetry;
  /** Latest `vp` event, or null before the first one. */
  telemetry: HfpVehicleEvent | null;
  telemetryAt: number | null;
  stale: boolean;
  lastEvent: HfpVehicleEvent | null;
  events: TelemetryEvent[];
  dlSamples: DlSample[];
  doors: VehicleTelemetry["doors"];
  tlp: VehicleTelemetry["tlp"];
  nextStopId: string | null;
  /** Raw messages received this session. */
  messageCount: number;
  /** Distinct messages (raw minus the broker's byte-identical repeats). */
  distinctCount: number;
  /** Raw messages that were byte-identical repeats of one already received. */
  duplicateCount: number;
  unknownEventCount: number;
  /** The line short name the map page would show, or null for a vehicle whose
   * route resolves to no displayed tram line (out of service, TV-0011). */
  routeShortName: string | null;
  /** False until the per-session line index has loaded. */
  routeIndexLoaded: boolean;
  pattern: TripPattern | null;
  patternStatus: PatternStatus;
  patternError: Error | null;
  /** TV-0020: how the pattern was chosen (exact live trip vs which filters
   * narrowed the inference), so the UI can label an inferred choice. */
  patternSelection: PatternSelection;
  /** The subscription this page opened, shown in the readout. */
  topicFilter: string;
  /** Snapshot time. */
  now: number;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export function useVehicleTelemetry(
  operatorId: number,
  vehicleNumber: number,
): VehicleTelemetryView {
  // The accumulator is written only from the stream handler and the tick, and
  // `applyVehicleEvent` returns a new object, so the published snapshot is
  // never mutated afterwards.
  const accumulatedRef = useRef<VehicleTelemetry>(createVehicleTelemetry());
  const [retained, setRetained] = useState<VehicleTelemetry>(
    createVehicleTelemetry,
  );
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [routeIndex, setRouteIndex] = useState<Map<string, string> | null>(
    null,
  );
  /** The route-patterns query's outcome together with the route it belongs
   * to, so loading is *derived* from "no result for this route yet" instead
   * of being set from inside an effect. One result covers every pattern of
   * the route; which one is shown is selected per vehicle (TV-0020). */
  const [patternResult, setPatternResult] = useState<{
    routeId: string;
    patterns: TripPattern[];
    error: Error | null;
  } | null>(null);

  const topicFilter = useMemo(
    () => vehicleTopicFilter(operatorId, vehicleNumber),
    [operatorId, vehicleNumber],
  );

  // The line index is the map page's cached per-session query, reused (not
  // re-issued) so out-of-service resolves the same way here.
  useEffect(() => {
    let cancelled = false;
    loadTramRouteIndex()
      .then((index) => {
        if (cancelled) return;
        setRouteIndex(index);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const failure = toError(cause);
        console.error(
          "[tram-view] tram line metadata failed:",
          failure.message,
        );
        setError(failure);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The vehicle-scoped stream: every event type of this one vehicle on a
  // single filter, paused (subscription closed) while the tab is hidden.
  useEffect(() => {
    let stream: TramStreamHandle | null = null;
    let snapshotTimer: number | null = null;

    const publish = () => {
      setRetained(accumulatedRef.current);
      setNow(Date.now());
    };

    const start = () => {
      if (stream === null) {
        // The client reports a socket error even when we closed it on purpose
        // (the broker's close frame races ours), so a stream we closed must not
        // log or show anything. The flag is scoped to this one stream, not to
        // the effect: a flapping tab can close and replace the stream inside one
        // effect run, and a late error from the old socket must not be reported
        // as a failure of the new one.
        let closed = false;
        const handle = subscribeVehicleEvents(operatorId, vehicleNumber, {
          onEvent: (event) => {
            accumulatedRef.current = applyVehicleEvent(
              accumulatedRef.current,
              event,
            );
          },
          onConnectionChange: (isConnected) => {
            setConnected(isConnected);
            if (isConnected) setError(null);
          },
          onError: (cause) => {
            if (closed) return;
            console.error("[tram-view] vehicle stream error:", cause.message);
            setError(cause);
          },
        });
        stream = {
          close: () => {
            closed = true;
            handle.close();
          },
        };
      }
      if (snapshotTimer === null) {
        publish();
        snapshotTimer = setInterval(publish, TRAM_SNAPSHOT_INTERVAL_MS);
      }
    };

    const stop = () => {
      if (snapshotTimer !== null) {
        clearInterval(snapshotTimer);
        snapshotTimer = null;
      }
      if (stream !== null) {
        stream.close();
        stream = null;
        setConnected(false);
      }
    };

    const applyVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    applyVisibility();
    document.addEventListener("visibilitychange", applyVisibility);
    return () => {
      document.removeEventListener("visibilitychange", applyVisibility);
      stop();
    };
  }, [operatorId, vehicleNumber]);

  // The spine's stop sequence: one query per route per session, issued as
  // soon as the stream tells us which route this journey is on (and again if
  // the vehicle changes line). A failure never blocks the telemetry - it is
  // shown as an unavailable stop sequence.
  const routeId = retained.telemetry?.routeId ?? null;
  useEffect(() => {
    if (routeId === null) return;
    let cancelled = false;
    loadRoutePatterns(routeId)
      .then((patterns) => {
        if (cancelled) return;
        setPatternResult({ routeId, patterns, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const failure = toError(cause);
        console.error("[tram-view] route patterns failed:", failure.message);
        setPatternResult({ routeId, patterns: [], error: failure });
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // Loading is the absence of a result for the current route; a result for a
  // previous route (the vehicle changed line) is not shown at all.
  const current =
    patternResult !== null && patternResult.routeId === routeId
      ? patternResult
      : null;
  const patternError = current?.error ?? null;

  // TV-0020: which of those patterns **this vehicle** is on. The choice is
  // recomputed as the stream arrives (the topic's direction/headsign and the
  // reported next stop are the fallback's inputs); the live-trip match does
  // not depend on any of them.
  const patternSelection = useMemo(
    () =>
      selectTripPattern(current?.patterns ?? [], {
        direction: retained.telemetry?.directionId ?? null,
        headsign: retained.telemetry?.topic.headsign ?? null,
        nextStopId: retained.nextStopId,
        vehicleId: liveVehicleId(operatorId, vehicleNumber),
      }),
    [
      current,
      retained.telemetry,
      retained.nextStopId,
      operatorId,
      vehicleNumber,
    ],
  );
  const pattern = patternSelection.pattern;
  const patternStatus: PatternStatus =
    routeId === null
      ? "idle"
      : current === null
        ? "loading"
        : current.error !== null
          ? "error"
          : pattern === null
            ? "missing"
            : "ready";

  const telemetry = retained.telemetry;
  const status: VehicleTelemetryStatus = connected
    ? "live"
    : error !== null
      ? "error"
      : "connecting";

  return {
    operatorId,
    vehicleNumber,
    status,
    error,
    retained,
    telemetry,
    telemetryAt: retained.telemetryAt,
    stale: isStale(retained.telemetryAt, now),
    lastEvent: retained.lastEvent,
    events: retained.events,
    dlSamples: retained.dlSamples,
    doors: retained.doors,
    tlp: retained.tlp,
    nextStopId: retained.nextStopId,
    messageCount: retained.messageCount,
    duplicateCount: retained.duplicateCount,
    distinctCount: distinctMessageCount(retained),
    unknownEventCount: retained.unknownEventCount,
    routeShortName:
      routeIndex === null || telemetry === null
        ? null
        : resolveTramShortName(routeIndex, telemetry.routeId),
    routeIndexLoaded: routeIndex !== null,
    pattern,
    patternStatus,
    patternError,
    patternSelection,
    topicFilter,
    now,
  };
}
