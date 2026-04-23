import { WebviewKind } from "./server";

/**
 * Returns the HTML served at `/`. Mirrors the extension-host
 * `bpmnEditorUi` / `dmnModelerHtml` from `WebviewHtml.ts`, except that
 * asset URLs are root-relative (served by Express.static) and there is
 * no CSP nonce (no VS Code webview sandbox).
 *
 * A tiny inline script sets `window.__WS_BRIDGE__` so the webview's
 * runtime channel selector (see `libs/shared/src/lib/vscode.ts`) picks
 * {@link WebSocketChannelImpl} instead of the VS Code API.
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
    <link href="/css/dmn.css" rel="stylesheet" type="text/css" />
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
    <link href="/css/bpmn.css" rel="stylesheet" />
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
