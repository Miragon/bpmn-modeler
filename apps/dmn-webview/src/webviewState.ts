/**
 * @internal Host-adapter surface — the webview state persisted via
 * `host.setState` / `host.getState`. Not part of the public modeler API.
 *
 * DMN persists only properties-panel UI state; viewport and selection
 * round-tripping is not implemented for dmn-js.
 */
import type { PropertiesPanelUiState } from "@miragon/bpmn-modeler-shared";

export type WebviewState = PropertiesPanelUiState;
