/**
 * Debug readout for the marker click popup (TV-0016): every input to the
 * red-dot decision, phrased from the same state the render path consumes.
 * Presentation/diagnostic only - nothing here mutates the snapshot state,
 * and the rendering logic (offline flag, marker classes, legend) never
 * consults this module. Content is rebuilt from the current position on
 * every snapshot while the popup is open (see TramMarkerLayer).
 */
import { POSITION_STALENESS_MS } from "../hooks/useTramPositions.ts";
import {
  resolveTramRouteDebug,
  type TramPosition,
  type TramRouteResolution,
} from "../lib/digitransit.ts";
import { isSparakoffBarTram, tramCategoryInfo } from "../lib/fleet.ts";

/** Escapes feed-derived values (the raw HFP routeId is unvalidated feed
 * data) before they go into the popup's innerHTML. Internal constants and
 * validated line names pass through unchanged. */
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

function row(label: string, value: string): string {
  return `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`;
}

/** Human-readable reason for one route-resolution outcome (TV-0016): the
 * popup must distinguish the filtered index's conflated null-reasons -
 * route absent from GTFS, not TRAM mode, null shortName, shortName failing
 * the line criteria. */
function reasonText(resolution: TramRouteResolution): string {
  switch (resolution.reason) {
    case "absent-from-gtfs":
      return "route absent from the GTFS route list";
    case "not-tram-mode":
      return `GTFS mode ${resolution.mode ?? "?"}, not TRAM`;
    case "short-name-missing":
      return "TRAM route without a GTFS shortName";
    case "short-name-fails-line-criteria":
      return `GTFS shortName "${resolution.shortName ?? "?"}" fails the tram-line criteria`;
    case "in-tram-line-index":
      return "in the index";
  }
}

/** The render-decision summary line (the task's phrasing, e.g. "red dot:
 * route 1009TX is not in the GTFS line index"): why the marker shows the
 * red not-in-service dot or not, derived from the same inputs the marker
 * classes use - the resolved line, the SpåraKoff special case, and the
 * route resolution for the reason. */
function summaryText(
  position: TramPosition,
  resolution: TramRouteResolution | null,
): { text: string; offline: boolean } {
  const offline =
    position.routeShortName === null && !isSparakoffBarTram(position);
  if (isSparakoffBarTram(position)) {
    return {
      text: "K marker: the SpåraKoff special case (operator 40, vehicle 175) wins over the route and range decision — never the red dot",
      offline,
    };
  }
  if (!offline) {
    return {
      text: `Line dot: route ${position.routeId} is in the GTFS line index and resolves to line ${position.routeShortName}`,
      offline,
    };
  }
  if (resolution === null) {
    return {
      text: "Red dot: route metadata not loaded — the route resolution is unavailable",
      offline,
    };
  }
  if (resolution.reason === "in-tram-line-index") {
    // Defensive: the route is in the index, so the snapshot cannot have
    // resolved it to null. Phrase it as the anomaly it would be.
    return {
      text: `Red dot: route ${position.routeId} is in the GTFS line index but resolved to no line (unexpected)`,
      offline,
    };
  }
  return {
    text: `Red dot: route ${position.routeId} is not in the GTFS line index (${reasonText(resolution)})`,
    offline,
  };
}

/** Builds the popup HTML for one position: the identity, the fleet
 * classification and its source (range lookup vs SpåraKoff special case),
 * the full route-resolution block (raw HFP routeId, index membership,
 * GTFS shortName, line-criteria pass, and the distinct null-reason when
 * absent), the resolved line the snapshot actually uses, the computed
 * offline boolean, a render-decision summary line, and the freshness,
 * heading, and speed of the position. */
export function buildTramDebugHtml(position: TramPosition): string {
  const barTram = isSparakoffBarTram(position);
  const info = tramCategoryInfo(position.vehicleNumber);
  const resolution = resolveTramRouteDebug(position.routeId);
  const summary = summaryText(position, resolution);
  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - position.receivedAt) / 1000),
  );
  const budgetSeconds = Math.round(POSITION_STALENESS_MS / 1000);

  // Fleet classification and its source: the SpåraKoff special case wins
  // over the vehicle-number range lookup for car #175 only - the popup shows
  // both the special case and what the range lookup alone would have said.
  const fleet = barTram
    ? row("Fleet type", "SpåraKoff bar tram (marker K, special-case color)") +
      row(
        "Fleet source",
        "isSparakoffBarTram: yes (operator 40, vehicle 175) — wins over the range lookup",
      ) +
      row(
        "Range lookup alone would say",
        `${info.model ?? "unknown"} (category ${info.category})`,
      )
    : row(
        "Fleet type",
        info.model === null
          ? "Unknown tram type"
          : `${info.model} (category ${info.category})`,
      ) +
      row(
        "Fleet source",
        "vehicle-number range lookup (isSparakoffBarTram: no)",
      );

  // Route resolution: the raw HFP routeId, the membership in the exact
  // filtered index the render path resolves with, and - when absent - the
  // distinct reason from the retained raw GTFS route list.
  const route =
    resolution === null
      ? row("HFP routeId (raw)", position.routeId) +
        row("In GTFS line index", "unknown — route metadata not loaded")
      : row("HFP routeId (raw)", position.routeId) +
        row("GTFS key", resolution.gtfsId) +
        row(
          "In GTFS line index",
          resolution.inTramLineIndex ? "yes" : `no — ${reasonText(resolution)}`,
        ) +
        row(
          "GTFS shortName",
          resolution.shortName === null ? "null" : `"${resolution.shortName}"`,
        ) +
        row(
          "Passes isTramLineShortName",
          resolution.passesLineCriteria === null
            ? "n/a (no shortName)"
            : resolution.passesLineCriteria
              ? "yes"
              : "no",
        );

  const freshness = row(
    "Received at",
    `${new Date(position.receivedAt).toLocaleTimeString()} — ${ageSeconds} s old (drops from the snapshot after ${budgetSeconds} s)`,
  );
  const heading =
    position.heading === null
      ? row("Heading", "headingless — no direction shown or faked")
      : row("Heading", `${position.heading}°`);
  const speed =
    position.speed === null
      ? row("Speed", "— (not reported)")
      : row("Speed", `${position.speed} m/s`);

  return (
    `<div class="tram-debug-popup">` +
    `<h3 class="tram-debug-popup__title">Tram ${position.operatorId}/${position.vehicleNumber} — debug</h3>` +
    `<dl class="tram-debug-popup__fields">` +
    row(
      "Vehicle key (oper/veh)",
      `${position.operatorId}/${position.vehicleNumber}`,
    ) +
    row(
      "Operator / vehicle",
      `oper ${position.operatorId}, veh ${position.vehicleNumber}`,
    ) +
    fleet +
    route +
    row(
      "Line shown (snapshot)",
      position.routeShortName === null
        ? "none (red dot marker)"
        : position.routeShortName,
    ) +
    row("Offline (red dot)", summary.offline ? "yes" : "no") +
    freshness +
    heading +
    speed +
    `</dl>` +
    `<p class="tram-debug-popup__summary${summary.offline ? " tram-debug-popup__summary--offline" : ""}">${escapeHtml(summary.text)}</p>` +
    `</div>`
  );
}
