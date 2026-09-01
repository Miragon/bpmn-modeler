import { Uri, Webview } from "vscode";

import { getNonce } from "@miragon/bpmn-modeler-core";

const BPMN_WEBVIEW_PATH = "bpmn-webview";
const DMN_WEBVIEW_PATH = "dmn-webview";
// Output directory name for the form webview build artefacts.
const FORM_WEBVIEW_PATH = "form-webview";

/**
 * Generates the HTML for the BPMN modeler webview, resolving asset URIs relative
 * to the extension's install directory. Theming is per-instance: the theme CSS
 * ships inside the main `index.css` bundle and the webview's host adapter sets
 * `data-bpmn-theme` from VS Code's body CSS classes — no `#theme-link` here.
 *
 * `initialPanelVisible` is the host's global properties-panel default seeding a
 * first-ever open: when `false`, the panel and its resizer render with the
 * `collapsed` class (and `width: 0`) so the panel never flashes visible before
 * the webview's JavaScript applies state. A webview carrying its own per-editor
 * `panelVisible` entry overrides this hint at runtime. Defaults to `true` for
 * safety (e.g. diff panes that hide the panel via CSS anyway).
 */
export function bpmnEditorUi(
    webview: Webview,
    extensionUri: Uri,
    initialPanelVisible: boolean = true,
): string {
    const baseUri = Uri.joinPath(extensionUri, BPMN_WEBVIEW_PATH);

    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.css"));

    const nonce = getNonce();
    const panelClass = initialPanelVisible
        ? "properties-panel-parent"
        : "properties-panel-parent collapsed";
    const resizerClass = initialPanelVisible ? "panel-resizer" : "panel-resizer collapsed";
    const panelStyle = initialPanelVisible ? "" : ` style="width: 0"`;

    // The script must load as a module: the bundle code-splits the lazy
    // bpmnlint chunk, whose URL is resolved via import.meta.url — a syntax
    // error in a classic script. Matches the IntelliJ host.
    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <link href="${styleUri}" rel="stylesheet"/>
                <title>BPMN Modeler</title>
            </head>
            <body>
                <div class="content with-diagram" id="js-drop-zone">
                    <div class="canvas" id="js-canvas"></div>
                    <div id="js-panel-resizer" class="${resizerClass}"></div>
                    <div class="${panelClass}" id="js-properties-panel"${panelStyle}></div>
                </div>
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
            </body>
        </html>
    `;
}

/** Generates the HTML for the DMN modeler webview. */
export function dmnModelerHtml(
    webview: Webview,
    extensionUri: Uri,
    initialPanelVisible: boolean = true,
): string {
    const baseUri = Uri.joinPath(extensionUri, DMN_WEBVIEW_PATH);

    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleResetUri = webview.asWebviewUri(Uri.joinPath(extensionUri, "assets", "reset.css"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.css"));
    // Initial stylesheet is always light; the webview's `initTheme()` swaps it
    // to `darkTheme.css` at runtime via the `#theme-link` element.
    const themeUri = webview.asWebviewUri(Uri.joinPath(baseUri, "lightTheme.css"));

    const nonce = getNonce();
    const panelClass = initialPanelVisible
        ? "properties-panel-parent"
        : "properties-panel-parent collapsed";
    const resizerClass = initialPanelVisible ? "panel-resizer" : "panel-resizer collapsed";
    const panelStyle = initialPanelVisible ? "" : ` style="width: 0"`;

    return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>

                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleUri}" rel="stylesheet" type="text/css" />
                <link href="${themeUri}" rel="stylesheet" type="text/css" id="theme-link" />

                <title>DMN Modeler</title>
            </head>
            <body>
                <div class="content with-diagram" id="js-drop-zone">
                    <div class="canvas" id="js-canvas"></div>
                    <div id="js-panel-resizer" class="${resizerClass}"></div>
                    <div class="${panelClass}" id="js-properties-panel"${panelStyle}></div>
                </div>
                <script type="text/javascript" src="${scriptUri}" nonce="${nonce}"></script>
            </body>
            </html>
        `;
}

/** Generates the sandboxed HTML shell for the form editor webview. */
export function formEditorHtml(webview: Webview, extensionUri: Uri): string {
    const baseUri = Uri.joinPath(extensionUri, FORM_WEBVIEW_PATH);
    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "styles.css"));
    const nonce = getNonce();

    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob: https:; font-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src https:; frame-src https:; object-src blob:;" />
                <link href="${styleUri}" rel="stylesheet" />
                <title>Form Editor</title>
            </head>
            <body>
                <div id="app"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
        </html>
    `;
}
