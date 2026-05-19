import { WebviewPanel } from "vscode";

import { getContext } from "./extensionContext";
import { bpmnEditorUi, dmnModelerHtml } from "./WebviewHtml";

const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";
const DMN_VIEW_TYPE = "bpmn-modeler.dmn";

/**
 * Pure helper with no persistent state, so both `EditorStore` (editable
 * editors) and `BpmnDiffService` (readonly diff panes) can invoke it
 * independently without going through each other.
 *
 * @param initialPanelVisible BPMN-only: when `false`, HTML renders the
 *   properties panel pre-collapsed so it never flashes visible on first
 *   paint. Ignored for DMN; defaults to `true` (safe for diff panes).
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
        webview.html = dmnModelerHtml(webview, getContext().extensionUri);
    } else {
        throw new Error(`Unsupported view type: ${viewType}`);
    }

    return webviewPanel;
}
