import { Uri, Webview, WebviewPanel } from "vscode";

import type { WebviewSurface } from "@miragon/bpmn-modeler-shared";

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

export type DiffPaneSurface = Extract<WebviewSurface, "bpmnDiffPane" | "dmnDiffPane">;

/** A custom editor's page. Only the BPMN and DMN editors have a properties panel to collapse. */
interface EditorPage {
    readonly viewType: string;
    readonly initialPanelVisible: boolean;
}

/** One side of a diff, read-only and with no collapsed panel. */
interface DiffPanePage {
    readonly diffPane: DiffPaneSurface;
}

export type WebviewPage = EditorPage | DiffPanePage;

const DIFF_PANE_VIEW_TYPES: Record<DiffPaneSurface, string> = {
    bpmnDiffPane: BPMN_VIEW_TYPE,
    dmnDiffPane: DMN_VIEW_TYPE,
};

/**
 * Pure helper with no persistent state, so both `VsCodeEditorHandle` (editable
 * editors) and `WebviewPaneHandle` (readonly diff panes) can invoke it
 * independently without going through each other.
 *
 * @throws {Error} if the editor page's `viewType` is unknown.
 */
export function bootstrapWebview(webviewPanel: WebviewPanel, page: WebviewPage): WebviewPanel {
    const webview = webviewPanel.webview;
    const extensionUri = getContext().extensionUri;
    const viewType = "diffPane" in page ? DIFF_PANE_VIEW_TYPES[page.diffPane] : page.viewType;
    webview.options = {
        enableScripts: true,
        localResourceRoots: localResourceRootsFor(viewType, extensionUri),
    };
    webview.html =
        "diffPane" in page
            ? diffPaneHtml(page.diffPane, webview, extensionUri)
            : editorHtml(page, webview, extensionUri);

    return webviewPanel;
}

function editorHtml(page: EditorPage, webview: Webview, extensionUri: Uri): string {
    switch (page.viewType) {
        case BPMN_VIEW_TYPE:
            return bpmnEditorUi(webview, extensionUri, page.initialPanelVisible);
        case DMN_VIEW_TYPE:
            return dmnModelerHtml(webview, extensionUri, {
                surface: "dmnEditor",
                initialPanelVisible: page.initialPanelVisible,
            });
        case ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE:
            return elementTemplateEditorHtml(webview, extensionUri);
        default:
            return formEditorHtml(webview, extensionUri);
    }
}

function diffPaneHtml(surface: DiffPaneSurface, webview: Webview, extensionUri: Uri): string {
    switch (surface) {
        // The BPMN page learns it is a diff pane from its first file query.
        case "bpmnDiffPane":
            return bpmnEditorUi(webview, extensionUri);
        case "dmnDiffPane":
            return dmnModelerHtml(webview, extensionUri, { surface: "dmnDiffPane" });
    }
}

function localResourceRootsFor(viewType: string, extensionUri: Uri): Uri[] {
    switch (viewType) {
        case BPMN_VIEW_TYPE:
            return [
                Uri.joinPath(extensionUri, "bpmn-webview"),
                bpmnPluginCacheUri(getContext().globalStorageUri),
            ];
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

/**
 * Approved plugin copies, addressed by content. The BPMN webview may load
 * files from here and never from a workspace folder.
 *
 * A `file:` URI although desktop VS Code hands out global storage as
 * `vscode-userdata:`: a webview loads a resource only below a root of the
 * same scheme, and the plugin URLs are made from file paths.
 */
export function bpmnPluginCacheUri(globalStorageUri: Uri): Uri {
    return Uri.file(Uri.joinPath(globalStorageUri, "bpmn-plugins").fsPath);
}
