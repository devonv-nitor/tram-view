/**
 * TV-0017/TV-0020: the journey spine - the vehicle's ordered stop sequence
 * from the keyed trip-pattern query, with the position marker between the stop
 * the vehicle left and the one it is heading to.
 *
 * Which pattern of the line is shown is decided per vehicle (TV-0020): the
 * Routing API's own live-trip match is exact, and anything else is labelled as
 * an inferred variant in the card header rather than presented as fact.
 *
 * The list collapses by default (a terminus-to-terminus line is 23-34 rows of
 * thumb scrolling) and the toggle is a real >= 44 px button, because this page
 * is read while riding.
 */
import { useState } from "react";
import type { SpineStop } from "../../lib/journey.ts";
import {
  describeDeviation,
  formatClock,
  formatDistance,
} from "../../lib/format.ts";

/** How many stops on each side of the vehicle stay visible when collapsed. */
const WINDOW_BEFORE = 2;
const WINDOW_AFTER = 4;

function stopRow(stop: SpineStop) {
  const observed = stop.observed;
  const deviation = describeDeviation(observed?.dl ?? null);
  return (
    <li key={stop.gtfsId} className={`spine__stop spine__stop--${stop.state}`}>
      <div className="spine__dot" aria-hidden="true" />
      <div className="spine__body">
        <div className="spine__name">{stop.name}</div>
        <div className="spine__meta">
          {observed === null ? (
            <span>
              not observed in this session
              {stop.state === "next" ? " (heading here)" : ""}
            </span>
          ) : (
            <>
              <span>{observed.type.toUpperCase()}</span>
              <span>{formatClock(observed.at)}</span>
              {observed.dl !== null ? (
                <span className={`delta delta--${deviation.tone}`}>
                  {deviation.text}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="spine__right">
        {stop.distanceMeters !== null ? (
          <span className="spine__dist">
            {formatDistance(stop.distanceMeters)}
          </span>
        ) : null}
        {stop.state === "next" ? (
          <span className="spine__tag">next</span>
        ) : stop.state === "terminus" ? (
          <span className="spine__tag">terminus</span>
        ) : null}
      </div>
    </li>
  );
}

export function JourneySpine({
  stops,
  nextStopId,
  exact,
  filters,
}: {
  stops: SpineStop[];
  nextStopId: string | null;
  /** True when the Routing API reports this vehicle on a trip of this
   * pattern; false when the combination was inferred (see the note). */
  exact: boolean;
  /** The filters that narrowed the inferred choice, in order. */
  filters: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const nextIndex = stops.findIndex((stop) => stop.stopId === nextStopId);
  const collapsed =
    nextIndex < 0
      ? stops
      : stops.slice(
          Math.max(0, nextIndex - WINDOW_BEFORE),
          Math.min(stops.length, nextIndex + WINDOW_AFTER + 1),
        );
  const hiddenCount = stops.length - collapsed.length;
  const visible = expanded ? stops : collapsed;

  return (
    <section className="card spine" aria-label="Stops on this journey">
      <h2 className="card__title">
        Stops on this line
        <span className="card__tag">
          {stops.length} stops ·{" "}
          {nextIndex >= 0 ? `${nextIndex} passed` : "position unknown"}
        </span>
        {exact ? null : (
          <span className="card__tag card__tag--inferred">
            inferred pattern ({filters.join(" + ")})
          </span>
        )}
      </h2>
      {exact ? null : (
        <p className="card__note">
          The Routing API reports no live trip for this vehicle, so this stop
          sequence is not confirmed: it is the line&apos;s pattern chosen by{" "}
          {filters.join(" and ")}. It can be a different variant of the same
          line (a short turn, or a service variant that skips or adds stops).
        </p>
      )}
      {nextIndex < 0 ? (
        <p className="card__note">
          The vehicle&apos;s reported next stop is not in this pattern, so the
          position in the sequence is unknown. The grid shows the pattern order.
        </p>
      ) : null}
      <ol className="spine__list">{visible.map((stop) => stopRow(stop))}</ol>
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="spine__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? `Show ${WINDOW_BEFORE + WINDOW_AFTER + 1} stops around the tram`
            : `Show all ${stops.length} stops on this line`}
        </button>
      ) : null}
    </section>
  );
}
