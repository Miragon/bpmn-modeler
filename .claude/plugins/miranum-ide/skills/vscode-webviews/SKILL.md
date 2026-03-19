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

1. **Asset URI resolution** — Webview files are built by Vite into `dist/apps/bpmn-modeler/<webview-name>/`. At runtime, `webview.asWebviewUri()` converts these file-system paths into special `vscode-resource:` URIs that the webview sandbox can load.

2. **Nonce generation** — A random nonce is generated per HTML render and embedded in both the CSP meta tag and script tags. Only scripts with the matching nonce can execute.

3. **Theme stylesheet** — The initial HTML loads `lightTheme.css`. The webview's JavaScript detects the actual VS Code theme at startup and swaps the stylesheet link if needed.

### Deployment Webview (`DeploymentWebviewHtml.ts`)

The deployment sidebar uses inline HTML with form markup for connection, authentication, deployment, and instance start tabs. This is the "dual-HTML" pattern documented in CLAUDE.md — `DeploymentWebviewHtml.ts` and `apps/deployment-webview/index.html` must stay in sync.

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
// EditorStore wraps this
webviewPanel.webview.postMessage(query);
```

**Webview → Host** (Command):
```typescript
// vscode.ts wraps the acquireVsCodeApi() singleton
const vscode = acquireVsCodeApi();
vscode.postMessage(command);
```

### Receiving Messages

**Host receives Commands** (in controller):
```typescript
editorStore.onMessage(webviewPanel, (message) => {
  switch (message.type) {
    case 'SyncDocumentCommand':
      service.sync(message.content);
      break;
    case 'GetClipboardCommand':
      service.readClipboard(id);
      break;
    case 'SetClipboardCommand':
      service.writeClipboard((message as SetClipboardCommand).text);
      break;
    // ...
  }
});
```

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

Some operations need a response (e.g., clipboard read). The webview sends a Command and waits for a Query response using the `createResolver` utility from `@bpmn-modeler/shared`:

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

Note: With `retainContextWhenHidden: true` (used for BPMN/DMN editors), the webview stays alive when hidden. State persistence is mainly useful for VS Code restart scenarios.

## VS Code API in Webviews

The webview gets a limited VS Code API via `acquireVsCodeApi()`. In this project, the raw API is wrapped behind a `VsCodeApi<S, M>` interface (from `libs/shared/src/lib/vscode.ts`) with two implementations:

- **`VsCodeImpl`** — wraps the real `acquireVsCodeApi()` singleton for production use inside VS Code.
- **`VsCodeMock`** — base class for development mocks. The bpmn-webview defines `MockedVsCodeApi` (in `apps/bpmn-webview/src/app/vscode.ts`) which extends `VsCodeMock` and dispatches synthetic responses so the webview can run standalone in a browser via `vite dev`.

```typescript
// apps/bpmn-webview/src/app/vscode.ts
export function getVsCodeApi(): VsCodeApi<StateType, MessageType> {
  if (process.env.NODE_ENV === "development") {
    return new MockedVsCodeApi();   // standalone browser
  } else {
    return new VsCodeImpl<StateType, MessageType>();  // VS Code
  }
}
```

The API surface:
```typescript
vscode.postMessage(message);       // Send to host
vscode.getState();                 // Read persisted state
vscode.setState(state);            // Write persisted state
```

## Theme Handling

### Detection

VS Code sets `data-vscode-theme-kind` on `document.body`:
- `vscode-light` — light theme
- `vscode-dark` — dark theme
- `vscode-high-contrast` — high contrast

### Stylesheet Swap

The webview ships two CSS files (`lightTheme.css`, `darkTheme.css`). On initialization:

1. Read `document.body.dataset.vscodeThemeKind`
2. Set the `<link>` element's `href` to the matching stylesheet
3. The initial HTML always references `lightTheme.css`; the JS swaps if needed

### CSS Custom Properties

VS Code also exposes theme colors as CSS custom properties (e.g., `--vscode-editor-background`). These can be used in webview CSS for seamless theme integration without stylesheet swapping.

## URI Conversion

Files bundled with the extension must be converted to webview-safe URIs:

```typescript
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(extensionUri, 'dist', 'apps', 'bpmn-modeler', 'bpmn-webview', 'index.js')
);
```

This converts `file://` paths to `vscode-resource:` URIs that pass the webview's CSP.

## Key Files

- **BPMN/DMN HTML**: `apps/modeler-plugin/src/infrastructure/WebviewHtml.ts`
- **Deployment HTML**: `apps/modeler-plugin/src/infrastructure/DeploymentWebviewHtml.ts`
- **Base message types**: `libs/shared/src/lib/messages.ts`
- **Modeler message types**: `libs/shared/src/lib/modeler.ts`
- **VS Code API interface + implementations**: `libs/shared/src/lib/vscode.ts`
- **Webview VS Code API wrapper + mock**: `apps/bpmn-webview/src/app/vscode.ts`
- **Resolver utility**: `libs/shared/src/lib/utils.ts` (`createResolver`)
