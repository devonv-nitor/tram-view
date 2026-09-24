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

/** Live per-type counts for the legend (TV-0012), derived from the current
 * positions snapshot on every render - no state of their own: the panel
 * re-renders exactly when the snapshot changes (see useTramPositions), so
 * the counts are always in sync with the map markers. Unknown vehicle
 * numbers (including malformed ones) tally into UNKNOWN via the fleet
 * resolver. TV-0013: the SpåraKoff bar tram is excluded - it has its own
 * legend entry below and must not double-count into the A/MLNRV total it
 * would otherwise land in via the number ranges. */
function countByCategory(
  positions: TramPosition[],
): Record<TramCategory, number> {
  const counts: Record<TramCategory, number> = { A: 0, B: 0, C: 0, UNKNOWN: 0 };
  for (const position of positions) {
    if (isSparakoffBarTram(position)) continue;
    counts[tramCategoryInfo(position.vehicleNumber).category] += 1;
  }
  return counts;
}

/** TV-0015: the one-click collapse affordance in an expanded panel's header
 * row - a click, tap, or Enter/Space collapses the panel to the top-right
 * circle. aria-expanded is true: the panel this control toggles is currently
 * expanded. The chevron is drawn in CSS (aria-hidden), not a text or emoji
 * glyph, so it renders identically on every platform. */
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
      aria-label="Collapse the tram status panel"
      onClick={onCollapse}
    >
      <span className="debug-panel__collapse-chevron" aria-hidden="true" />
    </button>
  );
}

/** Compact status indicator for the live tram data client (TV-0004): one
 * status line while live, an error box when the client fails - most
 * importantly the missing or rejected digitransit API key - and progress
 * text while the metadata query or the MQTT subscription is still coming
 * up. While live it also shows the color legend for the tram rolling
 * stock categories shown on the map markers (TV-0009), each with its
 * live count of trams currently in the snapshot (TV-0012), the SpåraKoff
 * bar tram entry while car #175 reports (TV-0013 - hidden entirely when it
 * is absent, never a zero-count row), and the red
 * not-in-service dot entry for out-of-service trams (TV-0011). Tram
 * positions themselves render as map markers (TV-0005). TV-0015: the panel
 * is collapsible - one click/tap on the header collapse button folds it to
 * the top-right circle (same anchor, one shared rule in index.css), one
 * click/tap on the circle restores it; the state is per-session component
 * state, expanded on every load, never persisted. */
export function TramStatusPanel({ trams }: { trams: TramPositionsState }) {
  // TV-0015: per-session collapse state - the panel is expanded on every
  // load and never persisted (no localStorage).
  const [collapsed, setCollapsed] = useState(false);
  const expandRef = useRef<HTMLButtonElement | null>(null);
  const collapseRef = useRef<HTMLButtonElement | null>(null);

  // TV-0015: the focused toggle unmounts on collapse (the header button) and
  // on expand (the circle), which would drop keyboard focus to <body>. Move
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

  // TV-0015 collapsed circle: the panel's collapsed representation, pinned
  // to the same top-right spot as the expanded panel (one shared anchor in
  // index.css) and a real button - the keyboard- and screen-reader-operable
  // control while collapsed (aria-expanded false, the state in its label);
  // the expanded panel is unmounted, so nothing hidden lingers in the
  // accessibility tree. Worker's choice: while the client is live the
  // circle shows the live tram count as a compact glanceable indicator -
  // the one thing the panel surfaces at a glance - updating with every
  // snapshot because this component re-renders on each one; a plain expand
  // chevron shows while loading, connecting, or errored.
  if (collapsed) {
    const liveCount =
      trams.error === null && trams.status === "live"
        ? trams.positions.length
        : null;
    const label =
      liveCount !== null
        ? `Show the live tram status panel, ${liveCount} trams`
        : trams.error !== null
          ? "Show the tram data error panel"
          : "Show the tram status panel";
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
          <span className="debug-panel-toggle__count">{liveCount}</span>
        ) : (
          <span className="debug-panel-toggle__chevron" aria-hidden="true" />
        )}
      </button>
    );
  }

  if (trams.error !== null) {
    return (
      <section aria-live="polite" className="debug-panel debug-panel--error">
        <div className="debug-panel__header">
          <h2>Tram data error</h2>
          <PanelCollapseButton
            buttonRef={collapseRef}
            onCollapse={() => setCollapsed(true)}
          />
        </div>
        <p>{trams.error.message}</p>
      </section>
    );
  }

  if (trams.status === "loading") {
    return (
      <section aria-live="polite" className="debug-panel">
        <div className="debug-panel__header">
          <p>Loading tram line metadata...</p>
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
        <div className="debug-panel__header">
          <p>Connecting to the tram position stream...</p>
          <PanelCollapseButton
            buttonRef={collapseRef}
            onCollapse={() => setCollapsed(true)}
          />
        </div>
      </section>
    );
  }

  // One live count per category for this render (TV-0012); computed once,
  // not per legend entry. TV-0013: the SpåraKoff bar tram is counted
  // separately - the snapshot dedups per vehicle, so this is 0 or 1, and
  // the legend entry below is rendered only while the car is present.
  const counts = countByCategory(trams.positions);
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
      <div className="debug-panel__header">
        <p className="debug-panel__status">
          <span className="status-dot" aria-hidden="true" />
          Live &middot; {trams.positions.length} trams
          {trams.updatedAt !== null && (
            <> &middot; updated {trams.updatedAt.toLocaleTimeString()}</>
          )}
        </p>
        <PanelCollapseButton
          buttonRef={collapseRef}
          onCollapse={() => setCollapsed(true)}
        />
      </div>
      <ul className="legend" aria-label="Tram marker color legend">
        {TRAM_CATEGORY_LEGEND.map((category) => {
          // TV-0014: the Unknown type row renders only while an unknown
          // vehicle number is in the current snapshot - never a zero-count
          // row, the same conditional pattern as the SpåraKoff entry below.
          // The known category rows always render, with their live count.
          if (category.category === "UNKNOWN" && counts.UNKNOWN === 0) {
            return null;
          }
          return (
            <li key={category.category} className="legend__item">
              <span
                className={`legend__swatch legend__swatch--${category.category.toLowerCase()}`}
                aria-hidden="true"
              />
              {/* TV-0012: live count of trams of this type in the current
                  snapshot, prepended to the label from fleet.ts - the label
                  itself carries no count and no category letter. */}
              ({counts[category.category]}) {category.label}
            </li>
          );
        })}
        {/* TV-0013: the SpåraKoff bar tram has its own entry while car #175
            is in the current snapshot, in the TV-0012 format; it disappears
            entirely with the car - never a zero-count row. It sits with the
            type entries, before the out-of-service state entry. */}
        {sparakoffCount > 0 && (
          <li className="legend__item">
            <span
              className="legend__swatch legend__swatch--sparakoff"
              aria-hidden="true"
            />
            ({sparakoffCount}) {SPARAKOFF_LEGEND_LABEL}
          </li>
        )}
        {/* TV-0011: out-of-service trams keep their category color and
            replace the line number with a red dot - not a vehicle type, so
            it sits after the category entries. */}
        <li className="legend__item">
          <span
            className="legend__swatch legend__swatch--offline"
            aria-hidden="true"
          />
          Red dot — Not in service (shunting/testing)
        </li>
      </ul>
    </section>
  );
}
