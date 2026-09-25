/**
 * TV-0017: the schedule-deviation trend - a plain SVG chart of the `dl`
 * samples the overview retained (rolling 15 minutes).
 *
 * Honesty rules baked in here (ADR-0002 amendment): positive `dl` is *ahead*
 * of timetable and is drawn upwards, negative is *behind* and drawn
 * downwards; the value is what the feed reported, and its outliers are shown
 * rather than smoothed away - the scale is clamped to a readable range and the
 * true range is printed underneath when samples fall outside it.
 */
import type { DlSample } from "../../lib/vehicleTelemetry.ts";
import { DL_WINDOW_MS } from "../../lib/vehicleTelemetry.ts";
import { describeDeviation, formatClock } from "../../lib/format.ts";

/** Half-height of the value axis in seconds: values beyond this are drawn on
 * the edge, and the real range is printed. */
const CLAMP_SECONDS = 120;

const WIDTH = 600;
const HEIGHT = 96;
const MID = HEIGHT / 2;

function yFor(dl: number): number {
  const clamped = Math.max(-CLAMP_SECONDS, Math.min(CLAMP_SECONDS, dl));
  return MID - (clamped / CLAMP_SECONDS) * (MID - 6);
}

export function DeltaChart({
  samples,
  now,
  latestDl,
}: {
  samples: DlSample[];
  now: number;
  latestDl: number | null;
}) {
  const windowStart = now - DL_WINDOW_MS;
  const inside = samples.filter((sample) => sample.at >= windowStart);
  const values = inside.map((sample) => sample.dl);
  const min = values.length > 0 ? Math.min(...values) : null;
  const max = values.length > 0 ? Math.max(...values) : null;
  const clipped =
    min !== null && max !== null
      ? min < -CLAMP_SECONDS || max > CLAMP_SECONDS
      : false;
  const deviation = describeDeviation(latestDl);

  const points = inside.map((sample) => {
    // The x axis is the retention window itself, so a gap in reporting shows
    // as a gap in the plot instead of being drawn as a straight line over it.
    const x = ((sample.at - windowStart) / DL_WINDOW_MS) * WIDTH;
    return { x, y: yFor(sample.dl), sample };
  });
  const line = points
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const area = points.length > 0 ? `0,${MID} ${line} ${WIDTH},${MID}` : "";

  return (
    <section className="card chart" aria-label="Schedule deviation trend">
      <h2 className="card__title">
        Schedule deviation
        <span className="card__tag">HFP dl · reported value, last 15 min</span>
      </h2>
      <div className="chart__headline">
        <b className={`delta delta--${deviation.tone}`}>{deviation.compact}</b>
        <span>
          {deviation.text} (dl &gt; 0 is ahead of the timetable, dl &lt; 0 is
          behind)
        </span>
      </div>
      <div className="chart__plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={
            points.length === 0
              ? "No schedule deviation samples yet"
              : `Schedule deviation over the last 15 minutes, ${inside.length} samples, between ${Math.round(min ?? 0)} and ${Math.round(max ?? 0)} seconds relative to the timetable, latest ${deviation.text}`
          }
        >
          <g stroke="#eef1f4">
            <line x1="0" y1={MID / 2} x2={WIDTH} y2={MID / 2} />
            <line x1="0" y1={MID} x2={WIDTH} y2={MID} />
            <line x1="0" y1={MID + MID / 2} x2={WIDTH} y2={MID + MID / 2} />
          </g>
          <line
            x1="0"
            y1={MID}
            x2={WIDTH}
            y2={MID}
            stroke="#c7ccd3"
            strokeDasharray="5 5"
          />
          {points.length > 1 ? (
            <>
              <polygon points={area} fill="#fdf1dc" />
              <polyline
                points={line}
                fill="none"
                stroke="#b26a00"
                strokeWidth="2"
              />
            </>
          ) : null}
          {points.map((point) => (
            <circle
              key={point.sample.at}
              cx={point.x}
              cy={point.y}
              r="2.5"
              fill={point.y === MID ? "#5b45c9" : "#b26a00"}
            />
          ))}
        </svg>
        <span className="chart__ylabel chart__ylabel--top">
          +{CLAMP_SECONDS} s · ahead ↑
        </span>
        <span className="chart__ylabel chart__ylabel--mid">
          0 s · timetable
        </span>
        <span className="chart__ylabel chart__ylabel--bottom">
          -{CLAMP_SECONDS} s · behind ↓
        </span>
      </div>
      <p className="card__note">
        {inside.length === 0
          ? "No samples retained yet: the trend starts with the first vp message that reports dl."
          : `${inside.length} samples from ${formatClock(inside[0].at)} to ${formatClock(inside[inside.length - 1].at)} · reported range ${Math.round(min ?? 0)} s … ${Math.round(max ?? 0)} s`}
        {clipped
          ? ` · the plot is clamped to ±${CLAMP_SECONDS} s, so samples outside that band sit on the edge`
          : ""}
      </p>
    </section>
  );
}
