import MapView from "./map/MapView";
import { TramStatusPanel } from "./components/TramStatusPanel";
import { useTramPositions } from "./hooks/useTramPositions";
import { useHashRoute } from "./hooks/useHashRoute";
import {
  UnknownRoute,
  VehicleOverview,
} from "./components/vehicle/VehicleOverview";

/**
 * The map page. It owns the live-data client (one MQTT subscription, one
 * metadata query) shared by the map markers and the status panel, and it is
 * mounted only when the route is the map: mounting it while the vehicle
 * overview is shown would open the network-wide position stream next to the
 * overview's vehicle-scoped one, which ADR-0004 forbids.
 */
function MapPage() {
  const trams = useTramPositions();
  return (
    <main className="app">
      <MapView positions={trams.positions} />
      <TramStatusPanel trams={trams} />
    </main>
  );
}

export default function App() {
  // The route is the URL fragment (ADR-0004); exactly one page is mounted, so
  // exactly one data client is open at a time.
  const route = useHashRoute();
  if (route.view === "vehicle") {
    return (
      <VehicleOverview
        // Keying by identity makes a different vehicle a fresh mount: no
        // stale telemetry from the previous vehicle can survive the switch.
        key={`${route.operatorId}/${route.vehicleNumber}`}
        operatorId={route.operatorId}
        vehicleNumber={route.vehicleNumber}
      />
    );
  }
  if (route.view === "unknown") return <UnknownRoute hash={route.hash} />;
  return <MapPage />;
}
