import MapView from "./map/MapView";
import { TramDebugPanel } from "./components/TramDebugPanel";

export default function App() {
  return (
    <main className="app">
      <MapView />
      <TramDebugPanel />
    </main>
  );
}
