import { Event, Uri } from "vscode";

/**
 * Public API surface returned from this extension's `activate()` function.
 * Other extensions can subscribe via:
 *
 *     const ext = extensions.getExtension<BpmnModelerApi>("miragon-gmbh.vs-code-bpmn-modeler");
 *     const api = await ext.activate();
 *     api.onDidChangeSelection(({ uri, elementId }) => { ... });
 *
 */
export interface BpmnModelerApi {
    /**
     * Fires when the user selects a BPMN element inside the modeler webview.
     * `elementId` is `undefined` when the canvas background is selected.
     */
    readonly onDidChangeSelection: Event<{ uri: Uri; elementId?: string }>;
}
