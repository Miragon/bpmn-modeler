/**
 * @internal The webview UI state the host persists per editor. Not part of the
 * public modeler API.
 */

import type { ViewportData } from "@miragon/bpmn-modeler";
import type { PropertiesPanelUiState } from "@miragon/bpmn-modeler-shared";
import type { SurfaceMode } from "@miragon/bpmn-modeler-types";

/**
 * Webview state persisted via the host's `setState` / `getState`.
 */
export interface WebviewState extends PropertiesPanelUiState {
    rootElementId?: string;
    viewport?: ViewportData;
    selectedElementIds?: string[];
    /**
     * Per-editor surface mode (View / Design / Implement). Absent until first
     * resolved; seeded from the host's `defaultMode` on a first-ever open and
     * re-resolved against the engine on every rebuild via `resolveInitialMode`.
     */
    mode?: SurfaceMode;
}
