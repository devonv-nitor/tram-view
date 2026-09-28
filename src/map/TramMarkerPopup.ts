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
 * - Speed + Heading side by side
 * - Doors + Schedule deviation side by side
 * - Next stop row with a #fcb919 left accent border (deviation NOT repeated here)
 * - "Open vehicle overview →" nav link
 *
 * Presentation only - nothing here mutates the snapshot state. Content is
 * rebuilt from the current position on every snapshot while the popup is open
 * (see TramMarkerLayer).
 */
import type { TramPosition } from "../lib/digitransit.ts";
import {
  describeDeviation,
  formatHeadingCompact,
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

/** Builds the HUD dashboard popup HTML for one position. Every value that
 * originates in the feed is escaped at its insertion point. */
export function buildTramPopupHtml(position: TramPosition): string {
  const barTram = isSparakoffBarTram(position);
  const lineLabel = barTram
    ? SPARAKOFF_MARKER_LETTER
    : (position.routeShortName ?? "—");
  const deviation = describeDeviation(position.scheduleDeviation);

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
    // Row 1: Speed + Heading side by side
    `<div class="tram-hud-popup__row">` +
    `<div class="tram-hud-popup__metric">` +
    `<span class="tram-hud-popup__metric-label">Speed</span>` +
    `<span class="tram-hud-popup__metric-value">${escapeHtml(formatSpeedKmh(position.speed))}</span>` +
    `</div>` +
    `<div class="tram-hud-popup__metric">` +
    `<span class="tram-hud-popup__metric-label">Heading</span>` +
    `<span class="tram-hud-popup__metric-value">${escapeHtml(formatHeadingCompact(position.heading))}</span>` +
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
    `<span class="tram-hud-popup__next-stop-value">${position.nextStopId !== null ? escapeHtml(position.nextStopId) : "—"}</span>` +
    `</div>` +
    // TV-0017: the popup's single navigation affordance
    `<p class="tram-hud-popup__nav"><a class="tram-hud-popup__link" href="${escapeHtml(
      vehicleOverviewHash(position.operatorId, position.vehicleNumber),
    )}">Open vehicle overview →</a></p>` +
    `</div>` +
    `</div>`
  );
}
