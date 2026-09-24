import type { TramPositionsState } from "../hooks/useTramPositions";

/** Compact status indicator for the live tram data client (TV-0004): one
 * status line while live, an error box when the client fails - most
 * importantly the missing or rejected digitransit API key - and progress
 * text while the metadata query or the MQTT subscription is still coming
 * up. Tram positions themselves render as map markers (TV-0005). */
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
    </section>
  );
}
