/**
 * @internal Host-adapter surface — the webview state persisted via
 * `host.setState` / `host.getState`. Not part of the public modeler API.
 *
 * DMN persists only properties-panel UI state; viewport and selection
 * round-tripping is not implemented for dmn-js.
 */
import type {
    DmnDiffPaneCommand,
    DmnEditorCommand,
    HostApi,
    PropertiesPanelUiState,
} from "@miragon/bpmn-modeler-shared";

export type WebviewState = PropertiesPanelUiState;

export type DmnHost = HostApi<WebviewState, DmnEditorCommand>;

/** The host of a page loaded as one side of a DMN diff: it posts only the diff pane's commands. */
export type DmnDiffPaneHost = HostApi<WebviewState, DmnDiffPaneCommand>;
