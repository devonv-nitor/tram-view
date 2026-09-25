/**
 * Debug readout for the marker click popup (TV-0016): every input to the
 * red-dot decision, phrased from the same state the render path consumes -
 * including the Routing API's live-trip match (TV-0022), which is what
 * labels a vehicle whose HFP route id is not a GTFS route id.
 * Presentation/diagnostic only - nothing here mutates the snapshot state,
 * and the rendering logic (offline flag, marker classes, legend) never
 * consults this module. Content is rebuilt from the current position on
 * every snapshot while the popup is open (see TramMarkerLayer).
 */
import { POSITION_STALENESS_MS } from "../hooks/useTramPositions.ts";
import {
  LIVE_TRAM_TRIPS_MAX_AGE_MS,
  resolveLiveTramTrip,
  resolveTramRouteDebug,
  type LiveTramTripMatch,
  type TramPosition,
  type TramRouteResolution,
} from "../lib/digitransit.ts";
import { isSparakoffBarTram, tramCategoryInfo } from "../lib/fleet.ts";
import { vehicleKey } from "../lib/hfp.ts";
import { vehicleOverviewHash } from "../lib/route.ts";

/** Escapes one string for safe interpolation into the popup's innerHTML
 * (the raw HFP routeId is unvalidated feed data; the GTFS gtfsId,
 * shortName, and mode are derived from feed/query data). Every readout
 * row and the summary paragraph are escaped exactly once at their HTML
 * insertion points — see row() — so feed-derived values can never reach
 * the popup's DOM unescaped (TV-0016 reviewer round). */
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

/** One readout row. Both the label and the value are escaped here — the
 * single HTML insertion point for the readout — so every feed-derived
 * value (the raw HFP routeId, the GTFS gtfsId/shortName/mode derived from
 * it, all unvalidated) is escaped exactly once before it reaches the
 * popup's innerHTML (TV-0016 reviewer round: the route-resolution rows
 * previously interpolated these values unescaped). reasonText() and
 * summaryText() therefore return plain text; summary text is escaped at
 * its own <p> insertion point, and values passing through it are never
 * pre-escaped, so nothing is double-escaped. */
function row(label: string, value: string): string {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
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

/** The live-trip rows (TV-0022): the Routing API's own HFP-to-route match,
 * which is what labels a vehicle whose HFP route id is not a GTFS route id
 * (e.g. `1001H6`, a run of line 1H). The readout distinguishes the four
 * states the verdict below depends on: not consulted (the raw route id
 * resolved in the index), matched, no live trip reported for this vehicle,
 * and lookup unavailable (no successful fetch, with the failure reason). The
 * map's age and its last failure are shown because the answer is a
 * point-in-time snapshot, refreshed at most once a minute. */
function liveTripRows(
  resolution: TramRouteResolution | null,
  liveTrip: LiveTramTripMatch,
): string {
  const label = `Live trip match (${liveTrip.vehicleKey})`;
  if (resolution !== null && resolution.inTramLineIndex) {
    return row(
      label,
      "not consulted - the raw HFP route id resolves in the GTFS line index",
    );
  }
  const ageSeconds =
    liveTrip.fetchedAt === null
      ? null
      : Math.max(0, Math.round((Date.now() - liveTrip.fetchedAt) / 1000));
  const mapAge =
    ageSeconds === null
      ? "no successful fetch yet"
      : `fetched ${ageSeconds} s ago`;
  const map = row(
    "Live-trip map",
    `${mapAge} - one query for the live tram fleet when a route id does not resolve, refreshed at most every ${Math.round(LIVE_TRAM_TRIPS_MAX_AGE_MS / 1000)} s` +
      (liveTrip.error === null
        ? ""
        : `; the last attempt failed: ${liveTrip.error.message}`),
  );
  if (liveTrip.routeGtfsId === null) {
    return (
      row(
        label,
        ageSeconds === null
          ? `unavailable - the live-trip lookup has not succeeded (${liveTrip.error?.message ?? "reason unknown"})`
          : "none - the Routing API reports no live trip for this vehicle",
      ) + map
    );
  }
  return (
    row(
      label,
      `${liveTrip.routeGtfsId} -> route ${liveTrip.routeId ?? "?"} -> line ${liveTrip.routeShortName ?? "?"}`,
    ) + map
  );
}

/** The render-decision summary line (the task's phrasing, e.g. "red dot:
 * route 1009TX is not in the GTFS line index"): why the marker shows the
 * red not-in-service dot or not, derived from the same inputs the marker
 * classes use - the resolved line, the SpåraKoff special case, the route
 * resolution for the reason, and the live-trip match (TV-0022) that decides
 * the case where the raw route id is not a GTFS route id. */
function summaryText(
  position: TramPosition,
  resolution: TramRouteResolution | null,
  liveTrip: LiveTramTripMatch,
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
      text:
        resolution !== null && resolution.inTramLineIndex
          ? `Line dot: route ${position.routeId} is in the GTFS line index and resolves to line ${position.routeShortName}`
          : `Line dot: route ${position.routeId} is not a GTFS route id, but the Routing API's live-trip match reports this vehicle on route ${liveTrip.routeId ?? liveTrip.routeGtfsId ?? "?"} (line ${position.routeShortName})`,
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
  if (liveTrip.routeShortName !== null) {
    // Defensive for the same reason: the snapshot resolves a matched vehicle
    // to that line, so a red dot with a match means the two disagree.
    return {
      text: `Red dot: route ${position.routeId} is not a GTFS route id and the Routing API's live-trip match reports route ${liveTrip.routeId ?? "?"} (line ${liveTrip.routeShortName}), which the snapshot did not use (unexpected)`,
      offline,
    };
  }
  return {
    text:
      `Red dot: route ${position.routeId} is not a GTFS route id and the Routing API reports no live trip for this vehicle (${reasonText(resolution)})` +
      (liveTrip.fetchedAt === null
        ? `; the live-trip lookup is unavailable (${liveTrip.error?.message ?? "reason unknown"})`
        : ""),
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
  const liveTrip = resolveLiveTramTrip(vehicleKey(position));
  const summary = summaryText(position, resolution, liveTrip);
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
    // TV-0017: the popup's single navigation affordance, the entry point to
    // the vehicle overview page (ADR-0004). It is an ordinary fragment link -
    // Leaflet disables click propagation inside a popup but does not
    // preventDefault, so the browser still follows it - and the hash is built
    // from the vehicle identity so it is deep-linkable and refresh-safe.
    `<p class="tram-debug-popup__nav"><a class="tram-debug-popup__link" href="${escapeHtml(
      vehicleOverviewHash(position.operatorId, position.vehicleNumber),
    )}">Open vehicle overview →</a></p>` +
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
    liveTripRows(resolution, liveTrip) +
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
