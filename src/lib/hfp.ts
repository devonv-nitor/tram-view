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

/** Stable identity of one tram vehicle. */
export function vehicleKey(position: HfpVehiclePosition): string {
  return `${position.operatorId}/${position.vehicleNumber}`;
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
