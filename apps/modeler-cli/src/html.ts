import { WebviewKind } from "./server";

// Icon-font stylesheets live at the deep path the webview's vite static-copy
// glob produces (`css/**` preserves the matched node_modules path). Mirrored
// here so the served HTML links the file that actually exists on disk.
const BPMN_FONT_CSS = "/css/node_modules/camunda-bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
const DMN_FONT_CSS = "/css/node_modules/dmn-js/dist/assets/dmn-font/css/dmn.css";

/**
 * Returns the HTML served at `/`. Mirrors the extension-host `bpmnEditorUi` /
 * `dmnModelerHtml` (`apps/modeler-plugin/src/shared/infrastructure/WebviewHtml.ts`),
 * except that asset URLs are root-relative (served by `express.static`) and
 * there is no CSP nonce — there is no VS Code webview sandbox here.
 *
 * A tiny inline classic script sets `window.__WS_BRIDGE__` *before* the
 * webview bundle runs, so the shared `getVsCodeApi()` channel selector picks
 * `WebSocketChannelImpl` instead of `acquireVsCodeApi()`. The bundle is an
 * IIFE (no module syntax), so a plain `<script>` is sufficient and runs after
 * the inline one.
 */
export function renderHtml(kind: WebviewKind, port: number): string {
    const bridgeScript = `window.__WS_BRIDGE__ = "ws://localhost:${port}/bridge";`;

    if (kind === "dmn") {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="/index.css" rel="stylesheet" type="text/css" />
    <link href="${DMN_FONT_CSS}" rel="stylesheet" type="text/css" />
    <title>DMN Modeler</title>
</head>
<body>
    <div class="content with-diagram" id="js-drop-zone">
        <div class="canvas" id="js-canvas"></div>
        <div class="properties-panel-parent" id="js-properties-panel"></div>
    </div>
    <script>${bridgeScript}</script>
    <script src="/index.js"></script>
</body>
</html>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="/index.css" rel="stylesheet" />
    <link href="/lightTheme.css" rel="stylesheet" id="theme-link" />
    <link href="${BPMN_FONT_CSS}" rel="stylesheet" />
    <title>BPMN Modeler</title>
</head>
<body>
    <div class="content with-diagram" id="js-drop-zone">
        <div class="canvas" id="js-canvas"></div>
        <div id="js-panel-resizer" class="panel-resizer"></div>
        <div class="properties-panel-parent" id="js-properties-panel"></div>
    </div>
    <script>${bridgeScript}</script>
    <script src="/index.js"></script>
</body>
</html>`;
}
