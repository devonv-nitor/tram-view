/**
 * HSL rolling stock categories (TV-0009): which tram type a vehicle number
 * belongs to, and its advertised model name.
 *
 * Category source, live-verified (decision in Docs/ADR/0002-data-transport.md,
 * evidence in the TV-0009 commit record): neither the HFP VP payload (no
 * make/model/subtype field - the vehicle identity is oper + veh only) nor the
 * keyed Routing API GraphQL (no tram-vehicle query; the routes metadata is
 * per-line) identifies a vehicle's model, so categories come from the vehicle
 * number the TV-0004 client already parses - no extra request is made. This is
 * a rendering-only choice (Docs/ADR/0001-map-library.md), not a change to the
 * transport or load picture.
 */

/** Rolling stock categories: A = MLNRV I/II (one category), B = Škoda
 * Artic, C = Artic X54. B and C have similar advertised names but must be
 * uniquely identified, which the vehicle number ranges below guarantee. */
export type TramCategory = "A" | "B" | "C" | "UNKNOWN";

export interface TramCategoryInfo {
  category: TramCategory;
  /** Full advertised model name; null when the type is unknown. */
  model: string | null;
  /** Legend label for the status panel, e.g. "MLNRV I/II (Valmet)" - the
   * model name without any category letter (TV-0012: the letter is internal
   * bookkeeping; the panel prepends the live count itself). */
  label: string;
}

/** Vehicle-number ranges per category (TV-0009). Ranges are explicit rather
 * than first-match so that unlisted numbers (e.g. 5xx, 7xx+) resolve to
 * UNKNOWN instead of being absorbed by a neighboring range. */
const CATEGORY_RANGES: { min: number; max: number; category: TramCategory }[] =
  [
    { min: 0, max: 399, category: "A" },
    { min: 400, max: 499, category: "B" },
    { min: 600, max: 699, category: "C" },
  ];

const CATEGORY_INFO: Record<TramCategory, TramCategoryInfo> = {
  A: {
    category: "A",
    model: "MLNRV I/II (Valmet)",
    label: "MLNRV I/II (Valmet)",
  },
  B: {
    category: "B",
    model: "Škoda Transtech Artic",
    label: "Škoda Transtech Artic",
  },
  C: {
    category: "C",
    model: "Škoda Transtech Artic X54",
    label: "Škoda Transtech Artic X54",
  },
  UNKNOWN: {
    category: "UNKNOWN",
    model: null,
    label: "? Unknown type",
  },
};

/** Legend order for the status panel: the three known categories, then
 * unknown. */
export const TRAM_CATEGORY_LEGEND: readonly TramCategoryInfo[] = [
  CATEGORY_INFO.A,
  CATEGORY_INFO.B,
  CATEGORY_INFO.C,
  CATEGORY_INFO.UNKNOWN,
];

/** Resolves a vehicle number to its category and model. Unlisted numbers
 * (any range not mapped above, e.g. 5xx) resolve to UNKNOWN explicitly -
 * they are rendered as unknown, never silently relabeled - and so are
 * malformed values (negative, non-integer). */
export function tramCategoryInfo(vehicleNumber: number): TramCategoryInfo {
  if (!Number.isInteger(vehicleNumber) || vehicleNumber < 0) {
    return CATEGORY_INFO.UNKNOWN;
  }
  for (const range of CATEGORY_RANGES) {
    if (vehicleNumber >= range.min && vehicleNumber <= range.max) {
      return CATEGORY_INFO[range.category];
    }
  }
  return CATEGORY_INFO.UNKNOWN;
}

/** TV-0013: HSL car #175 is the SpåraKoff bar tram. It runs only at certain
 * times and its line designation is unknown to the user, so it is detected by
 * identity on the latest position - operator 40 (HSL) plus vehicle number 175
 * - never by `desi`, route id, or line metadata: the car number is the
 * reliable signal (user decision recorded in the TV-0013 commit evidence).
 * The special case wins over the CATEGORY_RANGES lookup above (car 175 would
 * otherwise classify as category A) while leaving every other number on the
 * plain range lookup. */
export const SPARAKOFF_OPERATOR_ID = 40;
export const SPARAKOFF_VEHICLE_NUMBER = 175;

/** The letter the bar tram's marker shows in place of the line number
 * (TV-0013). */
export const SPARAKOFF_MARKER_LETTER = "K";

/** Legend label for the bar tram's status-panel entry (TV-0013): the user's
 * spelling, which wins over the operator's own "Spårakoff". */
export const SPARAKOFF_LEGEND_LABEL = "SpåraKoff";

/** Minimal vehicle identity the SpåraKoff detection keys on; any position
 * shape (HFP messages and filtered TramPosition alike) satisfies it. */
export interface TramVehicleIdentity {
  operatorId: number;
  vehicleNumber: number;
}

/** True when the vehicle is the SpåraKoff bar tram (TV-0013). Consulted
 * before tramCategoryInfo by every consumer that renders vehicle identity:
 * the marker layer and the status-panel counts. */
export function isSparakoffBarTram(vehicle: TramVehicleIdentity): boolean {
  return (
    vehicle.operatorId === SPARAKOFF_OPERATOR_ID &&
    vehicle.vehicleNumber === SPARAKOFF_VEHICLE_NUMBER
  );
}
