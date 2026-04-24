import { WebviewPanel } from "vscode";

import { getContext } from "./extensionContext";
import { bpmnEditorUi, dmnModelerHtml } from "./WebviewHtml";

/** VS Code view-type identifier for the BPMN custom editor. */
const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";
/** VS Code view-type identifier for the DMN custom editor. */
const DMN_VIEW_TYPE = "bpmn-modeler.dmn";

/**
 * Enables scripting and installs the correct HTML on the given webview panel
 * based on its view type.
 *
 * Pure helper with no persistent state: safe for both `EditorStore`
 * (editable editors) and `BpmnDiffService` (readonly diff panes) to invoke
 * without going through each other.
 *
 * @param viewType VS Code view-type identifier (e.g. `"bpmn-modeler.bpmn"`).
 * @param webviewPanel The panel to bootstrap.
 * @param initialPanelVisible Only consulted for BPMN editors: the globally
 *   persisted properties-panel default.  When `false`, the HTML renders the
 *   panel pre-collapsed so it never flashes visible on first paint.  Ignored
 *   for DMN and defaults to `true` for safety (diff panes).
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
        webview.html = bpmnEditorUi(
            webview,
            getContext().extensionUri,
            initialPanelVisible,
        );
    } else if (viewType === DMN_VIEW_TYPE) {
        webview.html = dmnModelerHtml(webview, getContext().extensionUri);
    } else {
        throw new Error(`Unsupported view type: ${viewType}`);
    }

    return webviewPanel;
}
