import { WebviewPanel } from "vscode";

import { getContext } from "./extensionContext";
import { bpmnEditorUi, dmnModelerHtml, formEditorHtml } from "./WebviewHtml";
import { BPMN_VIEW_TYPE, DMN_VIEW_TYPE, FORM_VIEW_TYPE } from "@miragon/bpmn-modeler-core";

/**
 * Pure helper with no persistent state, so both `VsCodeEditorHandle` (editable
 * editors) and `BpmnDiffController` (readonly diff panes) can invoke it
 * independently without going through each other.
 *
 * @param initialPanelVisible When `false`, HTML renders the properties panel
 *   pre-collapsed so it never flashes visible on first paint. Honoured by both
 *   the BPMN and DMN editors; defaults to `true` (safe for diff panes).
 * @throws {Error} if `viewType` is unknown.
 */
export function bootstrapWebview(
    viewType: string,
    webviewPanel: WebviewPanel,
    initialPanelVisible: boolean = true,
): WebviewPanel {
    const webview = webviewPanel.webview;
    webview.options = { enableScripts: true };

    if (viewType === BPMN_VIEW_TYPE) {
        webview.html = bpmnEditorUi(webview, getContext().extensionUri, initialPanelVisible);
    } else if (viewType === DMN_VIEW_TYPE) {
        webview.html = dmnModelerHtml(webview, getContext().extensionUri, initialPanelVisible);
    } else if (viewType === FORM_VIEW_TYPE) {
        webview.html = formEditorHtml(webview, getContext().extensionUri);
    } else {
        throw new Error(`Unsupported view type: ${viewType}`);
    }

    return webviewPanel;
}
