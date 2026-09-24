import MapView from "./map/MapView";
import { TramStatusPanel } from "./components/TramStatusPanel";
import { useTramPositions } from "./hooks/useTramPositions";

export default function App() {
  // One owner for the live-data client (one MQTT subscription, one metadata
  // query) shared by the map markers and the status panel.
  const trams = useTramPositions();
  return (
    <main className="app">
      <MapView positions={trams.positions} />
      <TramStatusPanel trams={trams} />
    </main>
  );
}
