/**
 * The map page's layer-visibility toggles (TV-0019 requirement 9, the
 * 2026-10-12 user scope expansion): two round buttons in a vertical group
 * pinned directly above the status strip's collapsed pill anchor - the same
 * `left` as the strip and a higher `bottom`, at the strip's z-index tier
 * (the shared anchor values and the non-overlap arithmetic live in
 * index.css). The button look mirrors the collapsed pill: a 2.5rem oval
 * with the pill's border, background and shadow, so while the strip is
 * collapsed the corner shows three vertically arranged ovals.
 *
 * "HM" toggles the punctuality heatmap (TV-0028), "TO" the tram line
 * overlay (TV-0019); each carries an indicator dot - green while its layer
 * shows, gray while it is off - and both default ON. The state is
 * per-session state owned by MapPage (nothing persisted; the app-wide rule):
 * MapPage passes it here for the UI and into MapView, whose effects forward
 * it to the layers' `setEnabled` - this component never touches the layers
 * itself. `aria-pressed` carries the state and the accessible name spells
 * it out ("Toggle the punctuality heatmap, on"), so the visible two-letter
 * mnemonic never has to be announced; the controls are real <button>s, so
 * Enter/Space operate them for free. The marker layer is deliberately not
 * toggleable: the tram positions are the app's core read (requirement 9).
 */

/** The two buttons' visible mnemonics, chosen per the user's design. */
const HEATMAP_LABEL = "HM";
const OVERLAY_LABEL = "TO";

export function MapLayerToggles({
  heatmapOn,
  overlayOn,
  onToggleHeatmap,
  onToggleOverlay,
}: {
  heatmapOn: boolean;
  overlayOn: boolean;
  onToggleHeatmap: () => void;
  onToggleOverlay: () => void;
}) {
  return (
    <div
      className="map-layer-toggles"
      role="group"
      aria-label="Map layer visibility"
    >
      <button
        type="button"
        className="map-layer-toggle"
        aria-pressed={heatmapOn}
        aria-label={`Toggle the punctuality heatmap, ${heatmapOn ? "on" : "off"}`}
        onClick={onToggleHeatmap}
      >
        <span className="map-layer-toggle__dot" aria-hidden="true" />
        {HEATMAP_LABEL}
      </button>
      <button
        type="button"
        className="map-layer-toggle"
        aria-pressed={overlayOn}
        aria-label={`Toggle the tram line overlay, ${overlayOn ? "on" : "off"}`}
        onClick={onToggleOverlay}
      >
        <span className="map-layer-toggle__dot" aria-hidden="true" />
        {OVERLAY_LABEL}
      </button>
    </div>
  );
}
