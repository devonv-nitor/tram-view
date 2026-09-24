/**
 * React hook that streams live tram positions (decision:
 * Docs/ADR/0002-data-transport.md):
 * 1. load tram line metadata from the keyed routing API (requires the
 *    digitransit API key; a missing key surfaces as a clear error),
 * 2. subscribe to the HFP MQTT tram-position stream (no key needed),
 * 3. deduplicate to the latest position per vehicle, drop vehicles whose
 *    latest position went stale, filter to displayed tram lines, and expose
 *    a snapshot that refreshes every second - producing a new snapshot only
 *    when the displayed data actually changed, so consumers re-render only
 *    on real updates.
 *
 * The stream and the snapshot tick both pause while the tab is hidden: the
 * MQTT subscription is closed, so a hidden tab generates no API traffic
 * (the API-load balance from ADR-0002), and resumes when the tab becomes
 * visible again.
 */
import { useEffect, useRef, useState } from "react";
import {
  loadTramRouteIndex,
  resolveTramShortName,
  type TramPosition,
} from "../lib/digitransit.ts";
import {
  subscribeTramPositions,
  vehicleKey,
  type HfpVehiclePosition,
  type TramStreamHandle,
} from "../lib/hfp.ts";

export const TRAM_SNAPSHOT_INTERVAL_MS = 1000;

/** Vehicles stop publishing on the ongoing-journey topic once their journey
 * ends or they drop out of coverage, so their last position would otherwise
 * sit frozen on the map forever. Drop a vehicle when its latest position is
 * older than this. The value is generous on purpose: it must cover tunnel
 * and GPS gaps, MQTT reconnect backoff (up to 30 s), and a longer hidden-tab
 * pause, while still removing ended journeys quickly enough for a live view
 * (ADR-0002 leaves this cutoff to TV-0005). */
export const POSITION_STALENESS_MS = 5 * 60_000;

export type TramPositionsStatus = "loading" | "connecting" | "live" | "error";

export interface TramPositionsState {
  status: TramPositionsStatus;
  positions: TramPosition[];
  error: Error | null;
  /** Time of the snapshot in `positions`. */
  updatedAt: Date | null;
}

const INITIAL_STATE: TramPositionsState = {
  status: "loading",
  positions: [],
  error: null,
  updatedAt: null,
};

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** True when two snapshots would render identically. Only the fields the UI
 * displays are compared; a speed/heading-only change does not re-render. */
function positionsEqual(a: TramPosition[], b: TramPosition[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.operatorId !== y.operatorId ||
      x.vehicleNumber !== y.vehicleNumber ||
      x.routeShortName !== y.routeShortName ||
      x.lat !== y.lat ||
      x.lon !== y.lon
    ) {
      return false;
    }
  }
  return true;
}

export function useTramPositions(): TramPositionsState {
  const [state, setState] = useState<TramPositionsState>(INITIAL_STATE);
  const [hasRouteIndex, setHasRouteIndex] = useState(false);
  const routeIndexRef = useRef<Map<string, string> | null>(null);
  const latestPositionsRef = useRef(new Map<string, HfpVehiclePosition>());
  const connectedRef = useRef(false);

  // Tram line metadata comes from the keyed routing API; without a key the
  // app shows a clear error instead of silently hiding data.
  useEffect(() => {
    let cancelled = false;
    loadTramRouteIndex()
      .then((index) => {
        if (cancelled) return;
        routeIndexRef.current = index;
        setHasRouteIndex(true);
        setState((prev) => ({ ...prev, status: "connecting", error: null }));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const error = toError(cause);
        console.error("[tram-view] tram line metadata failed:", error.message);
        setState((prev) => ({ ...prev, status: "error", error }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The position stream only starts once the tram-line filter is available;
  // positions cannot be filtered without it. Stream and tick pause together
  // while the tab is hidden.
  useEffect(() => {
    if (!hasRouteIndex) return;

    let stream: TramStreamHandle | null = null;
    let snapshotTimer: number | null = null;

    const takeSnapshot = () => {
      setState((prev) => {
        const index = routeIndexRef.current;
        if (index === null) return prev;
        // Drop vehicles whose latest position went stale (journey ended or
        // the vehicle left coverage); they disappear from the map.
        const now = Date.now();
        for (const [key, position] of latestPositionsRef.current) {
          if (now - position.receivedAt > POSITION_STALENESS_MS) {
            latestPositionsRef.current.delete(key);
          }
        }
        const positions: TramPosition[] = [];
        for (const latest of latestPositionsRef.current.values()) {
          const routeShortName = resolveTramShortName(index, latest.routeId);
          if (routeShortName === null) continue;
          positions.push({ ...latest, routeShortName });
        }
        const connected = connectedRef.current;
        // A dead stream with a known reason stays "error" durably; consumers
        // switching on status alone still see the failure.
        const status: TramPositionsStatus = connected
          ? "live"
          : prev.error !== null
            ? "error"
            : "connecting";
        const error = connected ? null : prev.error;
        // Return prev unchanged when nothing visible changed, so the tick
        // does not re-render consumers on no-op snapshots (~150 vehicles
        // updating ~1/s make this the difference between idle and churn).
        const changed = !positionsEqual(prev.positions, positions);
        if (!changed && status === prev.status && error === prev.error) {
          return prev;
        }
        return {
          status,
          positions,
          error,
          updatedAt:
            changed && positions.length > 0 ? new Date() : prev.updatedAt,
        };
      });
    };

    const start = () => {
      if (stream === null) {
        stream = subscribeTramPositions({
          onPosition: (position) => {
            latestPositionsRef.current.set(vehicleKey(position), position);
          },
          onConnectionChange: (connected) => {
            connectedRef.current = connected;
          },
          onError: (error) => {
            console.error(
              "[tram-view] tram position stream error:",
              error.message,
            );
            setState((prev) => ({ ...prev, status: "error", error }));
          },
        });
      }
      if (snapshotTimer === null) {
        takeSnapshot();
        snapshotTimer = setInterval(takeSnapshot, TRAM_SNAPSHOT_INTERVAL_MS);
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
        connectedRef.current = false;
      }
    };

    // Pause off the API entirely while the tab is hidden: the tick stops and
    // the MQTT subscription closes, so a hidden tab neither re-renders nor
    // pulls feed traffic (the API-load balance from ADR-0002). Resuming
    // reconnects; fresh positions arrive within ~1 s per vehicle and stale
    // ones are dropped by the snapshot above.
    const applyVisibility = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    };
    applyVisibility();
    document.addEventListener("visibilitychange", applyVisibility);

    return () => {
      document.removeEventListener("visibilitychange", applyVisibility);
      stop();
    };
  }, [hasRouteIndex]);

  return state;
}
