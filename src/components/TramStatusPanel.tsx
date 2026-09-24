import type { TramPosition } from "../lib/digitransit.ts";
import type { TramPositionsState } from "../hooks/useTramPositions";
import {
  TRAM_CATEGORY_LEGEND,
  tramCategoryInfo,
  type TramCategory,
} from "../lib/fleet.ts";

/** Live per-type counts for the legend (TV-0012), derived from the current
 * positions snapshot on every render - no state of their own: the panel
 * re-renders exactly when the snapshot changes (see useTramPositions), so
 * the counts are always in sync with the map markers. Unknown vehicle
 * numbers (including malformed ones) tally into UNKNOWN via the fleet
 * resolver. */
function countByCategory(
  positions: TramPosition[],
): Record<TramCategory, number> {
  const counts: Record<TramCategory, number> = { A: 0, B: 0, C: 0, UNKNOWN: 0 };
  for (const position of positions) {
    counts[tramCategoryInfo(position.vehicleNumber).category] += 1;
  }
  return counts;
}

/** Compact status indicator for the live tram data client (TV-0004): one
 * status line while live, an error box when the client fails - most
 * importantly the missing or rejected digitransit API key - and progress
 * text while the metadata query or the MQTT subscription is still coming
 * up. While live it also shows the color legend for the tram rolling
 * stock categories shown on the map markers (TV-0009), each with its
 * live count of trams currently in the snapshot (TV-0012), and the red
 * not-in-service dot entry for out-of-service trams (TV-0011). Tram
 * positions themselves render as map markers (TV-0005). */
export function TramStatusPanel({ trams }: { trams: TramPositionsState }) {
  if (trams.error !== null) {
    return (
      <section aria-live="polite" className="debug-panel debug-panel--error">
        <h2>Tram data error</h2>
        <p>{trams.error.message}</p>
      </section>
    );
  }

  if (trams.status === "loading") {
    return (
      <section aria-live="polite" className="debug-panel">
        <p>Loading tram line metadata...</p>
      </section>
    );
  }

  if (trams.status === "connecting") {
    return (
      <section aria-live="polite" className="debug-panel">
        <p>Connecting to the tram position stream...</p>
      </section>
    );
  }

  // One live count per category for this render (TV-0012); computed once,
  // not per legend entry.
  const counts = countByCategory(trams.positions);

  return (
    <section
      aria-live="polite"
      className="debug-panel"
      aria-label="Live tram data status"
    >
      <p className="debug-panel__status">
        <span className="status-dot" aria-hidden="true" />
        Live &middot; {trams.positions.length} trams
        {trams.updatedAt !== null && (
          <> &middot; updated {trams.updatedAt.toLocaleTimeString()}</>
        )}
      </p>
      <ul className="legend" aria-label="Tram marker color legend">
        {TRAM_CATEGORY_LEGEND.map((category) => (
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
        ))}
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
