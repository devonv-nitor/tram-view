/**
 * Compact HUD dashboard for the marker click popup (TV-0023): a dark-themed
 * popup showing only passenger-facing info. Replaces the TV-0016 debug
 * readout.
 *
 * Design: Tasks/mockups/mockup-01-hud-dashboard.html (the user's chosen
 * direction). Content live in Leaflet's default popup chrome - the dark
 * shell (wrapper, tip, close button) is restyled in index.css under the
 * `.tram-hud-shell` className TramMarkerLayer passes to bindPopup.
 * - Header: line badge (#fcb919) | vehicle key stacked over GTFS key | headsign pill
 * - Speed + ETA side by side
 * - Doors + Schedule deviation side by side
 * - Next stop row with a #fcb919 left accent border (deviation NOT repeated
 *   here); the id the HFP payload reports is shown as the name the caller
 *   resolved from the route's pattern when it has one, and as the bare id
 *   when it does not (TramMarkerLayer resolves names lazily and rewrites the
 *   open popup when they arrive)
 * - "Open vehicle overview →" nav link
 *
 * TV-0025: the Heading cell is an ETA cell - the estimated time to the next
 * stop, in whole seconds, computed by the caller from the Routing API's
 * live-trip match timetable corrected by the reported schedule deviation.
 * The cell is an estimate and is labelled as one: the value's accessible
 * explanation (and the hover title) say so in one line, and every fallback
 * is the same muted "—" the other cells use - never an invented number.
 *
 * Presentation only - nothing here mutates the snapshot state. Content is
 * rebuilt from the current position on every snapshot while the popup is open
 * (see TramMarkerLayer).
 */
import type { TramPosition } from "../lib/digitransit.ts";
import {
  describeDeviation,
  formatEtaSeconds,
  formatSpeedKmh,
  type DeviationTone,
} from "../lib/format.ts";
import { isSparakoffBarTram, SPARAKOFF_MARKER_LETTER } from "../lib/fleet.ts";
import { vehicleOverviewHash } from "../lib/route.ts";

/** Escapes one string for safe interpolation into the popup's innerHTML.
 * Every feed-derived value is escaped exactly once at its HTML insertion
 * point. */
function escapeHtml(value: string): string {
  let out = "";
  for (const ch of value) {
    switch (ch) {
      case "&":
        out += "&amp;";
        break;
      case "<":
        out += "&lt;";
        break;
      case ">":
        out += "&gt;";
        break;
      case '"':
        out += "&quot;";
        break;
      case "'":
        out += "&#39;";
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/** Door state as the mockup's dot + word indicator. The word and the dot are
 * fixed strings, not feed data - only the state is derived from `drst` bit 0.
 * An unreported state is an honest muted "—", never an invented "closed". */
function doorHtml(doorState: "open" | "closed" | null): string {
  if (doorState === null) {
    return (
      `<span class="tram-hud-popup__door">` +
      `<span class="tram-hud-popup__door-dot tram-hud-popup__door-dot--unknown"></span>` +
      `<span class="tram-hud-popup__muted">—</span>` +
      `</span>`
    );
  }
  const open = doorState === "open";
  return (
    `<span class="tram-hud-popup__door">` +
    `<span class="tram-hud-popup__door-dot tram-hud-popup__door-dot--${open ? "open" : "closed"}"></span>` +
    (open ? "Open" : "Closed") +
    `</span>`
  );
}

/** The deviation tone's color class: #34d399 ahead, #fbbf24 on time,
 * #f87171 behind, #6b7078 unknown (the mockup's palette). */
function deviationClass(tone: DeviationTone): string {
  switch (tone) {
    case "ahead":
      return "tram-hud-popup__metric-value--ahead";
    case "ontime":
      return "tram-hud-popup__metric-value--ontime";
    case "behind":
      return "tram-hud-popup__metric-value--behind";
    case "unknown":
      return "tram-hud-popup__metric-value--muted";
  }
}

/** The ETA cell's accessible explanation (TV-0025): the overview's own
 * wording in one line - the figure is the timetable corrected by the
 * *reported* schedule deviation, an estimate, not a measurement. It is
 * carried on the cell as a visually hidden line and as the hover title, in
 * both the value and the dash state, since it describes the figure's basis,
 * not the figure itself. */
const ETA_EXPLANATION =
  "Estimated time to the next stop: the trip timetable corrected by the reported schedule deviation — an estimate, not a measurement";

/** Builds the HUD dashboard popup HTML for one position. Every value that
 * originates in the feed is escaped at its insertion point.
 *
 * `nextStopName` is the resolved name of the position's next stop (TV-0023),
 * or null while the caller has none - the row then keeps the bare HFP id, so
 * it is never empty and never invents a name.
 *
 * `etaSeconds` is the ETA to the next stop in whole seconds (TV-0025),
 * computed from `now` at the caller's render time, or null while it is not
 * derivable - no matched trip yet, no stop time for the next stop, no
 * reported schedule deviation - which renders the muted dash. */
export function buildTramPopupHtml(
  position: TramPosition,
  nextStopName: string | null = null,
  etaSeconds: number | null = null,
): string {
  const barTram = isSparakoffBarTram(position);
  const lineLabel = barTram
    ? SPARAKOFF_MARKER_LETTER
    : (position.routeShortName ?? "—");
  const deviation = describeDeviation(position.scheduleDeviation);
  const nextStopLabel = nextStopName ?? position.nextStopId;

  return (
    `<div class="tram-hud-popup">` +
    // Header: line badge | vehicle key stacked over GTFS key | headsign pill
    `<div class="tram-hud-popup__header">` +
    `<span class="tram-hud-popup__badge">${escapeHtml(lineLabel)}</span>` +
    `<div class="tram-hud-popup__ids">` +
    `<span class="tram-hud-popup__vehicle-key">${position.operatorId}/${position.vehicleNumber}</span>` +
    `<span class="tram-hud-popup__gtfs-key">HSL:${escapeHtml(position.routeId)}</span>` +
    `</div>` +
    (position.headsign !== null
      ? `<span class="tram-hud-popup__headsign-pill">→ ${escapeHtml(position.headsign)}</span>`
      : `<span class="tram-hud-popup__headsign-pill tram-hud-popup__headsign-pill--empty">—</span>`) +
    `</div>` +
    `<div class="tram-hud-popup__body">` +
    // Row 1: Speed + ETA side by side. The ETA cell (TV-0025) carries its
    // accessible explanation on the cell and a visually hidden line after the
    // value; the value is whole seconds (35 s, 252 s) or the muted dash.
    `<div class="tram-hud-popup__row">` +
    `<div class="tram-hud-popup__metric">` +
    `<span class="tram-hud-popup__metric-label">Speed</span>` +
    `<span class="tram-hud-popup__metric-value">${escapeHtml(formatSpeedKmh(position.speed))}</span>` +
    `</div>` +
    `<div class="tram-hud-popup__metric" title="${escapeHtml(ETA_EXPLANATION)}">` +
    `<span class="tram-hud-popup__metric-label">ETA</span>` +
    `<span class="tram-hud-popup__metric-value${etaSeconds === null ? " tram-hud-popup__metric-value--muted" : ""}">${escapeHtml(formatEtaSeconds(etaSeconds))}</span>` +
    `<span class="tram-hud-popup__sr">${escapeHtml(ETA_EXPLANATION)}</span>` +
    `</div>` +
    `</div>` +
    // Row 2: Doors + Schedule deviation side by side
    `<div class="tram-hud-popup__row">` +
    `<div class="tram-hud-popup__metric">` +
    `<span class="tram-hud-popup__metric-label">Doors</span>` +
    `<span class="tram-hud-popup__metric-value">${doorHtml(position.doorState)}</span>` +
    `</div>` +
    `<div class="tram-hud-popup__metric">` +
    `<span class="tram-hud-popup__metric-label">Deviation</span>` +
    `<span class="tram-hud-popup__metric-value ${deviationClass(deviation.tone)}">${escapeHtml(deviation.compact)}</span>` +
    `</div>` +
    `</div>` +
    // Next stop row with the #fcb919 left accent border (no deviation here)
    `<div class="tram-hud-popup__next-stop">` +
    `<span class="tram-hud-popup__next-stop-label">Next stop</span>` +
    `<span class="tram-hud-popup__next-stop-value">${nextStopLabel !== null ? escapeHtml(nextStopLabel) : "—"}</span>` +
    `</div>` +
    // TV-0017: the popup's single navigation affordance
    `<p class="tram-hud-popup__nav"><a class="tram-hud-popup__link" href="${escapeHtml(
      vehicleOverviewHash(position.operatorId, position.vehicleNumber),
    )}">Open vehicle overview →</a></p>` +
    `</div>` +
    `</div>`
  );
}
