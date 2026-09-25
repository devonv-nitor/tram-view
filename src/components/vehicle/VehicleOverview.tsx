/**
 * TV-0017: the vehicle overview page. One page per vehicle at
 * `#/vehicle/<oper>/<veh>` (Docs/ADR/0004-vehicle-overview-page.md), mobile
 * first because the primary use is reading it while riding: the answers that
 * matter (which vehicle, which line, where it is, when it gets to the next
 * stop) come first, and the raw evidence follows underneath.
 *
 * The page owns exactly one data client, the vehicle-scoped HFP subscription
 * in `useVehicleTelemetry`; the map page is unmounted while this is shown, so
 * the two subscriptions are never open together.
 */
import type { TripPattern } from "../../lib/digitransit.ts";
import {
  tramCategoryInfo,
  isSparakoffBarTram,
  SPARAKOFF_LEGEND_LABEL,
} from "../../lib/fleet.ts";
import {
  describeJourney,
  estimateNextArrival,
  type ArrivalEstimate,
  type JourneyPosition,
} from "../../lib/journey.ts";
import {
  describeDeviation,
  formatAgo,
  formatCountdown,
  formatClock,
  formatDistance,
  formatSpeed,
} from "../../lib/format.ts";
import { navigateToMap } from "../../hooks/useHashRoute.ts";
import {
  useVehicleTelemetry,
  type VehicleTelemetryView,
} from "../../hooks/useVehicleTelemetry.ts";
import { JourneySpine } from "./JourneySpine.tsx";
import { DeltaChart } from "./DeltaChart.tsx";
import { EventLog, ReportedFields } from "./EventLog.tsx";
import { DoorsCard, TelemetryGrid, TlpCard } from "./TelemetryCards.tsx";

function StatusPill({ view }: { view: VehicleTelemetryView }) {
  if (view.error !== null && view.status === "error") {
    return <span className="pill pill--error">stream error</span>;
  }
  if (view.stale) return <span className="pill pill--stale">stale</span>;
  if (view.status === "connecting") {
    return <span className="pill pill--connecting">connecting</span>;
  }
  return <span className="pill pill--live">live</span>;
}

/** The line badge: the reported display line (`desi`) when it is a tram line,
 * else the resolved short name, else a dash. Never invented. */
function lineBadge(view: VehicleTelemetryView): string {
  const desi = view.telemetry?.desi ?? null;
  if (desi !== null && /^[0-9]/.test(desi)) return desi;
  if (view.routeShortName !== null) return view.routeShortName;
  if (desi !== null && desi.length > 0) return desi;
  return "–";
}

/** Everything derived from the retained state, computed once per render so the
 * hero, the spine and the pinned summary cannot disagree. */
interface OverviewDerived {
  journey: JourneyPosition;
  estimate: ArrivalEstimate;
  /** The next stop's name from the pattern, or the bare reported id when the
   * pattern does not contain it, or null. */
  nextStopLabel: string | null;
}

function Hero({
  view,
  derived,
}: {
  view: VehicleTelemetryView;
  derived: OverviewDerived;
}) {
  const telemetry = view.telemetry;
  const { journey, estimate, nextStopLabel } = derived;
  const deviation = describeDeviation(telemetry?.dl ?? null);

  return (
    <section className="card hero" aria-label="This vehicle now">
      <div className="hero__identity">
        <div>
          <div className="hero__line-row">
            <span
              className={`badge badge--${tramCategoryInfo(view.telemetry?.vehicleNumber ?? 0).category}`}
            >
              {lineBadge(view)}
            </span>
            <h1 className="hero__title">
              {telemetry === null
                ? `${view.operatorId}/${view.vehicleNumber}`
                : `${telemetry.operatorId}/${telemetry.vehicleNumber}`}
            </h1>
          </div>
          <p className="hero__sub">
            {isSparakoffBarTram({
              operatorId: view.operatorId,
              vehicleNumber: view.vehicleNumber,
            })
              ? `${SPARAKOFF_LEGEND_LABEL} (bar tram)`
              : (tramCategoryInfo(view.vehicleNumber).model ?? "Unknown type")}
            {telemetry?.topic.headsign
              ? ` · towards ${telemetry.topic.headsign}`
              : ""}
            {telemetry === null ? "" : ` · dir ${telemetry.directionId}`}
          </p>
        </div>
        <StatusPill view={view} />
      </div>

      <div className="hero__next">
        <span className="hero__next-label">Next stop</span>
        <b className="hero__next-name">{nextStopLabel ?? "unknown"}</b>
        {journey.next !== null ? (
          <span className="hero__next-meta">
            {journey.next.distanceMeters === null
              ? "distance needs a reported position"
              : `${formatDistance(journey.next.distanceMeters)} straight line`}
            {` · stop ${journey.next.index + 1} of ${journey.stops.length}`}
            {journey.remainingCount > 0
              ? ` · ${journey.remainingCount} stops to the terminus`
              : ""}
          </span>
        ) : null}
      </div>

      <div className="hero__answers">
        <div className="answer">
          <span className="answer__label">
            Timetable arrival ({estimate.fromDeparture ? "ttdep" : "ttarr"})
          </span>
          <b className="answer__value">
            {estimate.timetableAt === null
              ? "not announced"
              : formatClock(estimate.timetableAt, false)}
          </b>
        </div>
        <div className="answer">
          <span className="answer__label">Estimated arrival</span>
          <b className="answer__value">
            {estimate.estimatedAt === null
              ? "—"
              : `${formatClock(estimate.estimatedAt, false)} (${formatCountdown(view.now, estimate.estimatedAt)})`}
          </b>
        </div>
        <div className="answer">
          <span className="answer__label">Schedule deviation (dl)</span>
          <b className={`answer__value delta--${deviation.tone}`}>
            {deviation.text}
          </b>
          <span className="answer__note">
            {deviation.seconds === null
              ? "the feed reported no dl"
              : `reported ${formatAgo(view.now, telemetry?.receivedAt ?? null)}`}
          </span>
        </div>
        <div className="answer">
          <span className="answer__label">Telemetry age</span>
          <b className="answer__value">
            {formatAgo(view.now, view.telemetryAt)}
          </b>
          <span className="answer__note">
            {view.distinctCount} distinct of {view.messageCount} messages this
            session · the vehicle's own tst vs the browser clock
          </span>
        </div>
      </div>

      <p className="card__note">
        The estimate is <b>timetable minus the reported dl</b>, using the dl
        value the vehicle reported{" "}
        {formatAgo(view.now, telemetry?.receivedAt ?? null)} — HFP recomputes dl
        at stop events, so it is an estimate, not a measurement.{" "}
        {estimate.basis}.
      </p>
    </section>
  );
}

/** The pinned summary: the one thing a passenger checks in a moving tram, in
 * the thumb zone. It is a normal flex row of the page (never an overlay), so
 * it cannot permanently hide content behind it. */
function PinnedSummary({
  view,
  derived,
}: {
  view: VehicleTelemetryView;
  derived: OverviewDerived;
}) {
  const telemetry = view.telemetry;
  const { journey } = derived;
  return (
    <div className="pinned" role="status" aria-live="polite">
      <div className="pinned__main">
        <span className="pinned__label">
          {journey.next === null ? "Next stop" : "Heading to"}
        </span>
        <b className="pinned__stop">
          {derived.nextStopLabel ?? "unknown"}
          {journey.next?.distanceMeters != null
            ? ` · ${formatDistance(journey.next.distanceMeters)}`
            : ""}
        </b>
        <span className="pinned__meta">
          {telemetry === null
            ? "no position reported yet"
            : `${formatSpeed(telemetry.speed)} · dl ${describeDeviation(telemetry.dl).compact} · updated ${formatAgo(view.now, view.telemetryAt)}`}
        </span>
      </div>
      <button type="button" className="pinned__back" onClick={navigateToMap}>
        Map
      </button>
    </div>
  );
}

function PatternNote({ view }: { view: VehicleTelemetryView }) {
  if (view.patternStatus === "ready") return null;
  // TV-0022: name the route the query actually asked about (the vehicle's own
  // route id, or the live-trip match when that id is not a GTFS route id).
  const route = view.patternRouteId ?? "?";
  const text =
    view.patternStatus === "idle"
      ? "Waiting for the vehicle's route before asking the Routing API for this line's stop sequence."
      : view.patternStatus === "loading"
        ? "Loading this line's stop sequences from the keyed Routing API query…"
        : view.patternStatus === "missing"
          ? view.patternSelection.missReason === "no-pattern-for-direction"
            ? `The Routing API returned no pattern of route ${route} in the direction this vehicle reports, so the stop sequence cannot be shown. Telemetry is unaffected.`
            : `The Routing API returned no trip patterns for route ${route}, so the stop sequence cannot be shown. Telemetry is unaffected.`
          : `The stop-sequence query failed (${view.patternError?.message ?? "unknown error"}). Telemetry is unaffected.`;
  return (
    <section className="card" aria-label="Stop sequence">
      <h2 className="card__title">Stops on this line</h2>
      <p className="card__note">{text}</p>
    </section>
  );
}

export function VehicleOverview({
  operatorId,
  vehicleNumber,
}: {
  operatorId: number;
  vehicleNumber: number;
}) {
  const view = useVehicleTelemetry(operatorId, vehicleNumber);
  const pattern: TripPattern | null = view.pattern;
  const telemetry = view.telemetry;
  const journey = describeJourney(
    pattern,
    view.nextStopId,
    telemetry !== null && telemetry.lat !== null && telemetry.lon !== null
      ? { lat: telemetry.lat, lon: telemetry.lon }
      : null,
    view.events,
  );
  const derived: OverviewDerived = {
    journey,
    estimate: estimateNextArrival(
      journey.next,
      { dl: telemetry?.dl ?? null, at: telemetry?.receivedAt ?? null },
      view.now,
    ),
    nextStopLabel:
      journey.next?.name ??
      (view.nextStopId === null ? null : `stop ${view.nextStopId}`),
  };

  return (
    <div className="overview">
      <header className="overview__head">
        <button
          type="button"
          className="overview__back"
          onClick={navigateToMap}
        >
          <span aria-hidden="true">←</span> Map
        </button>
        <div className="overview__headline">
          <b>
            Vehicle {view.operatorId}/{view.vehicleNumber}
          </b>
          <span>
            {telemetry === null
              ? "waiting for the first message"
              : `${telemetry.routeId} · ${telemetry.topic.headsign} · ${telemetry.topic.startTime}`}
          </span>
        </div>
        <StatusPill view={view} />
      </header>

      <main className="overview__body">
        <div className="overview__col">
          <Hero view={view} derived={derived} />
          {journey.stops.length > 0 ? (
            <JourneySpine
              stops={journey.stops}
              nextStopId={view.nextStopId}
              exact={view.patternSelection.exact}
              filters={view.patternSelection.filters}
            />
          ) : (
            <PatternNote view={view} />
          )}
        </div>
        <div className="overview__col">
          <TelemetryGrid telemetry={view.telemetry} now={view.now} />
          <DeltaChart
            samples={view.dlSamples}
            now={view.now}
            latestDl={view.telemetry?.dl ?? null}
          />
          <DoorsCard
            doors={view.doors}
            telemetry={view.telemetry}
            now={view.now}
          />
          <TlpCard tlp={view.tlp} now={view.now} />
          <EventLog events={view.events} pattern={pattern} />
          <ReportedFields
            event={view.lastEvent}
            topicFilter={view.topicFilter}
            messageCount={view.messageCount}
            duplicateCount={view.duplicateCount}
            distinctCount={view.distinctCount}
            unknownEventCount={view.unknownEventCount}
            status={view.status}
          />
        </div>
      </main>

      <PinnedSummary view={view} derived={derived} />
    </div>
  );
}

/** The explicit state for a hash that is not one of this app's routes: the
 * app never silently falls back to the map, and never shows a vehicle the URL
 * did not name. */
export function UnknownRoute({ hash }: { hash: string }) {
  return (
    <div className="overview">
      <header className="overview__head">
        <button
          type="button"
          className="overview__back"
          onClick={navigateToMap}
        >
          <span aria-hidden="true">←</span> Map
        </button>
        <div className="overview__headline">
          <b>Unknown link</b>
          <span>no page in this app matches it</span>
        </div>
      </header>
      <main className="overview__body">
        <div className="overview__col">
          <section className="card">
            <h1 className="card__title">
              This fragment is not a route this app defines
            </h1>
            <p className="card__note">
              Received <code>{hash === "" ? "(empty)" : hash}</code>, which the
              app does not recognise. Vehicle overviews live at{" "}
              <code>#/vehicle/&lt;operator&gt;/&lt;vehicle&gt;</code>, for
              example <code>#/vehicle/40/94</code>.
            </p>
            <button
              type="button"
              className="overview__back overview__back--wide"
              onClick={navigateToMap}
            >
              Back to the map
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
