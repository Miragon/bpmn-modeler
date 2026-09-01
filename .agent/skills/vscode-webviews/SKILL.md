---
name: vscode-webviews
description: VS Code webview internals — HTML serving, CSP, postMessage protocol, state persistence, theming. Use when working on webview HTML, postMessage, CSP, theme handling, vscode.getState/setState, acquireVsCodeApi, webview.asWebviewUri, retainContextWhenHidden, nonce generation, content security policy, or the Query/Command message protocol between extension host and webview.
---

# VS Code Webviews

This skill covers how this project serves, secures, and communicates with webviews — the browser-based UI panels that render BPMN/DMN diagrams inside VS Code.

## HTML Generation

Webview HTML is generated at runtime by functions in the infrastructure layer, not served from static files.

### BPMN/DMN Webviews (`WebviewHtml.ts`)

`bpmnEditorUi()` and `dmnModelerHtml()` generate complete HTML documents:

1. **Asset URI resolution** — Webview files are built by Vite and bundled into `dist/apps/vscode-plugin/<webview-name>/`. At runtime, `webview.asWebviewUri()` converts these file-system paths into special `vscode-resource:` URIs that the webview sandbox can load.

2. **Nonce generation** — A random nonce is generated per HTML render and embedded in both the CSP meta tag and script tags. Only scripts with the matching nonce can execute.

3. **Theme** — The **BPMN** webview themes per-instance: the theme CSS ships inside the main `index.css` bundle and its host adapter (`apps/bpmn-webview/src/hostTheme.ts`) sets a `data-bpmn-theme` attribute from the VS Code body classes — no `#theme-link`. The **DMN** webview still loads `lightTheme.css` and swaps the `#theme-link` href at startup (dmn-js CSS is not in the package). See ADR 0012.

### Deployment Webview (`DeploymentWebviewHtml.ts`)

The deployment sidebar's form markup lives in **one** place —
`apps/deployment-webview/src/app/formTemplate.ts` (`FORM_TEMPLATE`), which the
bundle injects into `#app` at runtime. Every host shell (Vite `index.html`, the
VS Code `DeploymentWebviewHtml.ts`, the IntelliJ tool-window `WebviewServer.kt`)
ships only an empty `<div id="app"></div>`; none carries a copy of the form.
`DeploymentWebviewHtml.ts` keeps only the CSP nonce + asset-URI injection —
edit form markup **only** in `formTemplate.ts` (see the Deployment Webview
section in CLAUDE.md).

## Content Security Policy (CSP)

Every webview has a strict CSP defined in a `<meta>` tag:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    img-src ${webview.cspSource};
    script-src 'nonce-${nonce}';
    font-src ${webview.cspSource};">
```

Key restrictions:
- `default-src 'none'` — blocks everything not explicitly allowed
- `script-src 'nonce-${nonce}'` — only scripts with the generated nonce can run (no inline scripts, no `eval`)
- `style-src ... 'unsafe-inline'` — allows inline styles (required by bpmn-js for diagram rendering)
- `${webview.cspSource}` — VS Code's resource origin for loading extension assets

## Message Protocol

### Direction Convention

Messages are defined across two files in `libs/shared/src/lib/`:

- **`messages.ts`** — Base `Query` and `Command` abstract classes, plus cross-cutting messages (`SyncDocumentCommand`, `LogInfoCommand`, `LogErrorCommand`).
- **`modeler.ts`** — All modeler-specific concrete message types that extend the base classes.

The naming convention:
- **Query** (host → webview): Carries data for the webview to display or apply. Named `*Query` (e.g., `BpmnFileQuery`, `ClipboardQuery`, `BpmnModelerSettingQuery`).
- **Command** (webview → host): Requests an action or reports a state change. Named `*Command` (e.g., `SyncDocumentCommand`, `GetClipboardCommand`, `SetClipboardCommand`).

Each message has a `type` string discriminator used for routing.

### Modeler Message Types (`modeler.ts`)

**Queries (host → webview):**
- `BpmnFileQuery` — delivers BPMN XML and engine type (`c7` | `c8`)
- `DmnFileQuery` — delivers DMN XML
- `ElementTemplatesQuery` — delivers the resolved element-template list
- `BpmnModelerSettingQuery` — delivers modeler settings (alignToOrigin, showTransactionBoundaries)
- `ClipboardQuery` — delivers clipboard text (host mediates sandboxed reads)

**Commands (webview → host):**
- `GetBpmnFileCommand` — webview is ready; request the BPMN file
- `GetDmnFileCommand` — webview is ready; request the DMN file
- `GetElementTemplatesCommand` — request the current element-template list
- `GetBpmnModelerSettingCommand` — request current modeler settings
- `GetClipboardCommand` — request clipboard text from the host
- `SetClipboardCommand` — ask the host to write text to the clipboard
- `GetDiagramAsSVGCommand` — request an SVG export of the current diagram

### Sending Messages

**Host → Webview** (Query):
```typescript
// EditorSessionStore wraps this (postMessage to the active editor's webview)
webviewPanel.webview.postMessage(query);
```

**Webview → Host** (Command):
```typescript
// host.ts wraps the acquireVsCodeApi() singleton behind HostApi
const host = getHostApi();
host.postMessage(command);
```

### Receiving Messages

**Host receives Commands** — the host side uses an open/closed `WebviewMessageRouter` (one per editor) instead of a `switch`. The generic `ModelerEditorController` forwards every message into the router; handlers are small factories registered in `composition/editorFeature.ts`:
```typescript
// handler factory (modeler/bpmn/controller/webview-handlers/bpmnMessageHandlers.ts)
export function syncDocumentHandler(bpmnService: BpmnModelerService): MessageHandler {
  return async (message, editorId) =>
    bpmnService.sync(editorId, (message as SyncDocumentCommand).content);
}

// wiring (composition/editorFeature.ts)
const router = new WebviewMessageRouter()
  .on('SyncDocumentCommand', syncDocumentHandler(bpmnService))
  .on('GetClipboardCommand', getClipboardHandler(clipboardMediator))
  .on('SetClipboardCommand', setClipboardHandler(clipboardMediator));

// dispatch (ModelerEditorController) — bracketed by received/processed log lines
editorStore.subscribeToMessageEvent(editorId, (message, id) => router.dispatch(message, id));
```
Adding a webview command is "register one more handler" — no shared `switch` to edit. Multiple handlers can register for the same type and run in registration order.

**Webview receives Queries** (in main.ts):
```typescript
window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'BpmnFileQuery':
      openXml(message.content);
      break;
    case 'ClipboardQuery':
      clipboardResolver.done(message.data as ClipboardQuery);
      break;
    // ...
  }
});
```

### Request-Response Pattern

Some operations need a response (e.g., clipboard read). The webview sends a Command and waits for a Query response using the `createResolver` utility from `@miragon/bpmn-modeler-shared`:

```typescript
// Webview side (main.ts) — sends request, awaits response via resolver
let clipboardResolver = createResolver<ClipboardQuery>();

const requestClipboard = async (): Promise<string> => {
  clipboardResolver = createResolver<ClipboardQuery>();
  vscode.postMessage(new GetClipboardCommand());
  const q = await clipboardResolver.wait();
  return q?.text ?? "";
};

// When the host responds with a ClipboardQuery, resolve the promise:
// clipboardResolver.done(message.data as ClipboardQuery);
```

The extension host handles `GetClipboardCommand` by reading the system clipboard via `vscode.env.clipboard.readText()`, then posts a `ClipboardQuery` back to the webview with the text.

## State Persistence

Webviews use `vscode.getState()` / `vscode.setState()` to persist state across webview hides/shows (when `retainContextWhenHidden` is not set) or VS Code restarts.

In this project, state persistence is used for **viewport position**:

```typescript
// Save viewport on scroll/zoom
eventBus.on('canvas.viewbox.changed', () => {
  const viewbox = canvas.viewbox();
  vscode.setState({ viewbox });
});

// Restore viewport on init
const state = vscode.getState();
if (state?.viewbox) {
  canvas.viewbox(state.viewbox);
}
```

Note: BPMN/DMN editors do **not** set `retainContextWhenHidden` — their
webviews are torn down when hidden and recreated when shown, so `getState`/
`setState` is the *only* thing that survives a hide, not just a restart.
(`VsCodeEditorHandle.postMessage` throws for a hidden panel precisely because
the webview is gone — see `VsCodeEditorHandle.ts:105`.) Only the deployment
sidebar view sets `retainContextWhenHidden: true`
(`DeploymentController.ts:63`), because it uses `registerWebviewViewProvider`,
not a custom editor.

## VS Code API in Webviews

The webview gets a limited VS Code API via `acquireVsCodeApi()`. In this
project, the raw API is wrapped behind a host-agnostic `HostApi<S, M>` interface
(from `libs/shared/src/lib/host.ts`) so the same webview code runs under VS Code,
IntelliJ, or a plain browser. Two implementations back it:

- **`HostApiImpl`** — wraps the real `acquireVsCodeApi()` singleton for
  production use inside VS Code.
- **`MockHostApi`** — abstract base for development mocks. The bpmn-webview
  defines `MockHost` (in `apps/bpmn-webview/src/app/host.ts`) which extends
  `MockHostApi` and dispatches synthetic responses so the webview can run
  standalone in a browser via `vite serve`.

```typescript
// apps/bpmn-webview/src/app/host.ts
export function getHostApi(): HostApi<StateType, MessageType> {
  if (process.env.NODE_ENV === "development") {
    return new MockHost();               // standalone browser
  }
  return new HostApiImpl<StateType, MessageType>();  // VS Code
}
```

The API surface (the wrapped handle is conventionally named `host`):
```typescript
host.postMessage(message);       // Send to host
host.getState();                 // Read persisted state
host.setState(state);            // Write persisted state
```

## Theme Handling

### Detection

VS Code adds a theme **class** to `document.body` (not a `data-` attribute):
- `vscode-light` — light theme
- `vscode-dark` — dark theme
- `vscode-high-contrast` — high contrast

Both host adapters read these with
`document.body.classList.contains("vscode-dark")` /
`"vscode-high-contrast")` and install a `MutationObserver` on the body
`class` attribute to re-apply the theme when the user switches it live.

### BPMN: per-instance `data-bpmn-theme` attribute

The BPMN webview themes each modeler **instance** through `@miragon/bpmn-modeler`
(ADR 0012). The theme CSS (unscoped light base + `[data-bpmn-theme="dark"]`-scoped
dark overrides) is folded into the main `index.css` bundle, so there is no
`#theme-link`. `apps/bpmn-webview/src/hostTheme.ts` resolves the IDE kind from the
body classes and drives two sinks: the page-level scope on `<html>` (host chrome
+ the viewer/diff branch) and the modeler instance's `setTheme`.

### DMN: `#theme-link` stylesheet swap

The DMN webview still ships two CSS files (`lightTheme.css`, `darkTheme.css`) and
swaps them, because dmn-js theme CSS is not in the package. `libs/modeler-types/src/theme.ts`
is the retained DMN-only adapter. On initialization:

1. Read the body theme classes (`classList.contains("vscode-dark")` / `"vscode-high-contrast"`)
2. Set the `#theme-link` element's `href` to the matching stylesheet
3. The initial HTML always references `lightTheme.css`; the JS swaps if needed
4. A `MutationObserver` on the body `class` attribute repeats the swap on live theme changes

### CSS Custom Properties

VS Code also exposes theme colors as CSS custom properties (e.g., `--vscode-editor-background`). These can be used in webview CSS for seamless theme integration without stylesheet swapping.

## URI Conversion

Files bundled with the extension must be converted to webview-safe URIs:

```typescript
// BPMN_WEBVIEW_PATH === "bpmn-webview"; extensionUri already points at the
// packaged extension root (dist/apps/vscode-plugin), so it is not re-joined.
const baseUri = vscode.Uri.joinPath(extensionUri, BPMN_WEBVIEW_PATH);
const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(baseUri, 'index.js'));
```

This converts `file://` paths to `vscode-resource:` URIs that pass the webview's CSP.
See `apps/vscode-plugin/src/shared/infrastructure/WebviewHtml.ts`.

## Key Files

- **BPMN/DMN HTML**: `apps/vscode-plugin/src/shared/infrastructure/WebviewHtml.ts`
- **Deployment HTML shell**: `apps/vscode-plugin/src/deployment/infrastructure/DeploymentWebviewHtml.ts` (CSP + asset URIs only)
- **Deployment form markup (single source)**: `apps/deployment-webview/src/app/formTemplate.ts` (`FORM_TEMPLATE`)
- **Message router**: `libs/modeler-core/src/shared/infrastructure/WebviewMessageRouter.ts`
- **Base message types**: `libs/shared/src/lib/messages.ts`
- **Modeler message types**: `libs/shared/src/lib/modeler.ts`
- **Host API interface + implementations** (`HostApi`/`HostApiImpl`/`MockHostApi`): `libs/shared/src/lib/host.ts`
- **Webview host wrapper + mock** (`getHostApi`/`MockHost`): `apps/bpmn-webview/src/app/host.ts`
- **Resolver utility**: `libs/shared/src/lib/utils.ts` (`createResolver`)
