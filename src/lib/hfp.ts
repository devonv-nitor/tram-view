/**
 * HFP (high-frequency positioning) MQTT transport for live tram positions.
 * Transport decision and alternatives: Docs/ADR/0002-data-transport.md. The
 * subscription is anonymous; the broker publishes one vehicle-position
 * message per tram roughly every second.
 */
import {
  subscribeMqtt,
  type MqttConnectionState,
  type MqttSubscription,
} from "./mqtt.ts";

/** HSL HFP MQTT broker (WebSocket endpoint, anonymous access). */
export const HFP_MQTT_URL = "wss://mqtt.hsl.fi:443/";

/** Ongoing-journey vehicle-position events, tram mode. The topic tree lets
 * the broker filter by transport mode server-side. */
export const TRAM_POSITION_TOPIC = "/hfp/v2/journey/ongoing/vp/tram/#";

/** One tram position parsed from an HFP VP message. */
export interface HfpVehiclePosition {
  /** GTFS route id without the feed prefix, e.g. "1013". */
  routeId: string;
  /** Journey direction, "1" or "2". */
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

interface HfpVpPayload {
  VP?: {
    dir?: string;
    oper?: number;
    veh?: number;
    tst?: string;
    spd?: number;
    hdg?: number;
    lat?: number;
    long?: number;
    route?: string;
  };
}

/** Parses one HFP VP message; returns null for anything unusable (malformed
 * messages are skipped rather than failing the whole stream). */
export function parseHfpPosition(payload: string): HfpVehiclePosition | null {
  let parsed: HfpVpPayload;
  try {
    parsed = JSON.parse(payload) as HfpVpPayload;
  } catch {
    return null;
  }
  const vp = parsed.VP;
  if (
    vp === undefined ||
    typeof vp.route !== "string" ||
    typeof vp.dir !== "string" ||
    typeof vp.oper !== "number" ||
    typeof vp.veh !== "number" ||
    typeof vp.lat !== "number" ||
    typeof vp.long !== "number" ||
    typeof vp.tst !== "string"
  ) {
    return null;
  }
  const receivedAt = Date.parse(vp.tst);
  if (!Number.isFinite(receivedAt)) return null;
  return {
    routeId: vp.route,
    directionId: vp.dir,
    operatorId: vp.oper,
    vehicleNumber: vp.veh,
    lat: vp.lat,
    lon: vp.long,
    heading: typeof vp.hdg === "number" ? vp.hdg : null,
    speed: typeof vp.spd === "number" ? vp.spd : null,
    receivedAt,
  };
}

/** Stable identity of one tram vehicle. Accepts the minimal fields any
 * position shape carries (HFP messages and filtered TramPosition alike). */
export function vehicleKey(position: {
  operatorId: number;
  vehicleNumber: number;
}): string {
  return `${position.operatorId}/${position.vehicleNumber}`;
}

/** TV-0017: the vehicle-scoped filter for the overview page (ADR-0002
 * amendment). `oper` and `veh` are zero-padded to 4 and 5 characters as the
 * broker's topic levels are, and the filter ends in `#` because every HFP
 * topic carries a variable-length geohash tail (`tlr`/`tla` one level more
 * than `vp`). One such filter carries every per-vehicle event type, so the
 * overview needs exactly one subscription. */
export function vehicleTopicFilter(
  operatorId: number,
  vehicleNumber: number,
): string {
  const pad = (value: number, width: number) =>
    String(value).padStart(width, "0");
  return `/hfp/v2/journey/ongoing/+/tram/${pad(operatorId, 4)}/${pad(vehicleNumber, 5)}/#`;
}

/** HFP event types seen on the tram topics. `vp` is the ~1 Hz position
 * stream; the rest are discrete journey events (ADR-0002 amendment). The
 * type is carried by the topic, not by the payload. */
export type HfpEventType =
  | "vp"
  | "due"
  | "arr"
  | "ars"
  | "dep"
  | "pde"
  | "pas"
  | "doo"
  | "doc"
  | "tlr"
  | "tla"
  | "vja"
  | "vjout"
  | "wait";

/** The parts of an HFP topic (ADR-0002 amendment):
 * `/hfp/v2/journey/ongoing/<event>/<mode>/<oper>/<veh>/<route>/<dir>/<headsign>/<start>/<nextstop>/<geohash...>`
 * with an extra trailing `sid` level on `tlr`/`tla`. */
export interface HfpTopicParts {
  /** Event type from the topic (index 5), unvalidated: an unknown value is
   * possible and callers must handle it as display text. */
  event: string;
  mode: string;
  /** Zero-padded operator level as published, e.g. "0040". */
  operatorRaw: string;
  /** Zero-padded vehicle level as published, e.g. "00094". */
  vehicleRaw: string;
  /** GTFS route id without the feed prefix, e.g. "1006". */
  routeId: string;
  /** Journey direction, "1" or "2". */
  directionId: string;
  /** Destination/headsign text as published; may be abbreviated or a
   * short-turn label, never an identity. */
  headsign: string;
  /** Journey start time as published, e.g. "14:29". */
  startTime: string;
  /** Next-stop id (7 characters) as published, or null when the topic has
   * no such level. */
  nextStopId: string | null;
}

/** Parses an HFP topic into its parts; returns null when the topic is not an
 * ongoing-journey topic with at least the vehicle levels. */
export function parseHfpTopic(topic: string): HfpTopicParts | null {
  const parts = topic.split("/");
  // parts[0] is the empty string before the leading "/".
  if (parts.length < 14) return null;
  if (parts[1] !== "hfp" || parts[3] !== "journey" || parts[4] !== "ongoing") {
    return null;
  }
  const nextStopId = parts[13] === undefined ? null : parts[13];
  return {
    event: parts[5],
    mode: parts[6],
    operatorRaw: parts[7],
    vehicleRaw: parts[8],
    routeId: parts[9],
    directionId: parts[10],
    headsign: parts[11],
    startTime: parts[12],
    nextStopId: nextStopId === "" ? null : nextStopId,
  };
}

/** The parts of an HFP payload every tram event type carries (ADR-0002
 * amendment: one flat envelope shared by all events, plus type-specific
 * extras). Every field is optional here because the payload is untrusted
 * feed input; the parser validates before exposing values. */
interface HfpEventBody {
  desi?: string;
  dir?: string;
  oper?: number;
  veh?: number;
  tst?: string;
  tsi?: number;
  spd?: number;
  hdg?: number;
  lat?: number;
  long?: number;
  acc?: number;
  dl?: number;
  odo?: number;
  drst?: number;
  oday?: string;
  jrn?: number;
  line?: number;
  start?: string;
  loc?: string;
  stop?: number | null;
  route?: string;
  occu?: number;
  ttarr?: string;
  ttdep?: string;
  sid?: number;
  "signal-groupid"?: number;
  "tlp-signalgroupnbr"?: number;
  "tlp-requestid"?: number;
  "tlp-requesttype"?: string;
  "tlp-prioritylevel"?: string;
  "tlp-line-configid"?: number | null;
  "tlp-point-configid"?: number | null;
  "tlp-frequency"?: number;
  "tlp-protocol"?: string;
  "tlp-att-seq"?: number;
  "tlp-decision"?: string;
}

/** One tram event (any type) as the overview consumes it: the shared
 * envelope, validated and normalized, plus whichever extras the event type
 * carries. Fields the feed did not report are null - the UI shows "not
 * reported" rather than inventing a value. */
export interface HfpVehicleEvent {
  /** Event type from the topic. */
  event: string;
  /** Topic parts (headsign, start time, next-stop id, operator/vehicle
   * levels as published). */
  topic: HfpTopicParts;
  /** The topic exactly as published, used as part of a message's identity so
   * byte-identical repeats of the same message can be recognised (the broker
   * fans most messages out several times - see the ADR-0002 amendment). */
  rawTopic: string;
  operatorId: number;
  vehicleNumber: number;
  /** GTFS route id, from the payload when present, else the topic. */
  routeId: string;
  directionId: string;
  /** Display line as published (e.g. "6"); not parsed into a number. */
  desi: string | null;
  /** GTFS line id (e.g. 34 for route 1006) - not a display name. */
  gtfsLineId: number | null;
  journeyId: number | null;
  startTime: string | null;
  operatingDay: string | null;
  /** Vehicle-reported event time (epoch ms). */
  receivedAt: number;
  /** Vehicle-reported event time as published (ISO 8601). */
  tst: string | null;
  lat: number | null;
  lon: number | null;
  heading: number | null;
  speed: number | null;
  acceleration: number | null;
  /** HFP schedule deviation in seconds: positive = ahead of timetable,
   * negative = behind (ADR-0002 amendment). */
  dl: number | null;
  /** Door state bitfield as reported; bit 0 = doors open. */
  drst: number | null;
  odometer: number | null;
  /** Position source as reported ("GPS", "DR", ...), informational. */
  loc: string | null;
  /** Stop id from the payload when present (about half of `vp` messages),
   * else null; callers fall back to the topic's next-stop level. */
  stopId: number | null;
  /** Occupancy as reported; always 0 for trams (ADR-0002 amendment). */
  occu: number | null;
  /** Timetable arrival/departure for the event's stop (stop events only). */
  ttarr: string | null;
  ttdep: string | null;
  /** Traffic-light-priority request fields (`tlr` only). */
  tlp: TlpRequest | null;
  /** Priority decision (`tla` only). */
  tlpDecision: TlpDecision | null;
}

/** One traffic-light-priority request (`tlr`). Request types observed:
 * `DOOR_OPEN`, `DOOR_CLOSE`, `NORMAL`, `ADVANCE` - a TLP request is not only
 * about signals (ADR-0002 amendment). */
export interface TlpRequest {
  /** Request id, paired with the `tla` decision carrying the same id. */
  requestId: number | null;
  requestType: string | null;
  priorityLevel: string | null;
  protocol: string | null;
  signalGroupId: number | null;
  signalGroupNumber: number | null;
  /** Signal/point id from the payload (`sid`), also a topic level. */
  signalId: number | null;
  frequency: number | null;
  attemptSequence: number | null;
  lineConfigId: number | null;
  pointConfigId: number | null;
}

/** One priority decision (`tla`): an acknowledgement for a request id. */
export interface TlpDecision {
  requestId: number | null;
  decision: string | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function request(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** Parses one HFP event message of any tram type into the shared envelope
 * plus its type-specific extras. Returns null for anything unusable
 * (malformed JSON, unknown payload shape, missing identity/time) - the stream
 * skips those rather than failing (ADR-0002 amendment). */
export function parseHfpEvent(
  topic: string,
  payload: string,
): HfpVehicleEvent | null {
  const topicParts = parseHfpTopic(topic);
  if (topicParts === null) return null;
  let parsed: Record<string, HfpEventBody | undefined>;
  try {
    parsed = JSON.parse(payload) as Record<string, HfpEventBody | undefined>;
  } catch {
    return null;
  }
  // The payload root is the uppercased event type ("VP", "DOO", "tlr" ->
  // "TLR"...). Accept the topic's type and, for robustness, any single
  // envelope the payload carries.
  const body = parsed[topicParts.event.toUpperCase()];
  if (body === undefined || typeof body !== "object") return null;
  const tst = str(body.tst);
  const receivedAt = tst === null ? NaN : Date.parse(tst);
  if (!Number.isFinite(receivedAt)) return null;
  const operatorId = num(body.oper);
  const vehicleNumber = num(body.veh);
  if (operatorId === null || vehicleNumber === null) return null;

  const tlp =
    topicParts.event === "tlr"
      ? {
          requestId: request(body["tlp-requestid"]),
          requestType: str(body["tlp-requesttype"]),
          priorityLevel: str(body["tlp-prioritylevel"]),
          protocol: str(body["tlp-protocol"]),
          signalGroupId: request(body["signal-groupid"]),
          signalGroupNumber: request(body["tlp-signalgroupnbr"]),
          signalId: request(body.sid),
          frequency: num(body["tlp-frequency"]),
          attemptSequence: request(body["tlp-att-seq"]),
          lineConfigId: request(body["tlp-line-configid"]),
          pointConfigId: request(body["tlp-point-configid"]),
        }
      : null;
  const tlpDecision =
    topicParts.event === "tla"
      ? {
          requestId: request(body["tlp-requestid"]),
          decision: str(body["tlp-decision"]),
        }
      : null;

  return {
    event: topicParts.event,
    topic: topicParts,
    rawTopic: topic,
    operatorId,
    vehicleNumber,
    routeId: str(body.route) ?? topicParts.routeId,
    directionId: str(body.dir) ?? topicParts.directionId,
    desi: str(body.desi),
    gtfsLineId: num(body.line),
    journeyId: num(body.jrn),
    startTime: str(body.start) ?? topicParts.startTime,
    operatingDay: str(body.oday),
    receivedAt,
    tst,
    lat: num(body.lat),
    lon: num(body.long),
    heading: num(body.hdg),
    speed: num(body.spd),
    acceleration: num(body.acc),
    dl: num(body.dl),
    drst: num(body.drst),
    odometer: num(body.odo),
    loc: str(body.loc),
    stopId: request(body.stop),
    occu: num(body.occu),
    ttarr: str(body.ttarr),
    ttdep: str(body.ttdep),
    tlp,
    tlpDecision,
  };
}

export type HfpConnectionState = MqttConnectionState;

export interface TramStreamHandle {
  close(): void;
}

/** Opens the tram position subscription (push, no polling interval).
 * Returns a handle that closes the stream. */
export function subscribeTramPositions(handlers: {
  onPosition: (position: HfpVehiclePosition) => void;
  onConnectionChange: (connected: boolean) => void;
  onError: (error: Error) => void;
}): TramStreamHandle {
  const subscription: MqttSubscription = subscribeMqtt(
    HFP_MQTT_URL,
    TRAM_POSITION_TOPIC,
    {
      onMessage: (_topic, payload) => {
        const position = parseHfpPosition(payload);
        if (position !== null) handlers.onPosition(position);
      },
      onConnectionChange: (state) => {
        handlers.onConnectionChange(state === "connected");
      },
      onError: (error) => {
        handlers.onError(error);
      },
    },
  );
  return {
    close: () => {
      subscription.close();
    },
  };
}

/** TV-0017: opens the vehicle-scoped subscription for the overview page -
 * every event type of one vehicle on a single filter (ADR-0002 amendment).
 * Only one such stream is open at a time: the overview page owns this and the
 * map page owns the network-wide position stream. */
export function subscribeVehicleEvents(
  operatorId: number,
  vehicleNumber: number,
  handlers: {
    onEvent: (event: HfpVehicleEvent) => void;
    onConnectionChange: (connected: boolean) => void;
    onError: (error: Error) => void;
  },
): TramStreamHandle {
  const subscription: MqttSubscription = subscribeMqtt(
    HFP_MQTT_URL,
    vehicleTopicFilter(operatorId, vehicleNumber),
    {
      onMessage: (topic, payload) => {
        const event = parseHfpEvent(topic, payload);
        if (event !== null) handlers.onEvent(event);
      },
      onConnectionChange: (state) => {
        handlers.onConnectionChange(state === "connected");
      },
      onError: (error) => {
        handlers.onError(error);
      },
    },
  );
  return {
    close: () => {
      subscription.close();
    },
  };
}
