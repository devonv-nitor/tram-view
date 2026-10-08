import { useEffect, useRef, useState, type RefObject } from "react";
import type { TramPosition } from "../lib/digitransit.ts";
import type { TramPositionsState } from "../hooks/useTramPositions";
import {
  isSparakoffBarTram,
  SPARAKOFF_LEGEND_LABEL,
  TRAM_CATEGORY_LEGEND,
  tramCategoryInfo,
  type TramCategory,
} from "../lib/fleet.ts";

/** Live per-type counts for the strip's legend chips (TV-0012), derived
 * from the current positions snapshot on every render - no state of their
 * own: the panel re-renders exactly when the snapshot changes (see
 * useTramPositions), so the counts are always in sync with the map markers.
 * Unknown vehicle numbers (including malformed ones) tally into UNKNOWN via
 * the fleet resolver. TV-0013: the SpåraKoff bar tram is excluded - it has
 * its own chip below and must not double-count into the A/MLNRV total it
 * would otherwise land in via the number ranges. TV-0027 review round:
 * out-of-service trams (routeShortName null - the same condition
 * TramMarkers.ts renders the TV-0011 red dot from, minus the SpåraKoff
 * exception which never shows the dot) are excluded here too: each has its
 * own chip below, so leaving them in would double-count them across chips. */
function countByCategory(
  positions: TramPosition[],
): Record<TramCategory, number> {
  const counts: Record<TramCategory, number> = { A: 0, B: 0, C: 0, UNKNOWN: 0 };
  for (const position of positions) {
    if (isSparakoffBarTram(position)) continue;
    if (position.routeShortName === null) continue;
    counts[tramCategoryInfo(position.vehicleNumber).category] += 1;
  }
  return counts;
}

/** TV-0027 review round: the live count for the Not-in-service chip -
 * positions whose route resolves to no displayed tram line, the exact
 * condition TramMarkers.ts renders the red dot from (routeShortName null),
 * minus the SpåraKoff exception (the bar tram never shows the dot; it has
 * its own chip - TV-0013). The snapshot dedups per vehicle, so this and
 * every chip count here is live and non-double-counting. */
function countOffline(positions: TramPosition[]): number {
  let count = 0;
  for (const position of positions) {
    if (position.routeShortName === null && !isSparakoffBarTram(position)) {
      count += 1;
    }
  }
  return count;
}

/** TV-0012: the fleet resolver's model name (the chip's `title` tooltip -
 * the full label, not the chip's short label) plus the chip's short display
 * label per the user's decision (TV-0027). Only the chips use these; the
 * fleet module itself is unchanged. */
const CATEGORY_CHIP_LABELS: Record<
  TramCategory,
  { short: string; title: string }
> = {
  A: { short: "MLNRV", title: "MLNRV I/II (Valmet)" },
  B: { short: "Artic", title: "Škoda Transtech Artic" },
  C: { short: "X54", title: "Škoda Transtech Artic X54" },
  UNKNOWN: { short: "Unknown", title: "? Unknown type" },
};

/** TV-0011: the out-of-service chip's short label and its full text (the
 * old legend row's wording). TV-0027 review round: the chip carries its
 * live count - the out-of-service trams are excluded from the category
 * chips above (countByCategory), so this count is the only place a
 * red-dot tram tallies; nothing double-counts. */
const OFFLINE_CHIP_SHORT = "Not in service";
const OFFLINE_CHIP_TITLE = "Not in service (shunting/testing)";

/** TV-0027: the one-click collapse affordance, absolutely pinned to the
 * status row's right edge - a click, tap, or Enter/Space collapses the
 * strip to the bottom-left pill. aria-expanded is true: the strip this
 * control toggles is currently expanded. The chevron is drawn in CSS
 * (aria-hidden), not a text or emoji glyph, so it renders identically on
 * every platform. */
function PanelCollapseButton({
  buttonRef,
  onCollapse,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  onCollapse: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="debug-panel__collapse"
      aria-expanded={true}
      aria-label="Collapse the tram status strip"
      onClick={onCollapse}
    >
      <span className="debug-panel__collapse-chevron" aria-hidden="true" />
    </button>
  );
}

/** Compact bottom-left status strip for the live tram data client (TV-0004):
 * a two-row strip while live - the status line (dot, "Live · N trams ·
 * updated HH:MM", minute precision) centered in the first row with the
 * collapse button pinned to its right edge, and the legend chips (swatch +
 * count + short label) on their own row below (TV-0027, the user-chosen
 * option B). Loading and connecting keep the strip's shape with progress
 * text; errors get the red-bordered variant with the full message wrapped
 * inside the strip. While live the chips show the color legend for the tram
 * rolling stock categories (TV-0009), each with its live count of trams
 * currently in the snapshot (TV-0012; TV-0027 review round: out-of-service
 * trams are excluded from the category counts and have their own counted
 * chip, so the chips partition the snapshot with no double-count), the
 * SpåraKoff chip only while car #175 reports (TV-0013 - hidden entirely when
 * absent, never a zero-count row), and the counted red not-in-service dot
 * chip for out-of-service trams (TV-0011). Tram positions themselves render
 * as map markers (TV-0005).
 * TV-0027 stacking (measured in Chrome 155): the strip is z-index 640 -
 * above the map pane's tier in the root stacking context (.leaflet-map-pane
 * carries a transform, so it is its own stacking context and its internal
 * pane z-indexes - marker 600, tooltip 650, popup 700 - order only inside
 * it), so the strip covers map content in its own corner including a popup
 * that overlaps its band; Leaflet's autoPan keeps a naturally-anchored
 * popup clear of the strip. A popup guaranteed above the strip needs the
 * popup rendered outside the map pane's subtree (MapView/TramMarkers
 * change; recorded as the task's STOP-DECISION). TV-0015: the
 * strip is collapsible - one click/tap on the row's collapse button folds
 * it to the count pill (same anchor, one shared rule in index.css), one
 * click/tap on the pill restores it; the state is per-session component
 * state, expanded on every load, never persisted. The strip's chips are a
 * real <ul> (role list) so the legend's aria-label is announced. */
export function TramStatusPanel({ trams }: { trams: TramPositionsState }) {
  // TV-0015: per-session collapse state - the strip is expanded on every
  // load and never persisted (no localStorage).
  const [collapsed, setCollapsed] = useState(false);
  const expandRef = useRef<HTMLButtonElement | null>(null);
  const collapseRef = useRef<HTMLButtonElement | null>(null);

  // TV-0015: the focused toggle unmounts on collapse (the row's button) and
  // on expand (the pill), which would drop keyboard focus to <body>. Move
  // focus to the other affordance once the DOM has swapped. Comparing
  // against the previous state (instead of a mounted flag) keeps
  // StrictMode's double effect pass from stealing focus on page load.
  const prevCollapsed = useRef<boolean | null>(null);
  useEffect(() => {
    const wasCollapsed = prevCollapsed.current;
    prevCollapsed.current = collapsed;
    if (wasCollapsed === null || wasCollapsed === collapsed) return;
    (collapsed ? expandRef : collapseRef).current?.focus();
  }, [collapsed]);

  // TV-0015/TV-0027: the collapsed pill - the strip's collapsed
  // representation, pinned to the same bottom-left spot as the expanded
  // strip (one shared anchor in index.css) and a real button - the
  // keyboard- and screen-reader-operable control while collapsed
  // (aria-expanded false, the state in its label); the expanded strip is
  // unmounted, so nothing hidden lingers in the accessibility tree. While
  // the client is live the pill shows the live tram count - the one thing
  // the strip surfaces at a glance - updating with every snapshot because
  // this component re-renders on each one; the expand chevron shows while
  // loading, connecting, or errored (live-verified 2026-10-08: count pill
  // while live, chevron pill on the error variant).
  if (collapsed) {
    const liveCount =
      trams.error === null && trams.status === "live"
        ? trams.positions.length
        : null;
    const label =
      liveCount !== null
        ? `Show the live tram status strip, ${liveCount} trams`
        : trams.error !== null
          ? "Show the tram data error strip"
          : "Show the tram status strip";
    return (
      <button
        ref={expandRef}
        type="button"
        className="debug-panel-toggle"
        aria-expanded={false}
        aria-label={label}
        onClick={() => setCollapsed(false)}
      >
        {liveCount !== null ? (
          <>
            <span className="debug-panel-toggle__dot" aria-hidden="true" />
            <span className="debug-panel-toggle__count">{liveCount}</span>
          </>
        ) : (
          <span className="debug-panel-toggle__chevron" aria-hidden="true" />
        )}
      </button>
    );
  }

  if (trams.error !== null) {
    return (
      <section aria-live="polite" className="debug-panel debug-panel--error">
        <div className="debug-panel__row">
          <h2 className="debug-panel__heading">Tram data error</h2>
          <PanelCollapseButton
            buttonRef={collapseRef}
            onCollapse={() => setCollapsed(true)}
          />
        </div>
        <div className="debug-panel__row debug-panel__row--wrap">
          <p className="debug-panel__error-message">{trams.error.message}</p>
        </div>
      </section>
    );
  }

  if (trams.status === "loading") {
    return (
      <section aria-live="polite" className="debug-panel">
        <div className="debug-panel__row">
          <p className="debug-panel__progress">Loading tram line metadata...</p>
          <PanelCollapseButton
            buttonRef={collapseRef}
            onCollapse={() => setCollapsed(true)}
          />
        </div>
      </section>
    );
  }

  if (trams.status === "connecting") {
    return (
      <section aria-live="polite" className="debug-panel">
        <div className="debug-panel__row">
          <p className="debug-panel__progress">
            Connecting to the tram position stream...
          </p>
          <PanelCollapseButton
            buttonRef={collapseRef}
            onCollapse={() => setCollapsed(true)}
          />
        </div>
      </section>
    );
  }

  // One live count per category for this render (TV-0012); computed once,
  // not per chip. TV-0013: the SpåraKoff bar tram is counted separately -
  // the snapshot dedups per vehicle, so this is 0 or 1, and the chip below
  // is rendered only while the car is present. TV-0027 review round:
  // out-of-service trams are excluded from the category counts and counted
  // in the Not-in-service chip instead, so the chips partition the snapshot
  // (see the sum note on the offline chip below).
  const counts = countByCategory(trams.positions);
  const offlineCount = countOffline(trams.positions);
  const sparakoffCount = trams.positions.reduce(
    (n, position) => (isSparakoffBarTram(position) ? n + 1 : n),
    0,
  );

  return (
    <section
      aria-live="polite"
      className="debug-panel"
      aria-label="Live tram data status"
    >
      <div className="debug-panel__row">
        <p className="debug-panel__status">
          <span className="status-dot" aria-hidden="true" />
          Live &middot; {trams.positions.length} trams
          {trams.updatedAt !== null && (
            <>
              {" "}
              &middot;{" "}
              <span className="debug-panel__time">
                updated{" "}
                {trams.updatedAt.toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </>
          )}
        </p>
        <PanelCollapseButton
          buttonRef={collapseRef}
          onCollapse={() => setCollapsed(true)}
        />
      </div>
      <ul className="debug-panel__chips" aria-label="Tram marker color legend">
        {TRAM_CATEGORY_LEGEND.map((category) => {
          // TV-0014: the Unknown chip renders only while an unknown
          // vehicle number is in the current snapshot - never a zero-count
          // row, the same conditional pattern as the SpåraKoff chip below.
          // The known category chips always render, with their live count.
          if (category.category === "UNKNOWN" && counts.UNKNOWN === 0) {
            return null;
          }
          const chip = CATEGORY_CHIP_LABELS[category.category];
          return (
            <li
              key={category.category}
              className={`debug-panel__chip debug-panel__chip--${category.category.toLowerCase()}`}
              title={chip.title}
            >
              <span className="debug-panel__chip-swatch" aria-hidden="true" />
              {/* TV-0012: live count of trams of this type in the current
                  snapshot; the chip's short label carries no count and no
                  category letter (TV-0014). */}
              <span className="debug-panel__chip-count">
                {counts[category.category]}
              </span>
              <span className="debug-panel__chip-label">{chip.short}</span>
            </li>
          );
        })}
        {/* TV-0013: the SpåraKoff bar tram has its own chip while car #175
            is in the current snapshot, in the TV-0012 format; it disappears
            entirely with the car - never a zero-count row. It sits with the
            type chips, before the out-of-service state chip. */}
        {sparakoffCount > 0 && (
          <li
            className="debug-panel__chip debug-panel__chip--sparakoff"
            title={`${SPARAKOFF_LEGEND_LABEL} (bar tram)`}
          >
            <span className="debug-panel__chip-swatch" aria-hidden="true" />
            <span className="debug-panel__chip-count">{sparakoffCount}</span>
            <span className="debug-panel__chip-label">
              {SPARAKOFF_LEGEND_LABEL}
            </span>
          </li>
        )}
        {/* TV-0011: out-of-service trams keep their category color and
            replace the line number with a red dot - not a vehicle type, so
            it sits after the category chips. TV-0027 review round: the
            chip carries its live count - countByCategory excludes the
            red-dot trams (routeShortName null, minus the SpåraKoff
            exception which never shows the dot), so the chips partition
            the snapshot: the status line's total equals the sum of the
            category counts + this count + the SpåraKoff count (0 or 1).
            The mockup's count 3 is that live number, not a constant. */}
        <li
          className="debug-panel__chip debug-panel__chip--offline"
          title={OFFLINE_CHIP_TITLE}
        >
          <span className="debug-panel__chip-swatch" aria-hidden="true" />
          <span className="debug-panel__chip-count">{offlineCount}</span>
          <span className="debug-panel__chip-label">{OFFLINE_CHIP_SHORT}</span>
        </li>
      </ul>
    </section>
  );
}
