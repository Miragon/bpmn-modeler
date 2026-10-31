import { Uri, WebviewPanel } from "vscode";

import { getContext } from "./extensionContext";
import {
    bpmnEditorUi,
    dmnModelerHtml,
    elementTemplateEditorHtml,
    formEditorHtml,
} from "./WebviewHtml";
import {
    BPMN_VIEW_TYPE,
    DMN_VIEW_TYPE,
    ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
    FORM_VIEW_TYPE,
} from "@miragon/bpmn-modeler-core";

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
    const extensionUri = getContext().extensionUri;
    webview.options = {
        enableScripts: true,
        localResourceRoots: localResourceRootsFor(viewType, extensionUri),
    };

    if (viewType === BPMN_VIEW_TYPE) {
        webview.html = bpmnEditorUi(webview, extensionUri, initialPanelVisible);
    } else if (viewType === DMN_VIEW_TYPE) {
        webview.html = dmnModelerHtml(webview, extensionUri, initialPanelVisible);
    } else if (viewType === ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE) {
        webview.html = elementTemplateEditorHtml(webview, extensionUri);
    } else {
        webview.html = formEditorHtml(webview, extensionUri);
    }

    return webviewPanel;
}

function localResourceRootsFor(viewType: string, extensionUri: Uri): Uri[] {
    switch (viewType) {
        case BPMN_VIEW_TYPE:
        case ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE:
            return [Uri.joinPath(extensionUri, "bpmn-webview")];
        case DMN_VIEW_TYPE:
            return [
                Uri.joinPath(extensionUri, "dmn-webview"),
                Uri.joinPath(extensionUri, "assets"),
            ];
        case FORM_VIEW_TYPE:
            return [Uri.joinPath(extensionUri, "form-webview")];
        default:
            throw new Error(`Unsupported view type: ${viewType}`);
    }
}
