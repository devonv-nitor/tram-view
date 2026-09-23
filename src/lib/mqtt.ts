/**
 * Minimal MQTT 3.1.1 client over WebSocket, sufficient for one subscription
 * at QoS 0 (decision: Docs/ADR/0002-data-transport.md). Kept in-repo instead
 * of an npm package: TV-0004's allowed paths exclude package.json and the
 * repo minimizes dependencies. Implements only what the HFP transport needs:
 * CONNECT, CONNACK, SUBSCRIBE, SUBACK, QoS 0 PUBLISH, PINGREQ/RESP,
 * DISCONNECT.
 */

export type MqttConnectionState = "connecting" | "connected" | "closed";

export interface MqttSubscribeHandlers {
  onMessage: (topic: string, payload: string) => void;
  onConnectionChange: (state: MqttConnectionState) => void;
  onError: (error: Error) => void;
}

export interface MqttSubscription {
  close(): void;
}

const CONTROL_CONNECT = 1;
const CONTROL_CONNACK = 2;
const CONTROL_PUBLISH = 3;
const CONTROL_SUBSCRIBE = 8;
const CONTROL_SUBACK = 9;
const CONTROL_PINGREQ = 12;
const CONTROL_PINGRESP = 13;
const CONTROL_DISCONNECT = 14;

const MQTT_SUBPROTOCOL = "mqtt";
const KEEPALIVE_SECONDS = 60;
const MAX_BACKOFF_MS = 30_000;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function encodeUint16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

/** MQTT remaining length: 7 bits per byte, LSB first, bit 8 = more to come. */
function encodeRemainingLength(length: number): number[] {
  const bytes: number[] = [];
  let value = length;
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) byte += 128;
    bytes.push(byte);
  } while (value > 0);
  return bytes;
}

function packet(control: number, flags: number, body: number[]): Uint8Array {
  return new Uint8Array([
    (control << 4) | flags,
    ...encodeRemainingLength(body.length),
    ...body,
  ]);
}

function connectPacket(clientId: string): Uint8Array {
  const id = textEncoder.encode(clientId);
  const variableHeader = [
    0x00,
    0x04,
    0x4d,
    0x51,
    0x54,
    0x54, // protocol name "MQTT"
    0x04, // protocol level 4 = MQTT 3.1.1
    0x02, // clean session
    ...encodeUint16(KEEPALIVE_SECONDS),
  ];
  const payload = [...encodeUint16(id.length), ...id];
  return packet(CONTROL_CONNECT, 0, [...variableHeader, ...payload]);
}

function subscribePacket(packetId: number, topicFilter: string): Uint8Array {
  const filter = textEncoder.encode(topicFilter);
  const body = [
    ...encodeUint16(packetId),
    ...encodeUint16(filter.length),
    ...filter,
    0x00,
  ];
  return packet(CONTROL_SUBSCRIBE, 2, body);
}

function pingReqPacket(): Uint8Array {
  return new Uint8Array([(CONTROL_PINGREQ << 4) | 0, 0]);
}

function disconnectPacket(): Uint8Array {
  return new Uint8Array([(CONTROL_DISCONNECT << 4) | 0, 0]);
}

/** Reassembles MQTT packets from WebSocket frames; frames may carry partial
 * or multiple packets, so bytes are buffered until a packet is complete. */
class PacketBuffer {
  private buffer = new Uint8Array(0);
  private start = 0;

  push(chunk: Uint8Array): void {
    const pending = this.buffer.length - this.start;
    const merged = new Uint8Array(pending + chunk.length);
    merged.set(this.buffer.subarray(this.start), 0);
    merged.set(chunk, pending);
    this.buffer = merged;
    this.start = 0;
  }

  /** Returns the next complete packet, or null when more bytes are needed. */
  next(): { control: number; flags: number; body: Uint8Array } | null {
    let offset = this.start;
    if (offset >= this.buffer.length) return null;
    const header = this.buffer[offset];
    const control = header >> 4;
    const flags = header & 0x0f;
    offset += 1;
    let length = 0;
    let multiplier = 1;
    for (;;) {
      if (offset >= this.buffer.length) return null;
      const byte = this.buffer[offset];
      offset += 1;
      length += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) break;
      multiplier *= 128;
      if (multiplier > 128 * 128 * 128) {
        throw new Error(
          "Malformed MQTT packet: remaining length varint too long",
        );
      }
    }
    if (offset + length > this.buffer.length) return null;
    const body = this.buffer.subarray(offset, offset + length);
    this.start = offset + length;
    return { control, flags, body };
  }
}

class MqttWebSocketSubscription implements MqttSubscription {
  private socket: WebSocket | null = null;
  private buffer = new PacketBuffer();
  private connectionState: MqttConnectionState = "closed";
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private keepAliveTimer: number | null = null;
  private nextPacketId = 0;
  private closed = false;
  private readonly url: string;
  private readonly topicFilter: string;
  private readonly handlers: MqttSubscribeHandlers;

  constructor(
    url: string,
    topicFilter: string,
    handlers: MqttSubscribeHandlers,
  ) {
    this.url = url;
    this.topicFilter = topicFilter;
    this.handlers = handlers;
    this.open();
  }

  close(): void {
    this.closed = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(disconnectPacket());
        } catch {
          // The socket is going away regardless.
        }
      }
      socket.close();
    }
    this.setConnectionState("closed");
  }

  private open(): void {
    if (this.closed) return;
    this.setConnectionState("connecting");
    const socket = new WebSocket(this.url, MQTT_SUBPROTOCOL);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.onopen = () => {
      this.send(connectPacket(""));
    };
    socket.onmessage = (event: MessageEvent) => {
      this.receive(event.data);
    };
    socket.onerror = () => {
      this.handlers.onError(new Error(`MQTT connection error: ${this.url}`));
    };
    socket.onclose = () => {
      this.scheduleReconnect();
    };
  }

  private receive(data: unknown): void {
    if (!(data instanceof ArrayBuffer)) return;
    this.buffer.push(new Uint8Array(data));
    for (;;) {
      let decoded: ReturnType<PacketBuffer["next"]>;
      try {
        decoded = this.buffer.next();
      } catch (cause) {
        this.handlers.onError(
          new Error(`Malformed MQTT data: ${String(cause)}`),
        );
        return;
      }
      if (decoded === null) return;
      this.handle(decoded.control, decoded.flags, decoded.body);
    }
  }

  private handle(control: number, flags: number, body: Uint8Array): void {
    switch (control) {
      case CONTROL_CONNACK: {
        const returnCode = body.length > 1 ? body[1] : 0xff;
        if (returnCode !== 0) {
          // A refused connection (e.g. protocol error) is terminal, not a
          // transient drop worth retrying.
          this.handlers.onError(
            new Error(`MQTT broker refused connection (code ${returnCode})`),
          );
          this.close();
          return;
        }
        this.reconnectAttempts = 0;
        this.nextPacketId += 1;
        this.send(subscribePacket(this.nextPacketId, this.topicFilter));
        this.startKeepAlive();
        return;
      }
      case CONTROL_SUBACK: {
        const granted = body.length > 2 ? body[2] : 0x80;
        if (granted === 0x80) {
          this.handlers.onError(
            new Error(
              `MQTT broker refused subscription to ${this.topicFilter}`,
            ),
          );
          this.close();
        }
        return;
      }
      case CONTROL_PUBLISH:
        this.handlePublish(flags, body);
        return;
      case CONTROL_PINGRESP:
        return;
      default:
        return;
    }
  }

  private handlePublish(flags: number, body: Uint8Array): void {
    const qos = (flags >> 1) & 0x03;
    if (qos > 0) {
      // The subscription is QoS 0, so the broker must downscale delivery to
      // QoS 0 (MQTT 3.1.1 section 4.3); anything else would violate that.
      return;
    }
    if (body.length < 2) return;
    const topicLength = (body[0] << 8) | body[1];
    const topic = textDecoder.decode(body.subarray(2, 2 + topicLength));
    const payload = textDecoder.decode(body.subarray(2 + topicLength));
    this.handlers.onMessage(topic, payload);
  }

  private startKeepAlive(): void {
    if (this.keepAliveTimer !== null) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = setInterval(
      () => {
        if (this.socket?.readyState === WebSocket.OPEN)
          this.send(pingReqPacket());
      },
      (KEEPALIVE_SECONDS / 2) * 1000,
    );
  }

  private scheduleReconnect(): void {
    this.clearTimers();
    this.socket = null;
    if (this.closed) {
      this.setConnectionState("closed");
      return;
    }
    this.setConnectionState("connecting");
    this.reconnectAttempts += 1;
    const delay = Math.min(
      MAX_BACKOFF_MS,
      1000 * 2 ** Math.min(this.reconnectAttempts, 5),
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private send(bytes: Uint8Array): void {
    const socket = this.socket;
    if (socket === null || socket.readyState !== WebSocket.OPEN) return;
    socket.send(bytes);
  }

  private setConnectionState(state: MqttConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.handlers.onConnectionChange(state);
  }

  private clearTimers(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Opens one MQTT subscription and reconnects with backoff until closed. */
export function subscribeMqtt(
  url: string,
  topicFilter: string,
  handlers: MqttSubscribeHandlers,
): MqttSubscription {
  return new MqttWebSocketSubscription(url, topicFilter, handlers);
}
