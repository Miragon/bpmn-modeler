import { Event, Uri } from "vscode";

/**
 * Public API surface returned from this extension's `activate()` function.
 *
 * Other extensions can subscribe via:
 *
 *     const ext = extensions.getExtension<BpmnModelerApi>("miragon-gmbh.vs-code-bpmn-modeler");
 *     const api = await ext.activate();
 *     api.onDidChangeSelection(({ uri, elementId }) => { ... });
 *
 * Currently only the bpmn-iq plugin consumes this, but the surface is
 * intentionally minimal so future integrations don't have to import
 * extension-internal types.
 */
export interface BpmnModelerApi {
    /**
     * Fires when the user changes the BPMN element selection inside the
     * modeler webview.  `elementId` is `undefined` when the canvas
     * background is selected (no specific element).
     */
    readonly onDidChangeSelection: Event<{ uri: Uri; elementId?: string }>;
}
