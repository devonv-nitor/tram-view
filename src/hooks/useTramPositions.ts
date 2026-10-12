/**
 * React hook that streams live tram positions (decision:
 * Docs/ADR/0002-data-transport.md):
 * 1. load tram line metadata from the keyed routing API (requires the
 *    digitransit API key; a missing key surfaces as a clear error),
 * 2. subscribe to the HFP MQTT tram-position stream (no key needed),
 * 3. deduplicate to the latest position per vehicle, drop vehicles whose
 *    latest position went stale, and resolve each vehicle's line short name -
 *    a vehicle whose route resolves to no displayed tram line (depot
 *    shunting/testing, an absent route) is kept and rendered out of service
 *    (TV-0011), not dropped - and expose
 *    a snapshot that refreshes every second - producing a new snapshot only
 *    when the displayed data actually changed, so consumers re-render only
 *    on real updates.
 *
 * TV-0022: HSL publishes HFP route ids for real service runs that are not
 * GTFS route ids (`1001H6` is a run of line 1H), so a route id that resolves
 * to nothing takes the vehicle's line from the Routing API's own live-trip
 * match instead - red only when the API reports no trip for the vehicle
 * (Docs/ADR/0002-data-transport.md amendment). That map is fetched lazily,
 * while some vehicle's route id does not resolve, and kept fresh on a
 * bounded cadence (see ensureLiveTripsIfNeeded below).
 *
 * TV-0029: the hook opens a **second** subscription, the metro position
 * stream (one more WebSocket, the task's request discipline), and both feeds
 * merge into the one latest-position map and the one snapshot: metro
 * vehicles carry `mode: "metro"` (trams "tram"), their route ids resolve
 * through the same per-session route index (the index gained the metro
 * routes in the same one request - digitransit.ts), and the live-trip match
 * covers them identically because it is asked for the indexed routes'
 * patterns' vehiclePositions. The next-stop precedence is inverted for
 * metro (the topic level is the metro truth; tram keeps payload-first).
 *
 * TV-0029, review round: the status and the error follow the **combined**
 * connection of the two sockets: either connected -> live with error null;
 * neither connected and a stream error recorded -> error with the last
 * reported one; otherwise connecting. So a tram socket that drops while the
 * metro socket is up keeps the strip live (the snapshot IS live - the metro
 * feed is flowing), and a stale error cannot outlive a connected feed.
 * TV-0029, review round 2: the error records are per stream
 * (tramErrorRef/metroErrorRef) and survive every connect/disconnect - only
 * the errored stream's own reconnect or teardown clears one - so the
 * partial-outage chain stays honest: a feed errors while the other keeps
 * the strip live, then the other socket drops without a new error and the
 * strip shows the recorded error, not a blind "connecting".
 * The partial-outage honesty: whichever feed's socket is down while the
 * strip says live on the other, that feed's vehicles age toward the 5-minute
 * staleness cutoff (POSITION_STALENESS_MS) and drop from the snapshot after
 * it - a one-feed outage is visible as its vehicles disappearing, never as
 * a strip error; one console.warn per outage (not per snapshot), emitted by
 * the errored feed's own handler and only while the other socket keeps the
 * strip live, keeps the reason in the console. With metro absent (metro
 * connected never true, metro error never set) the decision is exactly the
 * tram-only world's - and there the tram error IS the strip's error, so the
 * tram-side warn never fires (the warn exists only for the hidden
 * degradation where the other feed keeps the strip live).
 * One tram-only difference worth naming: the tram-only world's error state
 * vanished the moment a snapshot observed the stream connected (the record
 * WAS the displayed error there); here the displayed error is nulled while
 * either socket is connected, and the record itself clears on its own
 * stream's healthy report - a metro-only outage keeps no tram record around
 * to resurrect (its slot is its own).
 *
 * The stream and the snapshot tick both pause while the tab is hidden: the
 * MQTT subscriptions (tram and metro alike) are closed, so a hidden tab
 * generates no API traffic (the API-load balance from ADR-0002), and
 * resumes when the tab becomes visible again.
 */
import { useEffect, useRef, useState } from "react";
import {
  ensureLiveTramTrips,
  loadTramRouteIndex,
  resolveLiveTramTrip,
  resolveTramShortName,
  type TramPosition,
} from "../lib/digitransit.ts";
import {
  subscribeMetroPositions,
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
 * displays are compared; a speed-only change does not re-render (a moving
 * vehicle updates anyway through lat/lon, and a stopped one reports 0).
 * Heading is displayed on the map icons (TV-0008), so a heading-only change
 * with an otherwise frozen position - e.g. a tram reversing at a terminal
 * layover - must re-render so the icon follows. TV-0023: the marker popup
 * displays doors, schedule deviation, next stop, and headsign, so a change
 * in any of them with an otherwise frozen position - the common case of a
 * tram opening its doors at a stop - must re-render for the open popup to
 * refresh (TramMarkerLayer.update refreshes it only when the snapshot
 * changes). */
function positionsEqual(a: TramPosition[], b: TramPosition[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.operatorId !== y.operatorId ||
      x.vehicleNumber !== y.vehicleNumber ||
      x.mode !== y.mode ||
      x.routeShortName !== y.routeShortName ||
      x.lat !== y.lat ||
      x.lon !== y.lon ||
      x.heading !== y.heading ||
      x.doorState !== y.doorState ||
      x.scheduleDeviation !== y.scheduleDeviation ||
      x.nextStopId !== y.nextStopId ||
      x.headsign !== y.headsign
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
  /** TV-0029: the metro socket's connection state, kept beside the tram
   * one. The snapshot's status decision reads both (live when either is
   * connected); stop() resets it like the tram's. */
  const metroLiveRef = useRef(false);
  /** TV-0029, review round 2: each stream's own last reported error - a
   * per-stream record, not one shared slot. A slot is set by that stream's
   * onError and cleared ONLY by that same stream's next connection-change to
   * connected (the stream reporting itself healthy again) or by teardown -
   * never by the OTHER stream's connection state, never by the snapshot
   * tick, never by a connected ref alone. The record therefore survives
   * connects and disconnects; only the status derivation (see
   * applyConnectionStatus and takeSnapshot) consults it. This keeps the
   * partial-outage chain honest: a feed errors while the other keeps the
   * strip live, then the other socket drops WITHOUT reporting a new error
   * and the strip still shows the recorded error instead of flipping to a
   * blind "connecting". With metro absent (metro slot never set, metro
   * connected never true) the behavior is exactly the tram-only world's:
   * the tram slot is the single record and it is cleared when the tram
   * stream reports connected - the same place the tram-only world's error
   * state vanished. */
  const tramErrorRef = useRef<Error | null>(null);
  const metroErrorRef = useRef<Error | null>(null);
  /** Which stream reported the most recent error (null while neither has
   * ever reported one). A later error from one stream does NOT clear the
   * other stream's record (review round 2: the records are per stream and
   * survive everything except their own stream's recovery or teardown) -
   * this marker only picks which record the "neither connected" error
   * state shows first: the last reported error is the one whose reason the
   * user most plausibly cares about. */
  const lastErroredStreamRef = useRef<"tram" | "metro" | null>(null);
  /** TV-0029, review round: one warn per partial outage, symmetric for the
   * two feeds. Each ref is set once per outage while the OTHER socket keeps
   * the strip live (a metro error with tram connected, or a tram error with
   * metro connected), so the console.warn about that feed's markers aging
   * out fires once, not per snapshot; each ref resets when its own socket
   * next reports connected and on teardown. The warn exists only for the
   * hidden-degradation case - when neither socket is connected the strip
   * itself shows the error state, so no warn is needed (with metro absent
   * the tram warn never fires: the tram error is the strip's error there). */
  const tramOutageWarnedRef = useRef(false);
  const metroOutageWarnedRef = useRef(false);

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

    const streamState: {
      tram: TramStreamHandle | null;
      metro: TramStreamHandle | null;
    } = {
      tram: null,
      metro: null,
    };
    let snapshotTimer: number | null = null;

    /** TV-0022: the Routing API's live-trip match is the only other source of
     * a line, and it is only ever needed when some vehicle's own route id does
     * not resolve - so it is asked for only then. `ensureLiveTramTrips` is a
     * no-op while the last attempt is fresh or one is in flight, so calling it
     * from every snapshot means at most one request per
     * `LIVE_TRAM_TRIPS_MAX_AGE_MS` and none at all while every route id
     * resolves. A failure changes nothing on screen (those vehicles keep their
     * red dot, which is exactly the TV-0011 state they were in) and is logged
     * once per attempt. */
    const ensureLiveTripsIfNeeded = () => {
      const index = routeIndexRef.current;
      if (index === null) return;
      let unresolved = false;
      for (const latest of latestPositionsRef.current.values()) {
        if (resolveTramShortName(index, latest.routeId) === null) {
          unresolved = true;
          break;
        }
      }
      if (!unresolved) return;
      void ensureLiveTramTrips().catch((cause: unknown) => {
        console.error(
          "[tram-view] live tram trips failed:",
          toError(cause).message,
        );
      });
    };

    /** TV-0029, review round 2: the error the combined derivation shows
     * when neither socket is connected - the most recently reported
     * stream's record, falling back to the other stream's when the last
     * reporter has since reported healthy (its own slot cleared) while the
     * other still carries its error. null when neither slot holds a record
     * (the "connecting" case - no feed has ever reported an error, or both
     * recovered). Not the state's `error` field by itself: while either
     * socket is connected the displayed error is null regardless (see
     * applyConnectionStatus and takeSnapshot) - the record only surfaces
     * when both are down. */
    const recordedStreamError = (): Error | null => {
      if (lastErroredStreamRef.current === "tram") {
        return tramErrorRef.current ?? metroErrorRef.current;
      }
      if (lastErroredStreamRef.current === "metro") {
        return metroErrorRef.current ?? tramErrorRef.current;
      }
      return null;
    };

    /** TV-0029, review round: the status and the error follow the
     * **combined** connection of the two sockets, so they stay one decision
     * and the strip never shows an error under a "live" status:
     * - either socket connected -> "live", error null (the error RECORDS
     *   stay as they are - only the displayed error is nulled; a record is
     *   cleared when its own stream reports connected, see the handlers);
     * - neither connected, at least one stream has a recorded error ->
     *   "error" with the last reported one (later errors overwrite their
     *   stream's slot; both slots non-null shows the most recent);
     * - otherwise -> "connecting" (no record anywhere - e.g. the sockets
     *   are simply still dialing, or both streams reported healthy since
     *   their last errors).
     * The tram-only path is exactly the tram-only world's: with metro
     * absent the metro ref never goes true and the metro slot never fills,
     * so the decision collapses to
     * `connected ? "live" : tramError !== null ? "error" : "connecting"`.
     * Called from the stream error handlers (immediate, as the old world
     * applied its error) and from the snapshot tick (the live/connecting
     * transitions still ride the tick, as before). `errored` names the
     * stream whose error is being applied: that socket's connection state
     * is treated as down for this decision, because mqtt.ts reports an
     * error before the close that follows it - the tram-only world applied
     * its error unconditionally at that instant, and a "still connected"
     * ref must not swallow it (the ref is stale for the moment the error
     * fires; the close handler corrects it within the same task). */
    const applyConnectionStatus = (errored: "tram" | "metro" | null) => {
      const tramConnected = errored === "tram" ? false : connectedRef.current;
      const metroConnected = errored === "metro" ? false : metroLiveRef.current;
      if (tramConnected || metroConnected) {
        setState((prev) =>
          prev.status === "live" && prev.error === null
            ? prev
            : { ...prev, status: "live", error: null },
        );
        return;
      }
      const error = recordedStreamError();
      setState((prev) => {
        const status: TramPositionsStatus =
          error !== null ? "error" : "connecting";
        if (prev.status === status && prev.error === error) return prev;
        return { ...prev, status, error };
      });
    };

    const takeSnapshot = () => {
      ensureLiveTripsIfNeeded();
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
        for (const [key, latest] of latestPositionsRef.current) {
          // TV-0011: a vehicle whose route resolves to no displayed tram line
          // (depot shunting/testing, absent routes like 1009TX) stays in the
          // snapshot with routeShortName null and renders out of service
          // (red dot, TV-0009 category color kept) instead of being dropped.
          // Vehicles whose latest position went stale are dropped above, so
          // TV-0005's disappearance behavior is unchanged.
          // TV-0022: the line then comes from the Routing API's live-trip
          // match for this vehicle (keyed by the same `vehicleKey` identity
          // the snapshot map uses), and stays null - the red dot - when the
          // API reports no live trip for it.
          positions.push({
            ...latest,
            routeShortName:
              resolveTramShortName(index, latest.routeId) ??
              resolveLiveTramTrip(key).routeShortName,
            // TV-0023: map HFP fields to TramPosition fields.
            doorState:
              latest.drst === null
                ? null
                : (latest.drst & 1) !== 0
                  ? "open"
                  : "closed",
            headsign: latest.headsign,
            // TV-0029: the next-stop precedence is per mode: tram prefers
            // the payload's stop field (the two sources agreed in every
            // sampled tram position); metro inverts it - the topic's
            // level-13 id is the metro truth (measured 2026-10-12: present
            // on 100% of metro vp topics, the payload stop is null in ~56%
            // of messages, and the disagreements never resolved within a
            // 60 s window - the topic level leads the payload by one stop
            // event).
            nextStopId:
              latest.mode === "metro"
                ? (latest.topicNextStopId ??
                  (latest.stop !== null ? String(latest.stop) : null))
                : latest.stop !== null
                  ? String(latest.stop)
                  : (latest.topicNextStopId ?? null),
            scheduleDeviation: latest.dl,
            mode: latest.mode,
          });
        }
        const connected = connectedRef.current;
        const metroLive = metroLiveRef.current;
        // TV-0029, review round: the status/error follow the combined
        // connection (see applyConnectionStatus - same decision, evaluated
        // on the tick so transitions ride it as they always have). Either
        // socket connected is live with no displayed error; neither is
        // error with the recorded stream error, else connecting. The
        // records themselves are NOT touched here (review round 2): a tick
        // observes connection state, it does not report stream health -
        // clearing on a connected observation was the round-1 bug that
        // turned a real failure into a blind "connecting" when the other
        // socket later dropped without a new error callback. A
        // tram-only session (metro ref false, metro slot never set) yields
        // exactly the tram-only world's decision.
        const status: TramPositionsStatus =
          connected || metroLive
            ? "live"
            : recordedStreamError() !== null
              ? "error"
              : "connecting";
        const error = connected || metroLive ? null : recordedStreamError();
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
      if (streamState.tram === null) {
        // The client reports a socket error even when we closed it on purpose
        // (the broker's close frame races ours), so a stream we closed must not
        // log or show anything. The flag is scoped to this one stream, not to
        // the effect: a flapping tab can close and replace the stream inside one
        // effect run, and a late error from the old socket must not be reported
        // as a failure of the new one.
        let closed = false;
        const handle = subscribeTramPositions({
          onPosition: (position) => {
            latestPositionsRef.current.set(vehicleKey(position), position);
          },
          onConnectionChange: (connected) => {
            connectedRef.current = connected;
            // TV-0029, review round 2: the tram stream reporting itself
            // healthy again clears its OWN error record (the only places a
            // record clears are its stream's reconnect and teardown) - the
            // state's error follows on the next tick, as before.
            if (connected) {
              tramErrorRef.current = null;
              // A healthy tram report ends the current outage (so a later
              // outage warns once again), like the metro handler below.
              tramOutageWarnedRef.current = false;
            }
            // No immediate status application here - the tram-only world
            // recomputed live/connecting on the next snapshot tick, and the
            // tick below still does (applyConnectionStatus runs only from
            // onError, where the old world applied the error immediately).
          },
          onError: (error) => {
            if (closed) return;
            console.error(
              "[tram-view] tram position stream error:",
              error.message,
            );
            // TV-0029, review round 2: the error is recorded in the tram
            // stream's own slot - the record survives connects/disconnects
            // of either socket and is consulted only by the combined status
            // derivation (applyConnectionStatus / takeSnapshot). The
            // immediate application is kept: `errored: "tram"` treats the
            // tram ref as down for this decision (the error arrives before
            // the close that follows it), matching the old world's
            // unconditional error application.
            tramErrorRef.current = error;
            lastErroredStreamRef.current = "tram";
            applyConnectionStatus("tram");
            // TV-0029, review round 3: partial-outage honesty, symmetric
            // with the metro handler below - while the metro socket keeps
            // the strip live, the tram feed's vehicles age toward the 5-min
            // staleness cutoff and then drop from the snapshot
            // (POSITION_STALENESS_MS). Warn once per outage, only when the
            // strip really is staying live on the metro feed - when neither
            // socket is connected the strip itself shows the error state
            // (the tram-only world included, where the tram error is the
            // strip's error), so no warn is needed there; the flag resets
            // on the next successful tram connection.
            if (metroLiveRef.current && !tramOutageWarnedRef.current) {
              tramOutageWarnedRef.current = true;
              console.warn(
                "[tram-view] tram stream outage: the strip stays live on the metro feed, tram markers age out after",
                `${POSITION_STALENESS_MS / 60_000} min without tram positions`,
              );
            }
          },
        });
        // TV-0029: the two streams' shared plumbing. Each handle owns its
        // `closed` flag (the tram comment above still applies per stream: a
        // flapping tab can close and replace one stream inside one effect
        // run, and a late error from an old socket must not be reported as
        // the new one's failure). TV-0029, review round: either stream's
        // error counts into the combined status (applyConnectionStatus) -
        // the strip errors only when NEITHER socket is connected, and the
        // down feed's markers age out after POSITION_STALENESS_MS (each
        // handler below warns once per outage about exactly that).
        streamState.tram = {
          close: () => {
            closed = true;
            handle.close();
          },
        };
      }
      if (streamState.metro === null) {
        // The same closed-flag scoping as the tram stream above, per stream.
        let closed = false;
        const handle = subscribeMetroPositions({
          onPosition: (position) => {
            latestPositionsRef.current.set(vehicleKey(position), position);
          },
          onConnectionChange: (connected) => {
            // TV-0029: metro's connection state does not gate the tram
            // status - the two sockets connect independently, and the
            // snapshot's status decision below reads both. TV-0029, review
            // round 2: the metro stream reporting itself healthy clears its
            // OWN error record (the same per-stream rule as the tram
            // stream's above) - the state's error follows on the next tick.
            metroLiveRef.current = connected;
            // A healthy metro report clears this stream's own error record
            // (the per-stream rule, review round 2) and ends the current
            // outage (so a later outage warns once again).
            if (connected) {
              metroErrorRef.current = null;
              metroOutageWarnedRef.current = false;
            }
            // No immediate application here either - both streams' connection
            // changes ride the same next-tick recomputation; the 1 s tick is
            // the shared timing contract for status flips.
          },
          onError: (error) => {
            if (closed) return;
            console.error(
              "[tram-view] metro position stream error:",
              error.message,
            );
            // TV-0029, review round 2: the error is recorded in the metro
            // stream's own slot, exactly like the tram handler above - the
            // record survives either socket's connect/disconnect and is
            // consulted only by the combined status derivation; if neither
            // socket is connected the strip shows it, while the tram socket
            // stays up the strip stays live (either-socket semantics).
            // The immediate application is kept: `errored: "metro"` treats
            // the metro ref as down for this decision (the error arrives
            // before the close that follows it).
            metroErrorRef.current = error;
            lastErroredStreamRef.current = "metro";
            applyConnectionStatus("metro");
            // TV-0029, review round: partial-outage honesty - while the tram
            // socket keeps the strip live, the metro feed's vehicles age
            // toward the 5-min staleness cutoff and then drop from the
            // snapshot (POSITION_STALENESS_MS; the tram feed's vehicles age
            // out the same way when it is the down one). Warn once per
            // outage, only when the strip really is staying live on the
            // tram feed - when neither socket is connected the strip itself
            // shows the error, so no warn is needed; the flag resets on the
            // next successful metro connection. Review round 3: the tram
            // handler above is the mirror image of this block, so an outage
            // of either feed warns once while the other keeps the strip
            // live.
            if (connectedRef.current && !metroOutageWarnedRef.current) {
              metroOutageWarnedRef.current = true;
              console.warn(
                "[tram-view] metro stream outage: the strip stays live on the tram feed, metro markers age out after",
                `${POSITION_STALENESS_MS / 60_000} min without metro positions`,
              );
            }
          },
        });
        streamState.metro = {
          close: () => {
            closed = true;
            handle.close();
          },
        };
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
      if (streamState.tram !== null) {
        streamState.tram.close();
        streamState.tram = null;
        connectedRef.current = false;
        // Review round 2: teardown clears the tram stream's error record -
        // a stream that is gone can never report healthy again, so a record
        // left behind would wrongly error a later start() before anything
        // has actually failed. Fresh socket, fresh record.
        tramErrorRef.current = null;
        lastErroredStreamRef.current = null;
        // The outage warn flag belongs to one stream's lifetime; a fresh
        // tram stream warns once again if it fails again.
        tramOutageWarnedRef.current = false;
      }
      if (streamState.metro !== null) {
        streamState.metro.close();
        streamState.metro = null;
        metroLiveRef.current = false;
        // Teardown clears the metro stream's error record too (same reason
        // as the tram's above); lastErroredStreamRef is already null when
        // only the metro stream tears down after the tram's nulling, so
        // setting it again is harmless and keeps the rule symmetric.
        metroErrorRef.current = null;
        lastErroredStreamRef.current = null;
        // The outage warn flag belongs to one stream's lifetime; a fresh
        // metro stream warns once again if it fails again.
        metroOutageWarnedRef.current = false;
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
