/**
 * Punctuality heatmap layer (TV-0028): a canvas overlay showing how
 * "on-time" the network is at a glance — one soft radial blob per
 * contributing vehicle, green where trams run ahead of their timetable,
 * red where they run behind, transparent where they are on time.
 *
 * Data: no new request. Every HFP `vp` message already carries `dl` (schedule
 * deviation, seconds, positive = ahead), which the snapshot carries as
 * `TramPosition.scheduleDeviation` (src/lib/digitransit.ts) — the same field
 * the popup's Deviation cell renders (TV-0023). The layer is a pure renderer
 * over the same state the markers read.
 *
 * Honesty (mirrored in Docs/digitransit.md): `dl` is only recomputed at stop
 * events, so a vehicle colors the map with its last-reported deviation, which
 * can lag reality by up to a stop event. Only vehicles currently reporting a
 * deviation color the map; an uncolored area is not "on time" — it is "no
 * reporting tram here right now".
 *
 * Exclusions (the user's opetusajo filter, 2026-10-08): a position
 * contributes only when its `scheduleDeviation` is reported, the vehicle is
 * not the SpåraKoff bar tram (a tourist cruise with no timetable —
 * isSparakoffBarTram, src/lib/fleet.ts), and |dl| <= MAX_CONTRIBUTING_DL_S.
 * Values beyond the clamp are excluded entirely, not clamped into the scale.
 *
 * Rendering: one Leaflet pane at z 250 (above the basemap, below TV-0019's
 * route overlay tier and the markers — the pane order across tasks is
 * tilePane 200 < heatmap 250 < route-overlay 400 < markerPane 600), one
 * <canvas> sized to the viewport, pointer-events: none, full redraw per
 * snapshot (~1/s; the fleet is small, simplicity wins) and on zoom/move so
 * blobs stay geographically anchored. No toggle, no legend entry: always-on,
 * per ADR-0001's overlay precedent.
 */
import L from "leaflet";
import type { TramPosition } from "../lib/digitransit.ts";
import { isSparakoffBarTram } from "../lib/fleet.ts";

/** A vehicle whose |dl| exceeds this (seconds) contributes nothing: HSL's
 * training/testing runs (opetusajo) report against no real timetable, and a
 * legitimately very-late vehicle beyond ±15 min is equally unusable as a
 * "nearby punctuality" signal. The user's 2026-10-08 threshold. */
const MAX_CONTRIBUTING_DL_S = 900;

/** |dl| below this (seconds) renders no blob: near-timetable is the neutral
 * state and painting a color for it would only add noise. Recorded as a
 * constant so the user can tune it at review. */
const NEUTRAL_DL_S = 20;

/** Blob radius in meters: the field is a soft area read, not a pin (the
 * user's design intent). Converted to pixels per render via the current
 * zoom, so the geographic size stays constant while the map scales. */
const BLOB_RADIUS_M = 250;

/** Behind-schedule color (the app's out-of-service red, --tram-type-offline
 * in src/index.css). Fixed like the marker colors: the basemap under the
 * blobs is always light. */
const BEHIND_COLOR = "#d32f2f";

/** Ahead-of-schedule color — #34d399, the popup's ahead tone (DeviationTone
 * "ahead" in src/lib/format.ts), chosen over the darker #137333 so the
 * blob reads at low alpha on the light basemap. */
const AHEAD_COLOR = "#34d399";

/** Peak blob alpha at |dl| = MAX_CONTRIBUTING_DL_S; the ramp is linear in
 * |dl| from 0 at the deadband to this at the clamp. Low enough to keep the
 * basemap readable underneath, high enough to read as a field. */
const PEAK_ALPHA = 0.35;

/** The heatmap's own pane name and z-index, slotted between the basemap and
 * everything else (tilePane 200 < this 250 < overlayPane 400 < markerPane
 * 600). TV-0019's route overlay merge must keep its tier between 250 and
 * 600; its current branch uses the overlayPane default (400), which already
 * satisfies that. */
const PANE_NAME = "punctuality-heatmap";
const PANE_Z = 250;

/** Renders the punctuality field for the map page. Construct once per map;
 * call update(positions) on every snapshot tick. */
export class PunctualityHeatmapLayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly pane: HTMLElement;
  private mapSize: L.Point | null = null;

  constructor(private readonly map: L.Map) {
    map.createPane(PANE_NAME);
    this.pane = map.getPane(PANE_NAME) as HTMLElement;
    this.pane.style.zIndex = String(PANE_Z);
    // Display-only: the layer never intercepts a click or hover.
    this.pane.style.pointerEvents = "none";

    this.canvas = L.DomUtil.create(
      "canvas",
      "punctuality-heatmap-canvas",
    ) as HTMLCanvasElement;
    this.canvas.style.position = "absolute";
    this.pane.appendChild(this.canvas);

    // The blobs are tied to geographic points: on any viewport change the
    // canvas geometry is stale, so re-place and re-size the canvas, then
    // redraw immediately when a snapshot is already held.
    this.map.on("zoomend moveend resize", this.handleViewportChange, this);
    this.reposition();
  }

  /** Re-renders the field for one snapshot. A new array arrives only when
   * the snapshot changed (useTramPositions), so this runs ~1/s and never on
   * no-op ticks. */
  update(positions: TramPosition[]): void {
    this.render(positions);
  }

  /** Removes the pane and unbinds the listeners; called on map teardown. */
  dispose(): void {
    this.map.off("zoomend moveend resize", this.handleViewportChange, this);
    this.pane.remove();
  }

  private handleViewportChange(): void {
    this.reposition();
    // Redraw with the last snapshot so the field never sits empty after a
    // viewport change; the positions are held by the caller (MapView feeds
    // every tick), so the layer re-renders from them via the map events.
    if (this.lastPositions !== null) {
      this.render(this.lastPositions);
    }
  }

  /** The last snapshot, kept so viewport events can redraw without waiting
   * for the next tick. */
  private lastPositions: TramPosition[] | null = null;

  /** Places the canvas at the viewport's layer-space top-left with the
   * viewport's layer-space size. The canvas lives inside the transformed
   * map pane, so coordinates drawn on it are LAYER points; anchoring the
   * canvas itself to the viewport's layer-space origin keeps the drawn
   * layer-space geometry aligned with the screen (drawing container points
   * onto a pane child would apply the pane's pan translation twice). */
  private reposition(): void {
    const topLeft = this.map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.canvas, topLeft);
    this.resize();
  }

  /** Sizes the canvas bitmap to the viewport (DPR-scaled) and records the
   * viewport size. Called from reposition() on every viewport change; the
   * size rarely changes, so the bitmap write is skipped when unchanged. */
  private resize(): void {
    const size = this.map.getSize();
    if (
      this.mapSize !== null &&
      this.mapSize.x === size.x &&
      this.mapSize.y === size.y
    ) {
      return;
    }
    this.mapSize = size;
    // The bitmap is viewport-sized and DPR-scaled so gradients stay crisp
    // on retina displays; the CSS size comes from
    // .punctuality-heatmap-canvas (100% of the pane).
    this.canvas.width = Math.round(size.x * dprSafe());
    this.canvas.height = Math.round(size.y * dprSafe());
  }

  private render(positions: TramPosition[]): void {
    this.lastPositions = positions;
    const size = this.mapSize;
    if (size === null) return;
    const ctx = this.canvas.getContext("2d");
    if (ctx === null) return;

    const dpr = dprSafe();
    if (this.canvas.width !== Math.round(size.x * dpr)) {
      this.canvas.width = Math.round(size.x * dpr);
      this.canvas.height = Math.round(size.y * dpr);
    }
    // Canvas transforms do not survive a width set, so re-scale each pass.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, size.x, size.y);
    ctx.globalCompositeOperation = "lighter";
    ctx.filter = "blur(24px)";

    for (const position of positions) {
      const dl = position.scheduleDeviation;
      if (dl === null) continue;
      if (isSparakoffBarTram(position)) continue;
      const absDl = Math.abs(dl);
      if (absDl > MAX_CONTRIBUTING_DL_S) continue;
      if (absDl < NEUTRAL_DL_S) continue;

      // dl -> color + alpha. Linear ramp: 0 at the deadband, PEAK_ALPHA at
      // the ±900 s clamp.
      const t = (absDl - NEUTRAL_DL_S) / (MAX_CONTRIBUTING_DL_S - NEUTRAL_DL_S);
      const color = dl < 0 ? BEHIND_COLOR : AHEAD_COLOR;
      const alpha = PEAK_ALPHA * t;

      const point = this.map.latLngToLayerPoint([position.lat, position.lon]);
      // Cull against the viewport's layer-space rectangle: the canvas is
      // anchored at the viewport's layer-space top-left (reposition()).
      const topLeft = this.map.containerPointToLayerPoint([0, 0]);
      const radiusPx = this.metersToPixels(BLOB_RADIUS_M);
      if (
        point.x < topLeft.x - radiusPx ||
        point.x > topLeft.x + size.x + radiusPx ||
        point.y < topLeft.y - radiusPx ||
        point.y > topLeft.y + size.y + radiusPx
      ) {
        continue;
      }
      // Canvas coordinates are layer points minus the canvas's own layer
      // origin, so the drawn blob lands on the vehicle's geographic spot.
      const cx = point.x - topLeft.x;
      const cy = point.y - topLeft.y;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
      gradient.addColorStop(0, withAlpha(color, alpha));
      gradient.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Meters to on-screen pixels at the current zoom, from the map's own
   * CRS scale: metersPerPixel = 40075016.686 * cos(lat) / 2^(z+8) at the
   * map's center. Good enough for a 250 m soft blob. */
  private metersToPixels(meters: number): number {
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const metersPerPixel =
      (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** (zoom + 8);
    return meters / metersPerPixel;
  }
}

/** The current device pixel ratio (>= 1), read at call time so a
 * cross-monitor drag re-scales correctly. */
function dprSafe(): number {
  return window.devicePixelRatio || 1;
}

/** #rrggbb -> rgba(r, g, b, a), one small helper so the color constants
 * stay readable hex values. */
function withAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}
