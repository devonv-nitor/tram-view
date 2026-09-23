import { useTramPositions } from "../hooks/useTramPositions";

/** Small debug panel surfacing the tram data client (TV-0004). The map view
 * and tram markers are TV-0005's scope. */
export function TramDebugPanel() {
  const { status, positions, error, updatedAt } = useTramPositions();

  if (error !== null) {
    return (
      <section aria-live="polite" className="debug-panel debug-panel--error">
        <h2>Tram data error</h2>
        <p>{error.message}</p>
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section aria-live="polite" className="debug-panel">
        <p>Loading tram line metadata...</p>
      </section>
    );
  }

  if (status === "connecting") {
    return (
      <section aria-live="polite" className="debug-panel">
        <p>Connecting to the tram position stream...</p>
      </section>
    );
  }

  return (
    <section aria-live="polite" className="debug-panel">
      <h2>Tram positions (debug)</h2>
      <p>
        {positions.length} trams tracked
        {updatedAt !== null && <> · updated {updatedAt.toLocaleTimeString()}</>}
      </p>
      <ul>
        {positions.slice(0, 8).map((position) => (
          <li key={`${position.operatorId}/${position.vehicleNumber}`}>
            Line {position.routeShortName}, vehicle {position.operatorId}/
            {position.vehicleNumber} at {position.lat.toFixed(5)},
            {position.lon.toFixed(5)}
          </li>
        ))}
      </ul>
      <p>The full snapshot is logged to the devtools console every second.</p>
    </section>
  );
}
