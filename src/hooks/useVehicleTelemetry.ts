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
  loadTripPattern,
  resolveTramShortName,
  type TripPattern,
} from "../lib/digitransit.ts";
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
  /** The stop-sequence query's outcome together with the (route, direction)
   * it belongs to, so loading is *derived* from "no result for this key yet"
   * instead of being set from inside an effect. */
  const [patternResult, setPatternResult] = useState<{
    key: string;
    pattern: TripPattern | null;
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
    // True while the current stream is being closed on purpose (page unmount,
    // hidden tab): the client reports socket errors regardless of a deliberate
    // close (the broker's close frame races ours), and that late error is not a
    // stream failure to log or show.
    let streamClosed = false;

    const publish = () => {
      setRetained(accumulatedRef.current);
      setNow(Date.now());
    };

    const start = () => {
      if (stream === null) {
        streamClosed = false;
        stream = subscribeVehicleEvents(operatorId, vehicleNumber, {
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
            if (streamClosed) return;
            console.error("[tram-view] vehicle stream error:", cause.message);
            setError(cause);
          },
        });
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
        streamClosed = true;
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

  // The spine's stop sequence: one query per (route, direction) per session,
  // issued as soon as the stream tells us which journey this is (and again if
  // the vehicle changes line or direction). A failure never blocks the
  // telemetry - it is shown as an unavailable stop sequence.
  const routeId = retained.telemetry?.routeId ?? null;
  const direction = retained.telemetry?.directionId ?? null;
  const patternKey =
    routeId === null || direction === null ? null : `${routeId}/${direction}`;
  useEffect(() => {
    if (patternKey === null) return;
    const key = patternKey;
    let cancelled = false;
    loadTripPattern(key.split("/")[0], key.split("/")[1])
      .then((loaded) => {
        if (cancelled) return;
        setPatternResult({ key, pattern: loaded, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const failure = toError(cause);
        console.error("[tram-view] trip pattern failed:", failure.message);
        setPatternResult({ key, pattern: null, error: failure });
      });
    return () => {
      cancelled = true;
    };
  }, [patternKey]);

  // Loading is the absence of a result for the current key; a result for a
  // previous key (the vehicle changed line) is not shown at all.
  const current =
    patternResult !== null && patternResult.key === patternKey
      ? patternResult
      : null;
  const pattern = current?.pattern ?? null;
  const patternError = current?.error ?? null;
  const patternStatus: PatternStatus =
    patternKey === null
      ? "idle"
      : current === null
        ? "loading"
        : current.error !== null
          ? "error"
          : current.pattern === null
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
    topicFilter,
    now,
  };
}
