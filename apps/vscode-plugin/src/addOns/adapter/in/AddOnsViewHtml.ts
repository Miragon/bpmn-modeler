import { Uri, Webview } from "vscode";

import { webviewContentSecurityPolicy } from "../../../shared/domain/webviewContentSecurityPolicy";

const ADD_ONS_WEBVIEW_PATH = "add-ons-webview";

/**
 * The HTML shell of the Artifacts view: its policy, its stylesheet and its
 * nonced entry script around an empty `#app`, which the bundle fills from the
 * core's catalog.
 */
export function addOnsViewHtml(webview: Webview, extensionUri: Uri, nonce: string): string {
    const baseUri = Uri.joinPath(extensionUri, ADD_ONS_WEBVIEW_PATH);

    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.css"));

    const policy = webviewContentSecurityPolicy("addOns", {
        cspSource: webview.cspSource,
        nonce,
    });

    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <meta http-equiv="Content-Security-Policy" content="${policy}"/>
                <link href="${styleUri}" rel="stylesheet"/>
                <title>Artifacts</title>
            </head>
            <body>
                <div id="app"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
        </html>
    `;
}
