/**
 * TV-0017: the retained per-vehicle state behind the overview page
 * (Docs/ADR/0002-data-transport.md amendment). Pure, framework-free
 * bookkeeping over the one vehicle-scoped HFP stream: the latest telemetry,
 * the door state, the pending traffic-light-priority request and its
 * decision, a bounded event log, and a bounded schedule-deviation window.
 *
 * Everything here is session-scoped and in memory: the bounds below are the
 * ADR's, and nothing is persisted. The map page's own retention (one latest
 * position per vehicle, dropped after POSITION_STALENESS_MS) is untouched -
 * on this page a stale vehicle is shown as stale, never dropped, because the
 * user picked it explicitly.
 */
import type { HfpVehicleEvent, TlpDecision, TlpRequest } from "./hfp.ts";

/** Rolling event log bound (ADR-0002 amendment). */
export const VEHICLE_EVENT_LIMIT = 200;

/** Schedule-deviation sample window (ADR-0002 amendment). */
export const DL_WINDOW_MS = 15 * 60_000;

/** Bound on the message identities retained for duplicate collapsing. The
 * broker repeats a message by name within milliseconds, so a small window is
 * enough; it is bounded anyway so a long session cannot grow it. */
export const DUPLICATE_WINDOW = 400;

/** Staleness budget for the overview: `vp` arrives about once per second per
 * vehicle, so after this long without one the shown telemetry is marked stale
 * and the last known values stay (ADR-0002 amendment). */
export const VEHICLE_STALENESS_MS = 15_000;

/** Event types that describe a stop the vehicle is at. */
const STOP_EVENT_TYPES = ["due", "arr", "ars", "dep", "pde", "pas"] as const;

/** One row of the overview's event log: the event as received plus what the
 * overview can say about it without inventing anything. */
export interface TelemetryEvent {
  /** Event type from the topic. */
  type: string;
  /** The vehicle-reported event time (`tst`, epoch ms) - the timestamp HFP
   * publishes, not the browser's receipt clock. */
  at: number;
  /** Stop id the event refers to (`stop` from the payload, else the topic's
   * next-stop level), or null. The stop *name* is resolved at render time
   * from the trip pattern, so retention never guesses one. */
  stopId: string | null;
  /** Schedule deviation reported by this event, or null. */
  dl: number | null;
  /** Speed in m/s, or null. */
  speed: number | null;
  /** Door state as reported, or null. */
  drst: number | null;
  /** Timetable arrival/departure for this event's stop, when the event type
   * carries them (`ttarr`/`ttdep`); null otherwise. */
  timetableArrival: string | null;
  timetableDeparture: string | null;
  /** Priority request type (`tlr`) or decision (`tla`), or null. */
  tlpRequestType: string | null;
  tlpDecision: string | null;
  tlpRequestId: number | null;
}

/** One schedule-deviation sample for the trend chart. */
export interface DlSample {
  at: number;
  dl: number;
}

/** Door state: the reported bit plus the last open/close events, which say
 * *when* the doors moved rather than only what the bit says now. */
export interface DoorState {
  /** Bit 0 of the last reported `drst`, or null before any report. */
  open: boolean | null;
  drst: number | null;
  /** Receipt time of the last `doo` (doors opened), or null. */
  lastOpenedAt: number | null;
  /** Receipt time of the last `doc` (doors closed), or null. */
  lastClosedAt: number | null;
  lastChangedAt: number | null;
}

/** Traffic-light-priority state: the latest request and the latest decision,
 * kept as separate observations because the decision acknowledges a request
 * by id - pairing them is a display concern and must stay visible. */
export interface TlpState {
  request: TlpRequest | null;
  /** Request id of the latest request, echoed for pairing. */
  requestId: number | null;
  requestAt: number | null;
  decision: TlpDecision | null;
  decisionAt: number | null;
}

export interface VehicleTelemetry {
  /** Latest `vp` event (the position/telemetry stream). */
  telemetry: HfpVehicleEvent | null;
  /** Latest event of any type. */
  lastEvent: HfpVehicleEvent | null;
  /** Latest `vp` time (epoch ms), or null. */
  telemetryAt: number | null;
  /** Newest first, at most VEHICLE_EVENT_LIMIT entries. */
  events: TelemetryEvent[];
  /** Oldest first, only samples inside DL_WINDOW_MS. */
  dlSamples: DlSample[];
  doors: DoorState;
  tlp: TlpState;
  /** Next stop id: the payload's `stop` when present (about half of `vp`
   * messages), else the topic's next-stop level, else null. */
  nextStopId: string | null;
  /** Raw messages received in this session, for the debug readout. */
  messageCount: number;
  /** How many of those raw messages were byte-identical repeats of a message
   * already received. The broker delivers most messages about four times on
   * one subscription (verified live, ADR-0002 amendment), so this is a
   * property of the transport, shown rather than hidden: the event log and the
   * deviation window keep distinct messages only. */
  duplicateCount: number;
  /** Identities of recently received messages (insertion-ordered, so the
   * oldest are evicted at DUPLICATE_WINDOW). */
  recentMessageKeys: Map<string, number>;
  /** Events whose type the overview does not model; their envelope is still
   * retained, and the count is shown rather than hidden. */
  unknownEventCount: number;
}

export function createVehicleTelemetry(): VehicleTelemetry {
  return {
    telemetry: null,
    lastEvent: null,
    telemetryAt: null,
    events: [],
    dlSamples: [],
    doors: {
      open: null,
      drst: null,
      lastOpenedAt: null,
      lastClosedAt: null,
      lastChangedAt: null,
    },
    tlp: {
      request: null,
      requestId: null,
      requestAt: null,
      decision: null,
      decisionAt: null,
    },
    nextStopId: null,
    messageCount: 0,
    duplicateCount: 0,
    recentMessageKeys: new Map(),
    unknownEventCount: 0,
  };
}

/** A message's identity: the topic it was published on, its event type and the
 * vehicle-reported timestamp. The broker's repeats are byte-identical, so this
 * recognises a repeat without comparing whole payloads. */
export function messageIdentity(event: HfpVehicleEvent): string {
  return `${event.rawTopic}|${event.event}|${event.receivedAt}`;
}

/** How many raw messages were distinct (the event log's own size). */
export function distinctMessageCount(state: VehicleTelemetry): number {
  return state.messageCount - state.duplicateCount;
}

/** True when the event type is one of the discrete stop events. */
export function isStopEvent(type: string): boolean {
  return (STOP_EVENT_TYPES as readonly string[]).includes(type);
}

/** The stop id an event refers to: the payload's `stop` when present, else
 * the topic's next-stop level (ADR-0002 amendment). Exported so the view can
 * resolve the same id it retains. */
export function eventStopId(event: HfpVehicleEvent): string | null {
  if (event.stopId !== null) return String(event.stopId);
  return event.topic.nextStopId;
}

/** Folds one event into the retained state, returning the new state. Every
 * bound in the ADR is applied here; nothing is deleted for being old except
 * the two rolling windows. */
export function applyVehicleEvent(
  state: VehicleTelemetry,
  event: HfpVehicleEvent,
): VehicleTelemetry {
  // Collapse the transport's duplicate fan-out before anything is retained
  // (ADR-0002 amendment). A repeat carries no new information: it must not
  // appear as a second door event, a second priority request, or a second
  // deviation sample.
  const identity = messageIdentity(event);
  if (state.recentMessageKeys.has(identity)) {
    return {
      ...state,
      messageCount: state.messageCount + 1,
      duplicateCount: state.duplicateCount + 1,
    };
  }
  const recentMessageKeys = new Map(state.recentMessageKeys);
  recentMessageKeys.set(identity, event.receivedAt);
  while (recentMessageKeys.size > DUPLICATE_WINDOW) {
    const oldest = recentMessageKeys.keys().next();
    if (oldest.done === true) break;
    recentMessageKeys.delete(oldest.value);
  }
  const isKnown = KNOWN_EVENT_TYPES.has(event.event);
  const next: VehicleTelemetry = {
    ...state,
    messageCount: state.messageCount + 1,
    recentMessageKeys,
    unknownEventCount: state.unknownEventCount + (isKnown ? 0 : 1),
    lastEvent: event,
    events: [toTelemetryEvent(event), ...state.events].slice(
      0,
      VEHICLE_EVENT_LIMIT,
    ),
    dlSamples: state.dlSamples,
    doors: state.doors,
    tlp: state.tlp,
  };

  if (event.event === "vp") {
    next.telemetry = event;
    next.telemetryAt = event.receivedAt;
    next.nextStopId = eventStopId(event);
    if (event.dl !== null) {
      const cutoff = event.receivedAt - DL_WINDOW_MS;
      next.dlSamples = [
        ...state.dlSamples.filter((sample) => sample.at >= cutoff),
        { at: event.receivedAt, dl: event.dl },
      ];
    }
    if (event.drst !== null) {
      next.doors = {
        ...state.doors,
        drst: event.drst,
        open: (event.drst & 1) === 1,
      };
    }
    return next;
  }

  // A non-`vp` event still carries the same envelope, but the overview only
  // advances the telemetry fields the event actually reports, so the position
  // and speed shown never jump backwards to an older event's values.
  if (event.drst !== null) {
    const open = (event.drst & 1) === 1;
    next.doors = {
      ...state.doors,
      drst: event.drst,
      open,
      lastOpenedAt:
        event.event === "doo" ? event.receivedAt : state.doors.lastOpenedAt,
      lastClosedAt:
        event.event === "doc" ? event.receivedAt : state.doors.lastClosedAt,
      lastChangedAt:
        state.doors.open === null || state.doors.open !== open
          ? event.receivedAt
          : state.doors.lastChangedAt,
    };
  }
  if (event.tlp !== null) {
    next.tlp = {
      ...state.tlp,
      request: event.tlp,
      requestId: event.tlp.requestId,
      requestAt: event.receivedAt,
    };
  }
  if (event.tlpDecision !== null) {
    next.tlp = {
      ...next.tlp,
      decision: event.tlpDecision,
      decisionAt: event.receivedAt,
    };
  }
  return next;
}

const KNOWN_EVENT_TYPES = new Set([
  "vp",
  "due",
  "arr",
  "ars",
  "dep",
  "pde",
  "pas",
  "doo",
  "doc",
  "tlr",
  "tla",
  "vja",
  "vjout",
  "wait",
]);

function toTelemetryEvent(event: HfpVehicleEvent): TelemetryEvent {
  return {
    type: event.event,
    at: event.receivedAt,
    stopId: eventStopId(event),
    dl: event.dl,
    speed: event.speed,
    drst: event.drst,
    timetableArrival: event.ttarr,
    timetableDeparture: event.ttdep,
    tlpRequestType: event.tlp?.requestType ?? null,
    tlpDecision: event.tlpDecision?.decision ?? null,
    tlpRequestId: event.tlp?.requestId ?? event.tlpDecision?.requestId ?? null,
  };
}

/** True when the shown telemetry is older than the staleness budget. */
export function isStale(telemetryAt: number | null, now: number): boolean {
  return telemetryAt !== null && now - telemetryAt > VEHICLE_STALENESS_MS;
}
