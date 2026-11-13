import { Uri, Webview } from "vscode";

import {
    INITIALLY_COLLAPSED_PANEL_ATTRIBUTE,
    type WebviewSurface,
} from "@miragon/bpmn-modeler-shared";

import { webviewContentSecurityPolicy } from "../../domain/webviewContentSecurityPolicy";
import { createWebviewNonce } from "./webviewNonce";

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
 * first-ever open: when `false`, the empty `#app` carries the attribute that
 * mounts the panel collapsed, so it never flashes visible before the webview
 * applies its state. A webview carrying its own per-editor `panelVisible` entry
 * overrides this hint at runtime. Defaults to `true` (a diff pane has no panel).
 */
export function bpmnEditorUi(
    webview: Webview,
    extensionUri: Uri,
    initialPanelVisible: boolean = true,
): string {
    const baseUri = Uri.joinPath(extensionUri, BPMN_WEBVIEW_PATH);

    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.css"));

    const nonce = createWebviewNonce();
    const policy = webviewContentSecurityPolicy("bpmn", { cspSource: webview.cspSource, nonce });
    // The script must load as a module: the bundle code-splits its surfaces,
    // engine stacks and the lint stack into chunks whose URLs are resolved via
    // import.meta.url — a syntax error in a classic script. Matches the IntelliJ host.
    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <meta http-equiv="Content-Security-Policy" content="${policy}"/>
                <link href="${styleUri}" rel="stylesheet"/>
                <title>BPMN Modeler</title>
            </head>
            <body>
                ${editorRoot(initialPanelVisible)}
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
            </body>
        </html>
    `;
}

/** The DMN editor, its properties panel expanded unless the host hides it, or a DMN diff pane. */
export type DmnPage =
    | {
          readonly surface: Extract<WebviewSurface, "dmnEditor">;
          readonly initialPanelVisible?: boolean;
      }
    | { readonly surface: Extract<WebviewSurface, "dmnDiffPane"> };

/**
 * Generates the HTML for the DMN modeler webview. Theming is per-instance: the
 * theme CSS ships inside the main `index.css` bundle and the webview's host
 * adapter sets `data-dmn-theme` from VS Code's body CSS classes — no
 * `#theme-link`. The script loads as a module because the bundle may code-split
 * lazy chunks whose URL is resolved via import.meta.url (a syntax error in a
 * classic script); matches `bpmnEditorUi`.
 *
 * `page.surface` names the page on `<body data-surface>`: a diff pane boots the
 * read-only diff instead of the modeler and its properties panel.
 */
export function dmnModelerHtml(webview: Webview, extensionUri: Uri, page: DmnPage): string {
    const baseUri = Uri.joinPath(extensionUri, DMN_WEBVIEW_PATH);

    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleResetUri = webview.asWebviewUri(Uri.joinPath(extensionUri, "assets", "reset.css"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.css"));

    const nonce = createWebviewNonce();
    const policy = webviewContentSecurityPolicy("dmn", { cspSource: webview.cspSource, nonce });
    const initialPanelVisible =
        page.surface === "dmnDiffPane" ? true : (page.initialPanelVisible ?? true);

    return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <meta http-equiv="Content-Security-Policy" content="${policy}"/>

                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleUri}" rel="stylesheet" type="text/css" />

                <title>DMN Modeler</title>
            </head>
            <body data-surface="${page.surface}">
                ${editorRoot(initialPanelVisible)}
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;
}

/** The empty root the webview mounts its page into. */
function editorRoot(initialPanelVisible: boolean): string {
    const collapsed = initialPanelVisible ? "" : ` ${INITIALLY_COLLAPSED_PANEL_ATTRIBUTE}=""`;
    return `<div id="app"${collapsed}></div>`;
}

/**
 * The element-template preview: a second entry of the BPMN bundle that renders
 * its own page into `#app`, so it shares the bundle's stylesheet and policy.
 */
export function elementTemplateEditorHtml(webview: Webview, extensionUri: Uri): string {
    const baseUri = Uri.joinPath(extensionUri, BPMN_WEBVIEW_PATH);
    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "templateEditor.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.css"));
    const nonce = createWebviewNonce();
    const policy = webviewContentSecurityPolicy("bpmn", { cspSource: webview.cspSource, nonce });

    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <meta http-equiv="Content-Security-Policy" content="${policy}"/>
                <link href="${styleUri}" rel="stylesheet"/>
                <title>Element Template Editor</title>
            </head>
            <body>
                <div id="app"></div>
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
            </body>
        </html>
    `;
}

/** Generates the sandboxed HTML shell for the form editor webview. */
export function formEditorHtml(webview: Webview, extensionUri: Uri): string {
    const baseUri = Uri.joinPath(extensionUri, FORM_WEBVIEW_PATH);
    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "styles.css"));
    const nonce = createWebviewNonce();
    const policy = webviewContentSecurityPolicy("form", { cspSource: webview.cspSource, nonce });

    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <meta http-equiv="Content-Security-Policy" content="${policy}"/>
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
