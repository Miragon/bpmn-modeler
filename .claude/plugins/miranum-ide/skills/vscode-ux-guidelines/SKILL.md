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

`VsCodeUI` (`apps/modeler-plugin/src/infrastructure/VsCodeUI.ts`) wraps notification calls with fire-and-forget methods:

```typescript
// Simple notifications — no action buttons, returns void
ui.showInfo('Diagram saved successfully');
ui.showError('Failed to deploy process');
```

When you need **action buttons**, use the raw VS Code API directly (as `apps/modeler-plugin/src/main.ts` does for the release notification):

```typescript
window
    .showInformationMessage(
        `Camunda Modeler updated to v${current}. See what's new!`,
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

`VsCodeSettings` (`apps/modeler-plugin/src/infrastructure/VsCodeSettings.ts`) manages status bar items for element template feedback:

```typescript
settings.showElementTemplatesLoading();      // "$(loading~spin) Loading element templates…"
settings.showElementTemplatesReady(count);   // "$(check) Element templates (N)" — auto-hides after 3s
settings.hideElementTemplatesStatus();       // Hide explicitly (used on error paths)
```

The status bar item is lazily created. Use the **right side** for transient status and progress. Keep items concise — icon + short text, with tooltips for detail.

## Quick Picks

`VsCodeSettings.getExecutionPlatformVersion()` presents a quick pick when the execution platform cannot be auto-detected from the BPMN XML:

```typescript
const items = [
  { label: 'Camunda 7', value: 'camunda7' },
  { label: 'Camunda 8', value: 'camunda8' },
];
const selected = await vscode.window.showQuickPick(items, {
  placeHolder: 'Select the execution platform',
});
```

If the user cancels (Escape), a `UserCancelledError` is thrown and handled gracefully. Use quick picks for selection from a list — don't abuse notification buttons for this.

## Output Channel

`VsCodeUI` delegates to `VsCodeLogger`, which wraps a `LogOutputChannel`:

```typescript
ui.logInfo('Element templates loaded from: /path/to/templates');
ui.logWarning('No element templates found in workspace');
ui.logError(new Error('Failed to parse element template: invalid JSON'));  // Error object, not string
```

The webview sends `LogInfoCommand` / `LogErrorCommand` messages to the host, which writes them to the output channel. This project uses a single channel for the modeler.

## Clipboard Access

Webviews run in sandboxed iframes without `clipboard-read`/`clipboard-write` permissions, so all clipboard access must go through the extension host via `vscode.env.clipboard`.

### Message Types

Defined in `libs/shared/src/lib/modeler.ts`:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `GetClipboardCommand` | webview → extension host | Request to read system clipboard |
| `SetClipboardCommand(text)` | webview → extension host | Request to write text to system clipboard |
| `ClipboardQuery(text)` | extension host → webview | Response with clipboard content |

### Extension Host Side

`VsCodeUI` exposes async clipboard methods:

```typescript
async readClipboard(): Promise<string>   // vscode.env.clipboard.readText()
async writeClipboard(text: string): Promise<void>  // vscode.env.clipboard.writeText()
```

`BpmnEditorController` routes incoming `GetClipboardCommand` / `SetClipboardCommand` to `BpmnModelerService`, which calls `VsCodeUI`.

### Webview Side — Two Polyfills

The webview needs two separate clipboard polyfills because diagram elements and contenteditable labels have different event handling:

**1. Diagram element copy/paste** (`apps/bpmn-webview/src/app/modeler.ts`):

`installClipboardInterceptor(requestClipboard, writeClipboard)` intercepts bpmn-js `copyPaste.elementsCopied` and `copyPaste.pasteElements` events at priority 2051 (above NativeCopyPaste).

- **Copy**: Serializes the element tree as `"bpmn-js-clip----" + JSON.stringify(tree)` and sends it to the extension host via `SetClipboardCommand`.
- **Paste**: When the internal clipboard is empty (cross-editor paste), requests clipboard text via `GetClipboardCommand`, deserializes the JSON, and re-triggers paste. Snapshots the event context before the async `await` to prevent `defaultPrevented` issues.

**2. Contenteditable label copy/paste** (`apps/bpmn-webview/src/app/propertiesPanelClipboard.ts`):

`installContentEditableClipboardPolyfill(requestClipboard, writeClipboard)` installs a **capture-phase** keydown listener that fires before diagram-js's `DirectEditing._handleKey` (which calls `stopPropagation()` on every keydown).

- **Cmd/Ctrl+C**: Extracts selected text from the contenteditable element, sends via `SetClipboardCommand`.
- **Cmd/Ctrl+V**: Requests clipboard via `GetClipboardCommand`, dispatches a synthetic `ClipboardEvent("paste")`, falls back to `document.execCommand("insertText")`.

### Wiring (Production Only)

Both polyfills are wired in `apps/bpmn-webview/src/main.ts` using a promise-based resolver pattern:

```typescript
const requestClipboard = async (): Promise<string> => {
    clipboardResolver = createResolver<ClipboardQuery>();
    vscode.postMessage(new GetClipboardCommand());
    return (await clipboardResolver.wait())?.text ?? "";
};

const writeClipboard = (text: string): void => {
    vscode.postMessage(new SetClipboardCommand(text));
};

bpmnModeler.installClipboardInterceptor(requestClipboard, writeClipboard);
installContentEditableClipboardPolyfill(requestClipboard, writeClipboard);
```

These are only installed in production (not development) because in dev mode the webview runs in a regular browser with native clipboard access.

## Webview Theming

Webviews **must** respect the user's VS Code theme:

- BPMN/DMN webviews ship `lightTheme.css` and `darkTheme.css`
- Theme detection via `document.body.dataset.vscodeThemeKind`
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

`EditorStore` uses `commands.executeCommand('setContext', key, value)` to control when-clause visibility:

```typescript
commands.executeCommand("setContext", "bpmn-modeler.openCustomEditors", count);
```

This allows `package.json` keybinding entries to use `"when": "bpmn-modeler.openCustomEditors > 0"` so shortcuts only activate when a BPMN editor is focused.

## Toggle Text Editor

`VsCodeUI.toggleTextEditor()` opens the standard text editor alongside a custom editor:

```typescript
await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
```

This lets users inspect raw BPMN/DMN XML.
