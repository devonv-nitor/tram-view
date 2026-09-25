/**
 * TV-0017: the event log and the reported-field readout.
 *
 * The event log is the raw journey history the retained state keeps (bounded
 * to 200 entries) with the fields each event actually carried; the readout
 * lists every envelope field of the latest event, including the ones the
 * overview does not visualize (`jrn`, `oday`, `loc`, ...), so nothing in the
 * message set is silently dropped. `occu` is the one exception: it is not
 * parsed at all because the feed reports 0 for every tram (TV-0021).
 */
import type { HfpVehicleEvent } from "../../lib/hfp.ts";
import type { TelemetryEvent } from "../../lib/vehicleTelemetry.ts";
import {
  describeDeviation,
  formatAcceleration,
  formatClock,
  formatHeading,
  formatSpeed,
} from "../../lib/format.ts";
import type { TripPattern } from "../../lib/digitransit.ts";
import { bareStopId } from "../../lib/journey.ts";

/** What each event type means, in the transport's own terms - the log must not
 * imply a better semantic than HFP provides (e.g. `tlr` is a priority
 * request, not a signal colour). */
const EVENT_LABELS: Record<string, string> = {
  vp: "position/telemetry",
  due: "due at stop",
  arr: "arriving",
  ars: "arrived at stop",
  dep: "departed",
  pde: "doors closed, leaving",
  pas: "passed stop",
  doo: "doors opened",
  doc: "doors closed",
  tlr: "priority request",
  tla: "priority decision",
  vja: "journey start",
  vjout: "journey end / left",
  wait: "waiting",
};

function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? "unmodelled event type";
}

export function EventLog({
  events,
  pattern,
}: {
  events: TelemetryEvent[];
  pattern: TripPattern | null;
}) {
  const names = new Map<string, string>();
  for (const stop of pattern?.stops ?? []) {
    names.set(bareStopId(stop.gtfsId), stop.name);
  }
  return (
    <section className="card events" aria-label="Recent journey events">
      <h2 className="card__title">
        Recent journey events
        <span className="card__tag">
          newest first · max 200 · times as the vehicle reported them (tst) ·
          byte-identical repeats collapsed
        </span>
      </h2>
      {events.length === 0 ? (
        <p className="card__note">No events received yet.</p>
      ) : (
        <ol className="events__list">
          {events.map((event) => {
            const deviation = describeDeviation(event.dl);
            return (
              <li
                key={`${event.at}-${event.type}-${event.stopId ?? ""}`}
                className="events__row"
              >
                <time className="events__time">{formatClock(event.at)}</time>
                <span className={`events__type events__type--${event.type}`}>
                  {event.type}
                </span>
                <span className="events__what">
                  {eventLabel(event.type)}
                  {event.stopId !== null ? (
                    <>
                      {" · stop "}
                      {names.get(event.stopId) ?? event.stopId}
                      {names.has(event.stopId) ? ` (${event.stopId})` : ""}
                    </>
                  ) : null}
                  {event.tlpRequestType !== null
                    ? ` · request ${event.tlpRequestType}${event.tlpRequestId !== null ? ` #${event.tlpRequestId}` : ""}`
                    : null}
                  {event.tlpDecision !== null
                    ? ` · decision ${event.tlpDecision}${event.tlpRequestId !== null ? ` for #${event.tlpRequestId}` : ""}`
                    : null}
                </span>
                <span className="events__nums">
                  {event.dl !== null ? (
                    <b className={`delta delta--${deviation.tone}`}>
                      {deviation.compact}
                    </b>
                  ) : (
                    <span className="events__none">dl not reported</span>
                  )}
                  {event.speed !== null ? (
                    <span>{event.speed.toFixed(1)} m/s</span>
                  ) : null}
                  {event.drst !== null ? <span>drst {event.drst}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** One label/value pair of the reported-fields readout. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function isoOrDash(value: string | null): string {
  return value === null ? "—" : `${value} (${formatClock(value)})`;
}

/** Every field of the latest event that this page models, as the vehicle
 * reported it. `drst` is shown as a raw reported value on purpose (only bit 0
 * is understood); `occu` is absent because the feed reports 0 for every tram,
 * so it is not modelled at all (TV-0021, ADR-0002). */
export function ReportedFields({
  event,
  topicFilter,
  messageCount,
  duplicateCount,
  distinctCount,
  unknownEventCount,
  status,
}: {
  event: HfpVehicleEvent | null;
  topicFilter: string;
  messageCount: number;
  duplicateCount: number;
  distinctCount: number;
  unknownEventCount: number;
  status: string;
}) {
  if (event === null) {
    return (
      <section className="card raw" aria-label="Reported fields">
        <h2 className="card__title">Reported fields</h2>
        <p className="card__note">
          Waiting for the first message. Subscription:{" "}
          <code>{topicFilter}</code>
        </p>
      </section>
    );
  }
  const tlp = event.tlp;
  return (
    <section className="card raw" aria-label="Reported fields">
      <h2 className="card__title">
        Reported fields
        <span className="card__tag">
          latest {event.event} event · {formatClock(event.receivedAt)} (tst)
        </span>
      </h2>
      <dl className="raw__grid">
        <Field label="Subscription" value={topicFilter} />
        <Field
          label="Messages received"
          value={
            duplicateCount === 0
              ? `${messageCount} (${unknownEventCount} of an unmodelled type)`
              : `${distinctCount} distinct of ${messageCount} received · ` +
                `${duplicateCount} byte-identical broker repeats collapsed`
          }
        />
        <Field label="Connection" value={status} />
        <Field label="Event type" value={event.event} />
        <Field
          label="Vehicle oper/veh"
          value={`${event.operatorId}/${event.vehicleNumber}`}
        />
        <Field
          label="Topic oper/veh levels"
          value={`${event.topic.operatorRaw}/${event.topic.vehicleRaw}`}
        />
        <Field label="Topic headsign" value={event.topic.headsign} />
        <Field label="Topic start" value={event.topic.startTime} />
        <Field
          label="Topic next stop level"
          value={event.topic.nextStopId ?? "—"}
        />
        <Field label="desi (display line)" value={event.desi ?? "—"} />
        <Field label="route (GTFS id)" value={event.routeId} />
        <Field
          label="line (GTFS line id)"
          value={event.gtfsLineId === null ? "—" : String(event.gtfsLineId)}
        />
        <Field label="dir (topic direction)" value={event.directionId} />
        <Field
          label="jrn (journey)"
          value={event.journeyId === null ? "—" : String(event.journeyId)}
        />
        <Field label="oday (operating day)" value={event.operatingDay ?? "—"} />
        <Field label="tst (reported time)" value={isoOrDash(event.tst)} />
        <Field
          label="lat / long"
          value={
            event.lat === null || event.lon === null
              ? "—"
              : `${event.lat}, ${event.lon}`
          }
        />
        <Field label="loc (position source)" value={event.loc ?? "—"} />
        <Field label="hdg" value={formatHeading(event.heading)} />
        <Field label="spd" value={formatSpeed(event.speed)} />
        <Field label="acc" value={formatAcceleration(event.acceleration)} />
        <Field
          label="dl (schedule deviation)"
          value={`${describeDeviation(event.dl).compact} · ${describeDeviation(event.dl).text}`}
        />
        <Field
          label="drst (door bits, bit 0 = open)"
          value={event.drst === null ? "—" : String(event.drst)}
        />
        <Field
          label="odo (odometer, m)"
          value={event.odometer === null ? "—" : String(event.odometer)}
        />
        <Field
          label="stop (payload)"
          value={
            event.stopId === null
              ? "null in this message (the topic's next-stop level applies)"
              : String(event.stopId)
          }
        />
        <Field
          label="ttarr / ttdep"
          value={`${isoOrDash(event.ttarr)} / ${isoOrDash(event.ttdep)}`}
        />
        {tlp !== null ? (
          <>
            <Field
              label="tlp-requestid"
              value={tlp.requestId === null ? "—" : String(tlp.requestId)}
            />
            <Field label="tlp-requesttype" value={tlp.requestType ?? "—"} />
            <Field label="tlp-prioritylevel" value={tlp.priorityLevel ?? "—"} />
            <Field label="tlp-protocol" value={tlp.protocol ?? "—"} />
            <Field
              label="signal-groupid / tlp-signalgroupnbr"
              value={`${tlp.signalGroupId ?? "—"} / ${tlp.signalGroupNumber ?? "—"}`}
            />
            <Field
              label="sid (signal/point id)"
              value={tlp.signalId === null ? "—" : String(tlp.signalId)}
            />
            <Field
              label="tlp-frequency / tlp-att-seq"
              value={`${tlp.frequency ?? "—"} / ${tlp.attemptSequence ?? "—"}`}
            />
            <Field
              label="tlp-line-configid / tlp-point-configid"
              value={`${tlp.lineConfigId ?? "—"} / ${tlp.pointConfigId ?? "—"}`}
            />
          </>
        ) : null}
        {event.tlpDecision !== null ? (
          <>
            <Field
              label="tlp-requestid (decision)"
              value={
                event.tlpDecision.requestId === null
                  ? "—"
                  : String(event.tlpDecision.requestId)
              }
            />
            <Field
              label="tlp-decision"
              value={event.tlpDecision.decision ?? "—"}
            />
          </>
        ) : null}
      </dl>
    </section>
  );
}
