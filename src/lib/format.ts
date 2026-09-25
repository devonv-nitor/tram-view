/**
 * TV-0017: shared presentation formatters for the vehicle overview.
 *
 * The schedule-deviation rules live here because they are a correctness
 * contract, not styling: HFP's `dl` is positive when the vehicle is *ahead*
 * of its timetable and negative when it is *behind* (verified live against
 * `ttdep - tst` and re-confirmed on 8,522 messages; Docs/ADR/0002-data-transport.md
 * amendment). Nothing in the app may invert that, and nothing may present
 * `dl` as a precise measurement - it is recomputed at stop events and can be
 * minutes old.
 */

/** The tone a schedule deviation is rendered in. */
export type DeviationTone = "ahead" | "behind" | "ontime" | "unknown";

export interface Deviation {
  tone: DeviationTone;
  /** Signed seconds as reported, or null when the feed reported none. */
  seconds: number | null;
  /** Plain-language reading, e.g. "38 s behind schedule". */
  text: string;
  /** Compact signed form, e.g. "+38 s" / "-38 s". */
  compact: string;
}

/** Reads HFP `dl`: positive = ahead of timetable, negative = behind. */
export function describeDeviation(dl: number | null): Deviation {
  if (dl === null || !Number.isFinite(dl)) {
    return {
      tone: "unknown",
      seconds: null,
      text: "schedule deviation not reported",
      compact: "—",
    };
  }
  const seconds = Math.round(dl);
  const magnitude = Math.abs(seconds);
  const compact = `${seconds > 0 ? "+" : seconds < 0 ? "-" : ""}${magnitude} s`;
  if (seconds === 0) {
    return { tone: "ontime", seconds, text: "on time", compact: "0 s" };
  }
  if (seconds > 0) {
    return {
      tone: "ahead",
      seconds,
      text: `${magnitude} s ahead of schedule`,
      compact,
    };
  }
  return {
    tone: "behind",
    seconds,
    text: `${magnitude} s behind schedule`,
    compact,
  };
}

/** Local wall-clock time, with seconds when `withSeconds` (timetable and
 * event times are minute-resolution, reported event times are not). */
export function formatClock(
  value: number | string | null,
  withSeconds = true,
): string {
  if (value === null) return "—";
  const ms = typeof value === "string" ? Date.parse(value) : value;
  if (!Number.isFinite(ms)) return "—";
  const date = new Date(ms);
  const two = (part: number) => String(part).padStart(2, "0");
  const base = `${two(date.getHours())}:${two(date.getMinutes())}`;
  return withSeconds ? `${base}:${two(date.getSeconds())}` : base;
}

/** "3 s ago" / "2 min ago" / "in 12 s", from an epoch-ms timestamp. */
export function formatAgo(now: number, at: number | null): string {
  if (at === null) return "never";
  const deltaSeconds = Math.round((now - at) / 1000);
  if (Math.abs(deltaSeconds) < 60) return `${deltaSeconds} s ago`;
  const minutes = Math.round(Math.abs(deltaSeconds) / 60);
  return `${minutes} min ${deltaSeconds < 0 ? "from now" : "ago"}`;
}

/** "1:48" style countdown; "now" inside the last second; "0:20 over" once the
 * estimate has passed. */
export function formatCountdown(now: number, at: number | null): string {
  if (at === null) return "—";
  const remaining = Math.round((at - now) / 1000);
  const sign = remaining < 0 ? "-" : "";
  const magnitude = Math.abs(remaining);
  const minutes = Math.floor(magnitude / 60);
  const seconds = magnitude % 60;
  if (remaining === 0) return "now";
  return `${sign}${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Metres under 1 km, one-decimal kilometres above it. */
export function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Speed as reported (m/s, the HFP unit) with the km/h equivalent, because
 * "30 km/h" is what a passenger reads. */
export function formatSpeed(metersPerSecond: number | null): string {
  if (metersPerSecond === null || !Number.isFinite(metersPerSecond)) return "—";
  return `${metersPerSecond.toFixed(1)} m/s · ${Math.round(metersPerSecond * 3.6)} km/h`;
}

/** Acceleration as reported, m/s². */
export function formatAcceleration(acceleration: number | null): string {
  if (acceleration === null || !Number.isFinite(acceleration)) return "—";
  const sign = acceleration > 0 ? "+" : "";
  return `${sign}${acceleration.toFixed(2)} m/s²`;
}

/** Heading in degrees with the compass octant the HFP value implies. The
 * octant is a reading aid for a number; it is not reported by the feed. */
export function formatHeading(heading: number | null): string {
  if (heading === null || !Number.isFinite(heading)) return "—";
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const normalized = ((heading % 360) + 360) % 360;
  const octant = points[Math.round(normalized / 45) % 8];
  return `${Math.round(normalized)}° (${octant})`;
}

/** Door state from `drst` bit 0 plus whether the bit is all we know. */
export function describeDoors(
  drst: number | null,
  open: boolean | null,
): string {
  if (drst === null || open === null) return "doors: not reported";
  return open ? "doors open" : "doors closed";
}
