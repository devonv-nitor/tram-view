import { useState } from "react";
import MapView from "./map/MapView";
import { MapLayerToggles } from "./components/MapLayerToggles";
import { TramStatusPanel } from "./components/TramStatusPanel";
import { useTramPositions } from "./hooks/useTramPositions";
import { useHashRoute } from "./hooks/useHashRoute";
import {
  UnknownRoute,
  VehicleOverview,
} from "./components/vehicle/VehicleOverview";

/**
 * The map page. It owns the live-data clients (one MQTT subscription per
 * transport mode - tram and, since TV-0029, metro - and one metadata query)
 * shared by the map markers and the status panel, and it is
 * mounted only when the route is the map: mounting it while the vehicle
 * overview is shown would open the network-wide position streams next to the
 * overview's vehicle-scoped one, which ADR-0004 forbids.
 * TV-0019 requirement 9: it also owns the layer-visibility toggles'
 * per-session state - the buttons live in MapLayerToggles, the layers in
 * MapView, and this is the component above both - so the toggle state flows
 * down as props (default ON on every load, never persisted).
 */
function MapPage() {
  const trams = useTramPositions();
  const [heatmapOn, setHeatmapOn] = useState(true);
  const [overlayOn, setOverlayOn] = useState(true);
  return (
    <main className="app">
      <MapView
        positions={trams.positions}
        heatmapOn={heatmapOn}
        overlayOn={overlayOn}
      />
      <TramStatusPanel
        trams={trams}
        // TV-0019 req 9: the toggles render inside the strip's anchored
        // column (TramStatusPanel owns the anchor), so they sit above the
        // pill/strip and move with it as it expands and collapses. The
        // state itself stays here (MapPage) and reaches the layers through
        // MapView's props.
        toggles={
          <MapLayerToggles
            heatmapOn={heatmapOn}
            overlayOn={overlayOn}
            onToggleHeatmap={() => setHeatmapOn((on) => !on)}
            onToggleOverlay={() => setOverlayOn((on) => !on)}
          />
        }
      />
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
