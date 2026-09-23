/**
 * React hook that streams live tram positions (decision:
 * Docs/ADR/0002-data-transport.md):
 * 1. load tram line metadata from the keyed routing API (requires the
 *    digitransit API key; a missing key surfaces as a clear error),
 * 2. subscribe to the HFP MQTT tram-position stream (no key needed),
 * 3. deduplicate to the latest position per vehicle, filter to displayed
 *    tram lines, and expose a snapshot that refreshes every second.
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
} from "../lib/hfp.ts";

export const TRAM_SNAPSHOT_INTERVAL_MS = 1000;

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
  // positions cannot be filtered without it.
  useEffect(() => {
    if (!hasRouteIndex) return;
    const stream = subscribeTramPositions({
      onPosition: (position) => {
        latestPositionsRef.current.set(vehicleKey(position), position);
      },
      onConnectionChange: (connected) => {
        connectedRef.current = connected;
      },
      onError: (error) => {
        console.error("[tram-view] tram position stream error:", error.message);
        setState((prev) => ({ ...prev, status: "error", error }));
      },
    });
    const snapshotTimer = setInterval(() => {
      const index = routeIndexRef.current;
      if (index === null) return;
      const positions: TramPosition[] = [];
      for (const latest of latestPositionsRef.current.values()) {
        const routeShortName = resolveTramShortName(index, latest.routeId);
        if (routeShortName === null) continue;
        positions.push({ ...latest, routeShortName });
      }
      const connected = connectedRef.current;
      setState((prev) => ({
        ...prev,
        // A dead stream with a known reason stays "error" durably; consumers
        // switching on status alone still see the failure.
        status: connected
          ? "live"
          : prev.error !== null
            ? "error"
            : "connecting",
        positions,
        updatedAt: positions.length > 0 ? new Date() : prev.updatedAt,
        error: connected ? null : prev.error,
      }));
      console.log(
        `[tram-view] ${positions.length} tram positions (latest per vehicle)`,
      );
    }, TRAM_SNAPSHOT_INTERVAL_MS);
    return () => {
      stream.close();
      clearInterval(snapshotTimer);
    };
  }, [hasRouteIndex]);

  return state;
}
