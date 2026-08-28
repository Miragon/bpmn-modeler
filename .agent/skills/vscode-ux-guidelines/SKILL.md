---
name: vscode-ux-guidelines
description: VS Code UX guidelines for this project — how to choose between notifications, status bar, quick picks, and output channels; how clipboard access works between sandboxed webviews and the extension host; webview theming; accessibility; and setContext for keybinding visibility. Use this skill whenever you are adding user-facing feedback (messages, errors, progress), wiring clipboard in webviews, implementing copy/paste, choosing how to surface information to the user, adding keyboard shortcuts or when-clause visibility, working on theming, or considering accessibility. Also use when deciding between notification types or between notifications vs. status bar vs. output channel.
---

# VS Code UX Guidelines

VS Code UX patterns and how this project applies them. The core principle: **use native VS Code APIs before building custom webview UI**.

## Choosing the Right Feedback Channel

Pick the lightest channel that gets the job done — heavier channels interrupt the user more.

| Channel                      | When to use                                                                    | When NOT to use                                         |
|------------------------------|--------------------------------------------------------------------------------|---------------------------------------------------------|
| **Output Channel**           | Detailed logs, diagnostics, verbose info the user checks on demand             | Primary user feedback — most users never open it        |
| **Status Bar**               | Transient progress, background task status, quick confirmations that auto-hide | Anything requiring user action or acknowledgment        |
| **Information notification** | Success confirmations the user should see, non-critical updates                | Routine/repetitive operations (use status bar instead)  |
| **Warning notification**     | Recoverable issues where the user can take action                              | Logging-level warnings (use output channel instead)     |
| **Error notification**       | Failures that block the user's workflow                                        | Internal/expected errors (log them, don't notify)       |
| **Quick Pick**               | Selection from a list of options                                               | Binary yes/no choices (use notification action buttons) |

**Decision flow**: Can the user ignore it? → Output channel. Is it transient progress? → Status bar. Does the user need to act? → Notification with action buttons. Does the user need to choose from a list? → Quick pick.

## Notifications

`VsCodeNotifier` (`apps/vscode-plugin/src/shared/infrastructure/VsCodeNotifier.ts`) wraps notification calls with fire-and-forget methods:

```typescript
// Simple notifications — no action buttons, returns void
notifier.showInfo('Diagram saved successfully');
notifier.showError('Failed to deploy process');
```

When you need **action buttons**, use the raw VS Code API directly (as `apps/vscode-plugin/src/main.ts` does for the release notification):

```typescript
window
    .showInformationMessage(
        `BPMN Modeler updated to v${current}. See what's new!`,
        "View Release Notes",
    )
    .then((selection) => {
        if (selection === "View Release Notes") {
            env.openExternal(Uri.parse(`${RELEASES_BASE}/v${current}`));
        }
    });
```

**Keep messages short** — one sentence, no technical jargon for user-facing text.

## Status Bar

`VsCodeStatusBar` (`apps/vscode-plugin/src/shared/infrastructure/VsCodeStatusBar.ts`) manages status bar items for element-template and engine-version feedback:

```typescript
statusBar.showElementTemplatesLoading();      // "$(loading~spin) Loading element templates…"
statusBar.showElementTemplatesReady(count);   // "$(check) Element templates (N)" — auto-hides after 3s
statusBar.hideElementTemplatesStatus();       // Hide explicitly (used on error paths)
statusBar.showEngineVersion(platform, ver);   // Engine version of the focused BPMN editor
```

The status bar item is lazily created. Use the **right side** for transient status and progress. Keep items concise — icon + short text, with tooltips for detail.

## Quick Picks

`VsCodePicker` (`apps/vscode-plugin/src/shared/infrastructure/VsCodePicker.ts`) owns every quick pick — e.g. `pickExecutionPlatform()` when the execution platform cannot be auto-detected from the BPMN XML, plus `pickEngineVersion`, `pickScriptLanguage`, `pickPayloadFile`, `searchAndPickReferencedModel`:

```typescript
const result = await window.showQuickPick(items, {
  placeHolder: 'Select the execution platform',
});
```

If the user cancels (Escape), a `UserCancelledError` is thrown and handled gracefully. Use quick picks for selection from a list — don't abuse notification buttons for this.

## Output Channel

`VsCodeNotifier` wraps a `LogOutputChannel` directly (there is no separate logger class):

```typescript
notifier.logInfo('Element templates loaded from: /path/to/templates');
notifier.logWarning('No element templates found in workspace');
notifier.logError(new Error('Failed to parse element template: invalid JSON'));  // Error object, not string
```

The webview sends `LogInfoCommand` / `LogErrorCommand` messages to the host, which writes them to the output channel. This project uses a single channel for the modeler.

## Clipboard Access

Webviews run in sandboxed iframes without `clipboard-read`/`clipboard-write` permissions, so all clipboard access must go through the extension host via `vscode.env.clipboard`.

### Message Types

Defined in `libs/shared/src/lib/modeler.ts`:

Two separate host round-trips — **element** clipboard (BPMN shapes as JSON) and
**text** clipboard (labels, FEEL editor):

| Message | Direction | Purpose |
|---------|-----------|---------|
| `GetClipboardCommand` | webview → extension host | Request to read system clipboard (element) |
| `SetClipboardCommand(text)` | webview → extension host | Request to write element JSON to system clipboard |
| `ClipboardQuery(text)` | extension host → webview | Response with element clipboard content |
| `GetTextClipboardCommand` | webview → extension host | Request to read system clipboard (text) |
| `SetTextClipboardCommand(text)` | webview → extension host | Request to write text to system clipboard |
| `TextClipboardQuery(text)` | extension host → webview | Response with text clipboard content |

### Extension Host Side

`VsCodeClipboard` (`apps/vscode-plugin/src/shared/infrastructure/VsCodeClipboard.ts`) exposes async clipboard methods:

```typescript
async readClipboard(): Promise<string>   // vscode.env.clipboard.readText()
async writeClipboard(text: string): Promise<void>  // vscode.env.clipboard.writeText()
```

The BPMN `WebviewMessageRouter` dispatches incoming `GetClipboardCommand` / `SetClipboardCommand` to the clipboard handlers in `bpmnMessageHandlers.ts`, which call `BpmnClipboardMediator` → `VsCodeClipboard`.

### Webview Side — Two DI Modules

The webview installs two **bpmn-js DI modules** (from the shared
`libs/bpmn-clipboard` package, `@miragon/bpmn-modeler-clipboard`) because diagram
elements and contenteditable labels have different event handling. Both are
passed as `additionalModules` in `apps/bpmn-webview/src/main.ts`; each receives
its host bridge through didi value injection — a `{ requestClipboard,
writeClipboard }` pair — rather than the old `installClipboardInterceptor(...)`
call, which no longer exists.

**1. Diagram element copy/paste** (`BridgedClipboardModule`,
`libs/bpmn-clipboard/src/BridgedClipboardModule.ts`, injected
`elementClipboardBridge`):

Intercepts bpmn-js `copyPaste.elementsCopied` / `copyPaste.pasteElements` at
priority 2051 (above `NativeCopyPaste`, which it disables on construction).

- **Copy**: Serializes the element tree as `"bpmn-js-clip----" + JSON.stringify(tree)` and sends it via `SetClipboardCommand`.
- **Paste**: On cross-editor paste (no internal `context.tree`), snapshots the context, cancels the default paste, requests clipboard text via `GetClipboardCommand`, then reconstructs typed model objects with `createReviver(moddle)` and re-triggers `copyPaste.paste()`.

**2. Direct-editing label overlays** (`LabelClipboardModule`,
`libs/bpmn-clipboard/src/LabelClipboardModule.ts`, injected
`textClipboardBridge`):

Attaches a **capture-phase** keydown listener on the label element while direct
editing is active — it fires before diagram-js's `DirectEditing._handleKey`
calls `stopPropagation()`.

- **Cmd/Ctrl+C**: Reads `window.getSelection()`, writes via `textClipboardBridge` → `SetTextClipboardCommand`.
- **Cmd/Ctrl+V**: Reads via `textClipboardBridge` → `GetTextClipboardCommand`, dispatches a synthetic `ClipboardEvent("paste")`, falls back to `document.execCommand("insertText")`.

See the `/bpmn-js` skill for the full three-layer copy-paste architecture (the
third layer is a webview-local FEEL-editor polyfill).

### Wiring (bridge override only)

The native browser clipboard is the default (#1374); the bridge modules are only
built when the webview can't reach the system clipboard. `apps/bpmn-webview/src/bootstrap.ts`
wires the bridges with a promise-based resolver pattern and hands them to
`createClipboardModules`, which returns the two DI modules + their `value`
bindings:

```typescript
const requestElementClipboard = async (): Promise<string> => {
    elementClipboardResolver = createResolver<ClipboardQuery>();
    host.postMessage(new GetClipboardCommand());
    return (await elementClipboardResolver.wait())?.text ?? "";
};
const writeElementClipboard = (text: string): void => {
    host.postMessage(new SetClipboardCommand(text));
};
// (text bridge mirrors this with the *Text* commands / TextClipboardQuery)

clipboardModules = createClipboardModules({
    element: { requestClipboard: requestElementClipboard, writeClipboard: writeElementClipboard },
    text: { requestClipboard: requestTextClipboard, writeClipboard: writeTextClipboard },
});
```

bootstrap selects the native path (no modules) for dev builds and for a
`clipboard: "native"` consumer (the demo); a real host gets the protocol bridge
above. The single-bridge public override (`clipboard: { bridge }`) maps onto both
channels because `createClipboardModules` defaults `text` to `element`.

## Webview Theming

Webviews **must** respect the user's VS Code theme:

- BPMN/DMN webviews ship `lightTheme.css` and `darkTheme.css`
- Theme detection via VS Code's body classes — `document.body.classList.contains("vscode-dark")` / `"vscode-high-contrast"` (`libs/shared/src/lib/theme.ts`), watched by a `MutationObserver` on the body `class` attribute
- Initial HTML loads light theme; JS swaps stylesheet on init
- Use VS Code CSS custom properties (`--vscode-*`) for colors when possible
- Test with light, dark, and high-contrast themes
- See the vscode-webviews skill for implementation details

## Accessibility & Keyboard Shortcuts

- All interactive elements must be keyboard-accessible
- Use ARIA labels for non-text elements
- Respect VS Code's `editor.fontSize` and zoom level
- The properties panel uses standard HTML form elements with labels
- Keyboard shortcuts (Cmd/Ctrl+C/V/A) work in both diagram and properties panel via the polyfills described above
- The select-all handler (`main.ts`) ensures Cmd/Ctrl+A works correctly in contenteditable fields

### `setContext` for Keybinding Visibility

The (`vscode`-free) `EditorSessionStore` reports its open-editor count through a callback; the host wires that callback in `composition/sharedDeps.ts` to a `setContext` call, controlling when-clause visibility:

```typescript
// composition/sharedDeps.ts — invoked by the store whenever the open count changes
commands.executeCommand("setContext", "bpmn-modeler.openCustomEditors", count);
```

This allows `package.json` keybinding entries to use `"when": "bpmn-modeler.openCustomEditors > 0"` so shortcuts only activate when a BPMN editor is focused.

## Toggle Text Editor

`VsCodeTextEditor.toggle(documentPath)` opens the standard text editor alongside a custom editor:

```typescript
await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
```

This lets users inspect raw BPMN/DMN XML.
