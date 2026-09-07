/**
 * @internal Host-adapter surface — persisted webview UI state shapes consumed by
 * `WebviewStateManager`. Not part of the public modeler API.
 */

/**
 * Shape of the data persisted via `host.setState` / `host.getState`.
 */
export interface WebviewState {
    // Scroll position of `.bio-properties-panel-scroll-container`.
    panelScroll?: number;
    /**
     * Indexes (in render order) of `.bio-properties-panel-group` elements
     * that are currently expanded.  Keyed by position so it survives a
     * language switch — group labels are localised, indexes are not.
     */
    expandedGroupIndexes?: number[];
    /**
     * Per-editor properties-panel visibility. Absent until the user first
     * toggles the panel in this editor; while absent the editor follows the
     * host's global default (`dmnPropertiesPanelVisible`). Present entry wins.
     */
    panelVisible?: boolean;
}
