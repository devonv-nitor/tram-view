/**
 * TV-0017: the app's URL contract, decided in Docs/ADR/0004-vehicle-overview-page.md.
 * Tram View has no routing dependency and GitHub Pages serves no SPA fallback,
 * so the route lives in the URL fragment, which never reaches the server:
 *
 * - no hash (or an empty one) -> the map page, exactly as before;
 * - `#/vehicle/<oper>/<veh>` -> the vehicle overview for those integers;
 * - anything else -> an explicit "unknown vehicle" state, never a silent
 *   fallback to the map and never a throw.
 */

/** The parsed route. */
export type AppRoute =
  | { view: "map" }
  | { view: "vehicle"; operatorId: number; vehicleNumber: number }
  | { view: "unknown"; hash: string };

const VEHICLE_ROUTE = /^#\/vehicle\/(\d+)\/(\d+)$/;

/** Parses a `location.hash` value into a route. Deliberately strict: the two
 * ids must be plain non-negative integers, and nothing may follow them. */
export function parseHashRoute(hash: string): AppRoute {
  if (hash === "" || hash === "#" || hash === "#/") return { view: "map" };
  const match = VEHICLE_ROUTE.exec(hash);
  if (match === null) return { view: "unknown", hash };
  const operatorId = Number(match[1]);
  const vehicleNumber = Number(match[2]);
  if (
    !Number.isSafeInteger(operatorId) ||
    !Number.isSafeInteger(vehicleNumber)
  ) {
    return { view: "unknown", hash };
  }
  return { view: "vehicle", operatorId, vehicleNumber };
}

/** The overview's URL for one vehicle. Ids are unpadded, matching the vehicle
 * identity the app and the HFP topic filter are built from. */
export function vehicleOverviewHash(
  operatorId: number,
  vehicleNumber: number,
): string {
  return `#/vehicle/${operatorId}/${vehicleNumber}`;
}
