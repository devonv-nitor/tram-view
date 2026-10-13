/**
 * HSL metro rolling stock (TV-0029): which metro train type a vehicle number
 * belongs to, its model label and its car count, and the metro marker color.
 *
 * The sibling of src/lib/fleet.ts (which stays tram-only): metro reaches the
 * app through the same HFP topic shape (mode level `metro`, operator 50) and
 * the same VP payload, so its vehicle identity is oper + veh exactly like a
 * tram's, and `vehicleKey` collides with no tram (tram operator 40 and the
 * other tram operators never number 50; verified against the live feed: metro
 * `oper` is 50 in every sample). The metro routes resolve through the same
 * per-session route index the trams use, so nothing here touches routing.
 *
 * Category source (user-supplied ranges, corroborated live 2026-10-12,
 * evidence in the TV-0029 task file): metro publishes no model field - the
 * vehicle identity is oper + veh only, like trams - so the class comes from
 * the vehicle number the client already parses. This is a rendering-only
 * choice (Docs/ADR/0001-map-library.md), not a change to the transport or
 * load picture. The live window measured 18 M100, 4 M200, 13 M300 and zero
 * outside the ranges; a number outside them resolves to null and the marker
 * renders the red not-in-service dot (the TV-0029 review round's
 * requirement-8 rule, shared with the marker layer and the strip through
 * isVehicleOutOfService) with the honest "Unknown metro type" tooltip. The
 * tram side is deliberately different: an unknown tram number renders the
 * gray UNKNOWN body without the dot (TV-0009, unchanged).
 */

/** The HFP operator id of HSL metro (every metro vp payload reports it). */
export const METRO_OPERATOR_ID = 50;

/** Metro train classes (user-supplied vehicle-number ranges, corroborated
 * live): M100 = 101-184, M200 = 201-224, M300 = 301-325. Ranges are explicit
 * rather than first-match so an unlisted number resolves to null instead of
 * being absorbed by a neighboring range. */
export type MetroClass = "M100" | "M200" | "M300";

export interface MetroClassInfo {
  /** The class id, e.g. "M100" - the tooltip's model label and the chip's
   * short label. Plain model labels, no marketing strings. */
  label: string;
  /** Cars per trainset: M100/M200 are two-car sets, M300 four-car sets.
   * A static property of the class (the permanently coupled sets publish as
   * one vehicle; the feed carries no per-car data - `seq` is always 1). */
  carCount: number;
}

const METRO_CLASS_INFO: Record<MetroClass, MetroClassInfo> = {
  M100: { label: "M100", carCount: 2 },
  M200: { label: "M200", carCount: 2 },
  M300: { label: "M300", carCount: 4 },
};

const METRO_CLASS_RANGES: { min: number; max: number; klass: MetroClass }[] = [
  { min: 101, max: 184, klass: "M100" },
  { min: 201, max: 224, klass: "M200" },
  { min: 301, max: 325, klass: "M300" },
];

/** Resolves a metro vehicle number to its class info, or null when the
 * number is not in any mapped range (rendered as the red not-in-service
 * dot, never silently relabeled - see isVehicleOutOfService) - and so are
 * malformed values (non-integer, negative). */
export function metroVehicleClass(
  vehicleNumber: number,
): MetroClassInfo | null {
  if (!Number.isInteger(vehicleNumber) || vehicleNumber < 0) return null;
  for (const range of METRO_CLASS_RANGES) {
    if (vehicleNumber >= range.min && vehicleNumber <= range.max) {
      return METRO_CLASS_INFO[range.klass];
    }
  }
  return null;
}

/** The class's model-family name: M100 = "Rotary DC", M200 = "C20",
 * M300 = "R320" (the user-supplied mappings). The unknown case is null. */
export function metroModelName(vehicleNumber: number): string | null {
  const info = metroVehicleClass(vehicleNumber);
  if (info === null) return null;
  switch (info.label) {
    case "M100":
      return "Rotary DC";
    case "M200":
      return "C20";
    case "M300":
      return "R320";
    default:
      return null;
  }
}

/** The tooltip text for one metro vehicle: "M100 (Rotary DC) · 2 cars",
 * the model label with its model family in parentheses - plain labels, no
 * marketing strings. Unknown numbers say so explicitly. The model family
 * names (Rotary DC, C20, R320) are the user-supplied mappings for the
 * tooltip; the range lookup above is the class identity. */
export function metroClassTooltip(vehicleNumber: number): string {
  const info = metroVehicleClass(vehicleNumber);
  if (info === null) return "Unknown metro type";
  const cars = `${info.carCount} car${info.carCount === 1 ? "" : "s"}`;
  switch (info.label) {
    case "M100":
      return `M100 (Rotary DC) · ${cars}`;
    case "M200":
      return `M200 (C20) · ${cars}`;
    case "M300":
      return `M300 (R320) · ${cars}`;
    default:
      return info.label;
  }
}

/** The metro marker's body color: HSL's official metro orange (user decision
 * 2026-10-12, recorded in TV-0029 requirement 3's amendment - it supersedes
 * the task's original blue). One color for all three classes - the classes
 * are distinguishable by tooltip/vehicle number, and three shades would be
 * indistinguishable at marker scale; per-class colors would be a
 * one-constant change per class at review. Fixed like the tram marker
 * colors: the basemap under the markers is always light. */
export const METRO_MARKER_COLOR = "#f15f22";
