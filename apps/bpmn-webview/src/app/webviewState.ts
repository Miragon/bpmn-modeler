/**
 * @internal Host-adapter surface — persisted webview UI state shapes consumed by
 * `WebviewStateManager`. Not part of the designed public API (#1375).
 */

export interface ViewportData {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Persisted so the exact zoom survives a container-size change on restore. */
    scale?: number;
}

/**
 * Snapshot of the canvas view that can be captured from the live
 * modeler and re-applied after a re-import (undo/redo, XML push,
 * language switch) to preserve the user's drill-down plane, viewport,
 * and selection.
 */
export interface CanvasViewState {
    rootElementId?: string;
    viewport: ViewportData;
    selectedElementIds: string[];
}

/**
 * Webview state persisted via the host's `setState` / `getState`.
 */
export interface WebviewState {
    rootElementId?: string;
    viewport?: ViewportData;
    selectedElementIds?: string[];
    panelScroll?: number;
    expandedGroupIndexes?: number[];
}
