---
name: vscode-webviews
description: VS Code webview internals. Covers HTML serving, CSP and nonces, the Query/Command postMessage protocol, state persistence and theming. Use when changing webview HTML, messaging or getState/setState.
---

# VS Code Webviews

This skill covers how this project serves, secures, and communicates with webviews, the browser-based UI panels that render BPMN/DMN diagrams inside VS Code.

## HTML Generation

Webview HTML is generated at runtime by functions in the infrastructure layer, not served from static files.

### BPMN/DMN Webviews (`WebviewHtml.ts`)

`bpmnEditorUi()` and `dmnModelerHtml()` generate complete HTML documents:

1. **Asset URI resolution:** Webview files are built by Vite and bundled into `dist/apps/vscode-plugin/<webview-name>/`. At runtime, `webview.asWebviewUri()` converts these file-system paths into special `vscode-resource:` URIs that the webview sandbox can load.

2. **Nonce generation:** A random nonce is generated per HTML render, set on the entry script and listed in the shell's CSP (see below).

3. **Theme:** Both webviews theme **per-instance**: the theme CSS ships inside the main `index.css` bundle and a shared host adapter (`libs/shared/src/lib/hostTheme.ts`) sets a per-package scope attribute (`data-bpmn-theme` / `data-dmn-theme`) from the VS Code body classes, with no `#theme-link`. See [BPMN modeler: themes and locale](../../../docs/adr/bpmn-modeler.md#themes-and-locale) (BPMN) and [DMN modeler: themes](../../../docs/adr/dmn-modeler.md#themes) (DMN).

### Deployment Webview (`DeploymentWebviewHtml.ts`)

The deployment sidebar's form markup lives in **one** place:
`apps/deployment-webview/src/app/formTemplate.ts` (`FORM_TEMPLATE`), which the
bundle injects into `#app` at runtime. Every host shell (Vite `index.html`, the
VS Code `DeploymentWebviewHtml.ts`, the IntelliJ tool-window `WebviewServer.kt`)
ships only an empty `<div id="app"></div>`; none carries a copy of the form.
`DeploymentWebviewHtml.ts` keeps only the CSP nonce + asset-URI injection.
Edit form markup **only** in `formTemplate.ts` (see the Deployment Webview
section in AGENTS.md).

## Content Security Policy (CSP)

Every shell (BPMN, DMN, form, deployment) defines a CSP in a `<meta>` tag and
limits `localResourceRoots` to its bundle directory: `bootstrapWebview` does it
for the editors (DMN also gets `assets/` for `reset.css`), and
`DeploymentController.resolveWebviewView` for the deployment sidebar.
`webviewContentSecurityPolicy(shell, { cspSource, nonce })` in
`apps/vscode-plugin/src/shared/infrastructure/webviewContentSecurityPolicy.ts`
builds all four policies: the directives every shell shares are written once,
and its `BUNDLE_SOURCES` table lists what each bundle adds. A table entry may
only widen `script-src` and the load directives (`img-src`, `font-src`,
`connect-src`, `frame-src`, `object-src`); another key fails the typecheck and
never reaches the policy. Its spec pins each policy, so widen a shell in the
table and in that spec. Every shell spec runs `describeShellPolicy` from
`src/__fixtures__/webviewShell.ts`, which checks only that the shell carries the
builder's policy for its script's nonce and draws a fresh nonce per render. The
BPMN policy:

```text
default-src 'none';
script-src 'nonce-${nonce}' ${webview.cspSource};
style-src ${webview.cspSource} 'unsafe-inline';
img-src ${webview.cspSource} data: https:;
font-src ${webview.cspSource} data:;
base-uri 'none'; form-action 'none'
```

- In BPMN and DMN, `script-src` must include `${webview.cspSource}`: the bundle
  lazy-loads `chunks/**` relative to `index.js`, and the chunk loader's
  modulepreload links carry no nonce. A nonce-only `script-src` breaks
  View/Design/Implement. The form and deployment bundles are one classic
  script each and allow the nonce alone.
- `style-src 'unsafe-inline'` in every shell: diagram-js, the properties panel
  and CodeMirror set style attributes and inject `<style>` elements, and the
  deployment form's markup carries a style attribute.
- `img-src data: https:`: element-template icons are `data:` URIs or remote
  URLs (DMN has no templates and omits `https:`).
- The form shell adds what form-js components load at runtime:
  `img-src blob: https:`, `frame-src https:` for iframe components, and for
  document previews `connect-src https:` (they fetch the file) and
  `object-src blob:` (a PDF's `<embed>`).
- The deployment shell allows only its script and its styles: the deployment
  form loads no images or fonts.
- No `'unsafe-eval'` or workers in any shell, and no `connect-src` outside the
  form shell.
- `base-uri 'none'; form-action 'none'` in every shell: `default-src` does not
  cover them.

The VS Code smoke test (`test:vscode:docker`) fails on any CSP console message
from a webview; check it after adding a dependency that injects scripts,
styles, images or fonts.

## Message Protocol

### Direction Convention

Messages are defined across two files in `libs/shared/src/lib/`:

- **`messages.ts`**: Base `Query` and `Command` abstract classes, plus cross-cutting messages (`SyncDocumentCommand`, `LogInfoCommand`, `LogErrorCommand`).
- **`modeler.ts`**: All modeler-specific concrete message types that extend the base classes.

The naming convention:
- **Query** (host → webview): Carries data for the webview to display or apply. Named `*Query` (e.g., `BpmnFileQuery`, `ClipboardQuery`, `BpmnModelerSettingQuery`).
- **Command** (webview → host): Requests an action or reports a state change. Named `*Command` (e.g., `SyncDocumentCommand`, `GetClipboardCommand`, `SetClipboardCommand`).

Each message has a `type` string discriminator used for routing.

### Modeler Message Types (`modeler.ts`)

**Queries (host → webview):**
- `BpmnFileQuery`: delivers BPMN XML, engine type (`c7` | `c8`) and the initial UI locale
- `DmnFileQuery`: delivers DMN XML
- `ElementTemplatesQuery`: delivers the resolved element-template list
- `BpmnModelerSettingQuery`: delivers modeler settings (alignToOrigin, showTransactionBoundaries)
- `ClipboardQuery`: delivers clipboard text (host mediates sandboxed reads)

**Commands (webview → host):**
- `GetBpmnFileCommand`: webview is ready; request the BPMN file
- `GetDmnFileCommand`: webview is ready; request the DMN file
- `GetElementTemplatesCommand`: request the current element-template list
- `GetBpmnModelerSettingCommand`: request current modeler settings
- `GetClipboardCommand`: request clipboard text from the host
- `SetClipboardCommand`: ask the host to write text to the clipboard
- `GetDiagramAsSVGCommand`: request an SVG export of the current diagram

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
The BPMN webview's bootstrap and session modules post through `HostChannel`
(`apps/bpmn-webview/src/session/hostChannel.ts`), which takes only the commands
in `BPMN_EDITOR_COMMAND_TYPES` (`libs/shared/src/lib/bpmnEditorCommands.ts`).
`bootstrap` narrows its host to it once. `DiffMode` posts through
`DiffPaneChannel` (same file), which takes only `DIFF_PANE_COMMAND_TYPES`
(`libs/shared/src/lib/diffPaneCommands.ts`). A new BPMN editor or diff-pane
command goes into its list, or it does not compile.
Declare a channel's `postMessage` as a property (`postMessage: (message: M) => void`),
as `HostApi` does: a method signature compares its parameter bivariantly, so a
narrowed channel would fit a helper that posts any message.

### Receiving Messages

**Host receives Commands:** the host side uses an open/closed `WebviewMessageRouter` (one per editor) instead of a `switch`. The core `EditorSessionLifecycle` (run by `ModelerEditorController` in VS Code and by the IntelliJ bridge) forwards every message into the router; handlers are small factories, host-agnostic ones in `libs/modeler-core`. VS Code registers the DMN and Form routers one handler at a time in `composition/editorFeature.ts`:
```typescript
// handler factory (libs/modeler-core/src/editorSession/infrastructure/documentMessageHandlers.ts),
// shared by the BPMN, DMN and Form editors
export function syncDocumentHandler(service: ModelerDocumentService): MessageHandler<SyncDocumentCommand> {
  return async (sync, editorId) => {
    await service.sync(editorId, sync.content, sync.documentRevision);
  };
}

// wiring (composition/editorFeature.ts)
const router = new WebviewMessageRouter()
  .on('GetDmnFileCommand', displayDocumentHandler(dmnService, notifier, 'Dmn modeler is ready'))
  .on('SyncDocumentCommand', syncDocumentHandler(dmnService))
  .on('DocumentFlushedCommand', documentFlushedHandler(flushSvc));

// dispatch (EditorSessionLifecycle) — bracketed by received/processed log lines
editorStore.subscribeToMessageEvent(editorId, (message, id) => router.dispatch(message, id));
```
Adding a webview command is "register one more handler", with no shared `switch` to edit. Multiple handlers can register for the same type and run in registration order. A host that drops a command on purpose says so with `router.ignore(type, reason)`, once and with a non-blank reason, instead of leaving it unrouted; `router.routeOf(type)` reports `handled`, `ignored` (with the reason) or `unrouted`, and a type is never both handled and ignored.

The BPMN editor's router comes from a table instead: the core `BpmnEditorFeature` (`libs/modeler-core/src/modeler/bpmn/`) passes `WebviewMessageRouter.fromTable` a `CommandTable<BpmnEditorCommandType>`, whose entry per command is its handlers in run order or `{ ignored: reason }`, so a new BPMN editor command does not compile until it has one. Another feature's commands arrive as its `EditorContribution`; a host capability that is absent from `BpmnEditorHostExtensions` turns its commands into ignored entries, and the three document commands are handled or ignored together. Both hosts build this feature in their `composition/bpmnEditorFeature.ts`, and each pins the routes it gets in a coverage spec (`apps/vscode-plugin/src/composition/bpmnEditorFeature.spec.ts`, `apps/modeler-bridge/src/bridge.editor.spec.ts`).

Diff panes are not editor sessions. Both hosts route their commands through the core `createDiffPaneRouter` (`libs/modeler-core/src/diff/service/`), a `CommandTable` over `DiffPaneCommandType` and `DiffPaneHandshakeCommandType` (the editor requests the page posts before it knows it is a diff pane) whose handlers get the pane instead of an editor id; an entry missing from `DiffPaneHostExtensions` (swap, pane log) turns its command into an ignored entry. Each host pins those routes in a coverage spec (`apps/vscode-plugin/src/diff/controller/BpmnDiffController.spec.ts`, `apps/modeler-bridge/src/diff.spec.ts`).

**Webview receives Queries** (a switch, as in `apps/dmn-webview/src/hostMessageRouter.ts`; the BPMN webview looks the handler up in a type-keyed table instead, `apps/bpmn-webview/src/session/messageRouter.ts`):
```typescript
const inbound = asProtocolMessage(message);
switch (inbound.type) {
  case 'DmnFileQuery':
    await session.receiveHostFile(inbound);
    break;
  case 'PropertiesPanelStateQuery':
    replies.panelState.done(inbound);
    break;
  // ...
}
```

### Request-Response Pattern

Some operations need a response (e.g., clipboard read). The webview sends a Command and waits for a Query response using the `createResolver` utility from `@miragon/bpmn-modeler-shared`:

```typescript
// Webview side (simplified from apps/bpmn-webview/src/session/protocolClipboard.ts)
let clipboardResolver = createResolver<ClipboardQuery>();

const requestClipboard = async (): Promise<string> => {
  clipboardResolver = createResolver<ClipboardQuery>();
  vscode.postMessage(new GetClipboardCommand());
  const q = await clipboardResolver.wait(HOST_REPLY_TIMEOUT_MS);
  return q?.text ?? "";
};

// The router hands the ClipboardQuery reply to its handler, which resolves the promise:
// ClipboardQuery: (reply) => clipboardResolver.done(reply)
```

The extension host handles `GetClipboardCommand` by reading the system clipboard via `vscode.env.clipboard.readText()`, then posts a `ClipboardQuery` back to the webview with the text, or with empty text when the read fails, so every request is answered.

Bound every awaited host reply, because a reply can still be lost (e.g. IntelliJ drops best-effort frames while the bridge respawns): `wait(HOST_REPLY_TIMEOUT_MS)` for a single-slot reply, or `createReplyRegistry` (both in `libs/shared/src/lib/utils.ts`) when several requests are in flight and each reply carries a `requestId` (workspace definition search). An unanswered request then settles as `undefined`. The initial file requests (`BpmnDocumentSession.waitForInitialHostFile` in `apps/bpmn-webview/src/session/documentSession.ts`, `DmnDocumentSession.openInitialDocument`) deliberately wait indefinitely, since a cold first open can take longer than any backstop.

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

Note: BPMN/DMN editors do **not** set `retainContextWhenHidden`: their
webviews are torn down when hidden and recreated when shown, so `getState`/
`setState` is the *only* thing that survives a hide, not just a restart.
(`VsCodeEditorHandle.postMessage` throws for a hidden panel precisely because
the webview is gone.) Only the deployment sidebar view sets
`retainContextWhenHidden: true` (`DeploymentController.ts`), because it uses
`registerWebviewViewProvider`, not a custom editor.

## VS Code API in Webviews

The webview gets a limited VS Code API via `acquireVsCodeApi()`. In this
project, the raw API is wrapped behind a host-agnostic `HostApi<S, M>` interface
(from `libs/shared/src/lib/host.ts`) so the same webview code runs under VS Code,
IntelliJ, or a plain browser. Two implementations back it:

- **`HostApiImpl`**: wraps the real `acquireVsCodeApi()` singleton for
  production use. VS Code, IntelliJ and the desktop app inject the same shim.
- **`MockHostApi`**: abstract base for development mocks. The bpmn-webview
  defines `MockHost` (in `apps/bpmn-webview/src/host.ts`) which extends
  `MockHostApi` and dispatches synthetic responses so the webview can run
  standalone in a browser via `vite serve`.

```typescript
// apps/bpmn-webview/src/host.ts
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
host.getState();                 // Read persisted state; undefined until the first write
host.setState(state);            // Replace persisted state
host.updateState(partial);       // Merge into persisted state, seeding it when empty
```

## Theme Handling

### Detection

VS Code adds a theme **class** to `document.body` (not a `data-` attribute):
- `vscode-light`: light theme
- `vscode-dark`: dark theme
- `vscode-high-contrast`: high contrast

Both host adapters read these with
`document.body.classList.contains("vscode-dark")` /
`"vscode-high-contrast")` and install a `MutationObserver` on the body
`class` attribute to re-apply the theme when the user switches it live.

### Per-instance scope attribute (BPMN & DMN)

Both webviews theme each modeler **instance** through their package; see the
[BPMN theme decision](../../../docs/adr/bpmn-modeler.md#themes-and-locale) and
[DMN theme decision](../../../docs/adr/dmn-modeler.md#themes). The theme CSS (unscoped light base +
`[data-bpmn-theme="dark"]` / `[data-dmn-theme="dark"]`-scoped dark overrides) is
folded into the main `index.css` bundle, so there is no `#theme-link`. The shared
`libs/shared/src/lib/hostTheme.ts` adapter resolves the IDE kind from the body
classes (`vscode-dark` / `vscode-high-contrast`, watched by a `MutationObserver`)
and drives two sinks: the page-level scope on `<html>` (host chrome + surfaces
with no live instance) and the modeler instance's `setTheme` (BPMN: through
`apps/bpmn-webview/src/session/modeController.ts`, so a mode switch builds the
next surface in the current theme). The scope attribute
name is passed in per package (`applyPageThemeScope("data-dmn-theme", kind)`), so
each package's CSS stays self-contained. The package still mirrors the resolved
kind onto a legacy `#theme-link` when a consumer links one (a silent no-op
otherwise).

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
- **Shell CSP builder**: `apps/vscode-plugin/src/shared/infrastructure/webviewContentSecurityPolicy.ts`
- **Deployment form markup (single source)**: `apps/deployment-webview/src/app/formTemplate.ts` (`FORM_TEMPLATE`)
- **Message router**: `libs/modeler-core/src/editorSession/service/WebviewMessageRouter.ts`
- **Base message types**: `libs/shared/src/lib/messages.ts`
- **Modeler message types**: `libs/shared/src/lib/modeler.ts`
- **Host API interface + implementations** (`HostApi`/`HostApiImpl`/`MockHostApi`): `libs/shared/src/lib/host.ts`
- **Webview host wrapper + mock** (`getHostApi`/`MockHost`): `apps/bpmn-webview/src/host.ts`
- **Resolver utilities**: `libs/shared/src/lib/utils.ts` (`createResolver`, `createReplyRegistry`, `HOST_REPLY_TIMEOUT_MS`)
