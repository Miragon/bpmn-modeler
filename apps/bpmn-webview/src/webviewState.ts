/**
 * @internal Host-adapter surface — persisted webview UI state shapes consumed by
 * `WebviewStateManager`. Not part of the public modeler API.
 */

import type { ViewportData } from "@miragon/bpmn-modeler";

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
    /**
     * Per-editor properties-panel visibility. Absent until the user first
     * toggles the panel in this editor; while absent the editor follows the
     * host's global default (`propertiesPanelVisible`). Present entry wins over
     * that default so two tabs in one group keep independent panel state.
     */
    panelVisible?: boolean;
}
