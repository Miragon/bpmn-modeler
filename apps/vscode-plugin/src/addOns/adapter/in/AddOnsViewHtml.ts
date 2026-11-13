import { Uri, Webview } from "vscode";

import {
    addOnsPageAttributes,
    type AddOnsPage,
    type BrandMode,
    brandModeAttributes,
} from "@miragon/bpmn-modeler-shared";

import { webviewContentSecurityPolicy } from "../../../shared/domain/webviewContentSecurityPolicy";

const ADD_ONS_WEBVIEW_PATH = "add-ons-webview";

/**
 * The HTML shell of an add-ons page: its policy, its stylesheet and its
 * nonced entry script around an empty `#app`, which the bundle fills from the
 * core's catalog. `<html>` carries the brand mode, so the first frame paints
 * in it, and which page this shell serves: the view's list or a tab's detail.
 */
export function addOnsViewHtml(
    webview: Webview,
    extensionUri: Uri,
    nonce: string,
    mode: BrandMode,
    page: AddOnsPage,
): string {
    const baseUri = Uri.joinPath(extensionUri, ADD_ONS_WEBVIEW_PATH);

    const scriptUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.js"));
    const styleUri = webview.asWebviewUri(Uri.joinPath(baseUri, "index.css"));

    const policy = webviewContentSecurityPolicy("addOns", {
        cspSource: webview.cspSource,
        nonce,
    });
    const modeAttributes = Object.entries({
        ...brandModeAttributes(mode),
        ...addOnsPageAttributes(page),
    })
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
                <title>Add-ons</title>
            </head>
            <body>
                <div id="app"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
        </html>
    `;
}
