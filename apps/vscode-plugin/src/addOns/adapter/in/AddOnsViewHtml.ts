import { Uri, Webview } from "vscode";

import { type BrandMode, brandModeAttributes } from "@miragon/bpmn-modeler-shared";

import { webviewContentSecurityPolicy } from "../../../shared/domain/webviewContentSecurityPolicy";

const ADD_ONS_WEBVIEW_PATH = "add-ons-webview";

/**
 * The HTML shell of the Artifacts view: its policy, its stylesheet and its
 * nonced entry script around an empty `#app`, which the bundle fills from the
 * core's catalog. `<html>` carries the brand mode, so the first frame paints
 * in it.
 */
export function addOnsViewHtml(
    webview: Webview,
    extensionUri: Uri,
    nonce: string,
    mode: BrandMode,
): string {
    const baseUri = Uri.joinPath(extensionUri, ADD_ONS_WEBVIEW_PATH);

    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.css"));

    const policy = webviewContentSecurityPolicy("addOns", {
        cspSource: webview.cspSource,
        nonce,
    });
    const modeAttributes = Object.entries(brandModeAttributes(mode))
        .map(([name, value]) => ` ${name}="${value}"`)
        .join("");

    return `
        <!DOCTYPE html>
        <html lang="en"${modeAttributes}>
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
