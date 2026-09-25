/**
 * TV-0017: the telemetry, door and traffic-light-priority cards.
 *
 * Each card states what the feed reported and, where the value is easy to
 * misread, what it does *not* mean: `occu` is always 0 for trams (so it is
 * printed as a reported value and nothing is derived from it), `drst` is a
 * bitfield of which only bit 0 is understood, and `tlr`/`tla` are
 * traffic-light-priority requests and decisions, not a live signal colour.
 */
import type {
  HfpVehicleEvent,
  TlpDecision,
  TlpRequest,
} from "../../lib/hfp.ts";
import type { DoorState } from "../../lib/vehicleTelemetry.ts";
import {
  describeDeviation,
  describeDoors,
  formatAcceleration,
  formatAgo,
  formatClock,
  formatHeading,
  formatSpeed,
} from "../../lib/format.ts";

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      <b
        className={`metric__value${tone === undefined ? "" : ` metric__value--${tone}`}`}
      >
        {value}
      </b>
      {note === undefined ? null : <span className="metric__note">{note}</span>}
    </div>
  );
}

export function TelemetryGrid({
  telemetry,
  now,
}: {
  telemetry: HfpVehicleEvent | null;
  now: number;
}) {
  if (telemetry === null) {
    return (
      <section className="card" aria-label="Telemetry">
        <h2 className="card__title">Telemetry</h2>
        <p className="card__note">
          Waiting for the first <code>vp</code> message from this vehicle.
        </p>
      </section>
    );
  }
  const deviation = describeDeviation(telemetry.dl);
  return (
    <section className="card" aria-label="Telemetry">
      <h2 className="card__title">
        Telemetry
        <span className="card__tag">
          from the latest vp · reported {formatAgo(now, telemetry.receivedAt)}
        </span>
      </h2>
      <div className="metrics">
        <Metric
          label="Speed"
          value={formatSpeed(telemetry.speed)}
          note="spd, as reported"
        />
        <Metric
          label="Acceleration"
          value={formatAcceleration(telemetry.acceleration)}
          note="acc, as reported"
        />
        <Metric
          label="Heading"
          value={formatHeading(telemetry.heading)}
          note="hdg; the octant is our reading of the number"
        />
        <Metric
          label="Schedule deviation"
          value={deviation.compact}
          tone={deviation.tone}
          note={`dl: ${deviation.text}`}
        />
        <Metric
          label="Position source"
          value={telemetry.loc ?? "—"}
          note={
            telemetry.loc === "DR"
              ? "loc: dead reckoning, i.e. interpolated between fixes"
              : "loc, informational — never used to decide what to render"
          }
        />
        <Metric
          label="Odometer"
          value={telemetry.odometer === null ? "—" : `${telemetry.odometer} m`}
          note="odo, as reported"
        />
        <Metric
          label="Occupancy"
          value={telemetry.occu === null ? "—" : String(telemetry.occu)}
          note="occu: the feed reports 0 for every tram, so no occupancy reading is shown"
        />
        <Metric
          label="Journey"
          value={
            telemetry.journeyId === null ? "—" : `jrn ${telemetry.journeyId}`
          }
          note={`start ${telemetry.startTime ?? "—"} · oday ${telemetry.operatingDay ?? "—"}`}
        />
      </div>
      <p className="card__note">
        Position {telemetry.lat ?? "—"}, {telemetry.lon ?? "—"} as reported at{" "}
        {formatClock(telemetry.receivedAt)}. HFP&apos;s <code>dl</code> is
        recomputed at stop arrivals and departures, so a value can be minutes
        old.
      </p>
    </section>
  );
}

export function DoorsCard({
  doors,
  telemetry,
  now,
}: {
  doors: DoorState;
  telemetry: HfpVehicleEvent | null;
  now: number;
}) {
  const open = doors.open;
  const state = describeDoors(doors.drst, open);
  return (
    <section className="card" aria-label="Doors">
      <h2 className="card__title">
        Doors
        <span className="card__tag">drst bit 0 · doo/doc events</span>
      </h2>
      <div
        className={`doors doors--${open === null ? "unknown" : open ? "open" : "closed"}`}
      >
        <span className="doors__state">
          {open === null ? "not reported" : open ? "Open" : "Closed"}
        </span>
        <span className="doors__bits">
          drst{" "}
          {doors.drst === null
            ? "—"
            : `${doors.drst} (binary ${doors.drst === null ? "—" : (doors.drst & 0xff).toString(2).padStart(8, "0")})`}
        </span>
      </div>
      <ul className="doors__list">
        <li>
          Last opened:{" "}
          {doors.lastOpenedAt === null
            ? "no doo event in this session"
            : `${formatClock(doors.lastOpenedAt)} (${formatAgo(now, doors.lastOpenedAt)})`}
        </li>
        <li>
          Last closed:{" "}
          {doors.lastClosedAt === null
            ? "no doc event in this session"
            : `${formatClock(doors.lastClosedAt)} (${formatAgo(now, doors.lastClosedAt)})`}
        </li>
        <li>
          Last change:{" "}
          {doors.lastChangedAt === null
            ? "—"
            : `${formatClock(doors.lastChangedAt)} (${formatAgo(now, doors.lastChangedAt)})`}
        </li>
      </ul>
      <p className="card__note">
        {state}. `drst` is a bitfield; only bit 0 (doors open) is understood
        here, the other bits are shown but not interpreted. A door event also
        carries the vehicle&apos;s <code>stop</code>
        {telemetry === null
          ? ""
          : ` and its reported dl ${describeDeviation(telemetry.dl).compact}`}
        .
      </p>
    </section>
  );
}

function requestIdOf(
  request: TlpRequest | null,
  decision: TlpDecision | null,
): number | null {
  return request?.requestId ?? decision?.requestId ?? null;
}

export function TlpCard({
  tlp,
  now,
}: {
  tlp: {
    request: TlpRequest | null;
    requestAt: number | null;
    decision: TlpDecision | null;
    decisionAt: number | null;
  };
  now: number;
}) {
  const request = tlp.request;
  const decision = tlp.decision;
  const requestId = requestIdOf(request, decision);
  const paired =
    request !== null &&
    decision !== null &&
    request.requestId !== null &&
    request.requestId === decision.requestId;
  return (
    <section className="card tlp" aria-label="Traffic light priority">
      <h2 className="card__title">
        Traffic-light priority
        <span className="card__tag">tlr request · tla decision</span>
      </h2>
      {request === null && decision === null ? (
        <p className="card__note">
          No <code>tlr</code> request or <code>tla</code> decision received from
          this vehicle yet. A request is not a signal colour: HFP publishes
          priority requests and their acknowledgements only.
        </p>
      ) : (
        <>
          <div className="tlp__pair">
            <div className="tlp__side">
              <span className="tlp__label">Latest request (tlr)</span>
              {request === null ? (
                <p className="card__note">none in this session</p>
              ) : (
                <ul className="tlp__fields">
                  <li>
                    type <b>{request.requestType ?? "—"}</b>
                  </li>
                  <li>
                    request id <b>{request.requestId ?? "—"}</b>
                  </li>
                  <li>
                    priority <b>{request.priorityLevel ?? "—"}</b>
                  </li>
                  <li>
                    protocol <b>{request.protocol ?? "—"}</b>
                  </li>
                  <li>
                    signal group <b>{request.signalGroupNumber ?? "—"}</b>
                  </li>
                  <li>
                    sid <b>{request.signalId ?? "—"}</b>
                  </li>
                  <li>attempt #{request.attemptSequence ?? "—"}</li>
                  <li>
                    frequency <b>{request.frequency ?? "—"}</b>
                  </li>
                  <li>
                    line config <b>{request.lineConfigId ?? "null"}</b>
                  </li>
                  <li>
                    point config <b>{request.pointConfigId ?? "null"}</b>
                  </li>
                  <li className="tlp__time">
                    at {formatClock(tlp.requestAt)} (
                    {formatAgo(now, tlp.requestAt)})
                  </li>
                </ul>
              )}
            </div>
            <div className="tlp__side">
              <span className="tlp__label">Latest decision (tla)</span>
              {decision === null ? (
                <p className="card__note">none in this session</p>
              ) : (
                <ul className="tlp__fields">
                  <li>
                    decision <b>{decision.decision ?? "—"}</b>
                  </li>
                  <li>
                    request id <b>{decision.requestId ?? "—"}</b>
                  </li>
                  <li className="tlp__time">
                    at {formatClock(tlp.decisionAt)} (
                    {formatAgo(now, tlp.decisionAt)})
                  </li>
                </ul>
              )}
            </div>
          </div>
          <p className="card__note">
            {request === null && decision === null
              ? ""
              : requestId === null
                ? "Neither the request nor the decision carried an id, so they cannot be paired."
                : paired
                  ? `The decision acknowledges request #${requestId}. HFP reports priority requests and acknowledgements; it does not report the signal's colour, nor a countdown.`
                  : decision === null
                    ? `No tla decision for request #${requestId} in this session yet. HFP reports priority requests and acknowledgements; it does not report the signal's colour, nor a countdown.`
                    : request === null
                      ? `The latest decision (#${requestId}) answers a request older than this session. The pairing is per request id; HFP does not report the signal's colour, nor a countdown.`
                      : `Request #${request.requestId ?? "—"} and decision #${decision.requestId ?? "—"} do not pair with each other in the latest observations (the pairing is per request id, and requests are re-issued).`}
            {request?.requestType === "DOOR_OPEN" ||
            request?.requestType === "DOOR_CLOSE"
              ? " This request type is about doors, not signals."
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
