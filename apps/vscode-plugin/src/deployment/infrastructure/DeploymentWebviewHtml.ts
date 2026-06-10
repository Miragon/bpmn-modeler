import { Uri, Webview } from "vscode";
import { getNonce } from "@miragon/bpmn-modeler-core";

// Output directory name for the deployment webview build artefacts.
const DEPLOYMENT_WEBVIEW_PATH = "deployment-webview";

/**
 * Generates the HTML shell for the deployment sidebar WebviewView.
 *
 * Resolves asset URIs relative to the extension's install directory and
 * injects a nonce for the Content-Security-Policy `script-src` directive so
 * that only the bundled script can execute. The form body itself is rendered
 * by the bundle (`src/app/formTemplate.ts`), so this shell ships only an empty
 * `<div id="app">` — the single-source-of-markup contract every host honours.
 *
 * @param webview The VS Code Webview instance (used to convert local URIs).
 * @param extensionUri URI of the extension's install directory.
 * @returns HTML string to set as `webviewView.webview.html`.
 */
export function deploymentWebviewHtml(webview: Webview, extensionUri: Uri): string {
    const baseUri = Uri.joinPath(extensionUri, DEPLOYMENT_WEBVIEW_PATH);

    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.css"));

    const nonce = getNonce();

    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <meta http-equiv="Content-Security-Policy"
                      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"/>
                <link href="${styleUri}" rel="stylesheet"/>
                <title>Deploy Diagram</title>
            </head>
            <body>
                <div id="app"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
        </html>
    `;
}
