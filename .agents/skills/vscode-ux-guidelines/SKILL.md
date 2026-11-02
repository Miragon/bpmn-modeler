---
name: vscode-ux-guidelines
description: Project UX rules for VS Code. Covers choosing notifications, status bar, quick picks or the output channel, webview clipboard, theming, accessibility and when-clause context keys. Use when adding user-facing feedback, shortcuts or clipboard handling.
---

# VS Code UX Guidelines

VS Code UX patterns and how this project applies them. The core principle: **use native VS Code APIs before building custom webview UI**.

## Choosing the Right Feedback Channel

Pick the lightest channel that gets the job done. Heavier channels interrupt the user more.

| Channel                      | When to use                                                                    | When NOT to use                                         |
|------------------------------|--------------------------------------------------------------------------------|---------------------------------------------------------|
| **Output Channel**           | Detailed logs, diagnostics, verbose info the user checks on demand             | Primary user feedback: most users never open it         |
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
notifier.showWarning('Marketplace added, but none of its sources could be fetched');
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

**Keep messages short:** one sentence, no technical jargon for user-facing text.

## Status Bar

The core shows status through `StatusBarPort` (`libs/modeler-core/src/kernel/domain/hostPorts.ts`): `show(slot, view)` and `hide(slot)`. Each slot (`elementTemplates`, `engineVersion`, `bpmnlint`, `deploymentTarget`) holds one `StatusView` (`kernel/domain/statusView.ts`) with its text, icon, tone, tooltip, click action and `transient` flag. The core writes the text; a host only places the slot and renders the view.

`VsCodeStatusBar` (`apps/vscode-plugin/src/shared/infrastructure/VsCodeStatusBar.ts`) creates one item per slot on first show, at the side and priority its placement table gives. It maps each icon to a codicon, each tone to a theme colour (`warning` to `statusBarItem.warningBackground`) and each action to a command:

```typescript
statusBar.show("elementTemplates", {
    text: "Element templates (3)",
    icon: "check",
    tone: "neutral",
    transient: true,
});                                    // "$(check) Element templates (3)", hidden after 3 s
statusBar.hide("elementTemplates");    // hide explicitly (used on error paths)
```

A feature builds its slot's view in its `domain/` as a pure function (`elementTemplatesStatusView`, `engineVersionStatusView`, `bpmnlintStatusView` in `libs/modeler-core/src/modeler/bpmn/domain/`, `deploymentStatusView` in `libs/modeler-core/src/deployment/domain/`). A time in a view is formatted in the core, in the modeler language (`timestampFormatter`), so both hosts show the same text. When the feature's own state can hide the slot, the function returns `undefined` for it, and the service hands the result to `updateStatusSlot` (`kernel/service/`), which shows the view or hides the slot. A slot that hides only when its editor blurs or closes is hidden by the session participant with `hide` (`BpmnlintParticipant`).

A new status is a new slot: add it to `StatusSlot`, write its view function, and place it in `VsCodeStatusBar`'s table and in IntelliJ (`StatusSlot` in `StatusView.kt`, its widget id in `StatusBarSlots.kt`, a `StatusSlotWidgetFactory` subclass registered in `plugin.xml`; `StatusSlotPlacementTest` fails until it is placed). The port, the `statusBar/update` RPC and the Kotlin router stay as they are.

A transient view hides itself after 3 s. Each slot reuses one item, so **a
later show or hide of a slot cancels its pending auto-hide**. Any status that
hides itself keeps that rule. The template loads of all editors share one
slot, so the core tracks them in `TemplateLoadStatus`
(`libs/modeler-core/src/modeler/bpmn/domain/`): the spinner stays while any
load reads from disk, and when the last one ends, the slot shows that load's
count for 3 s, or hides if it failed or was superseded.

Place a slot as VS Code's [status bar guideline](https://code.visualstudio.com/api/ux-guidelines/status-bar) says: status for the whole workspace and its progress on the **left** (the element-template load, which also runs for diagrams in the background), the focused diagram's state on the **right** (engine version, BPMNlint, deployment target). Keep items concise: an icon and short text, with tooltips for detail.

## Quick Picks

`VsCodePicker` (`apps/vscode-plugin/src/shared/infrastructure/VsCodePicker.ts`) implements the core's `PickerPort`, so every quick pick a core service asks for goes through it. A new prompt uses its `choose`, `chooseMany`, `confirm` or `searchAndChoose` with a prompt the core builds (`libs/modeler-core/src/kernel/domain/prompts.ts`). `VsCodePicker` shows an item's file path relative to the workspace, filters on descriptions too, draws an icon as its codicon, and reveals a search's busy list only after 150 ms. The core builds the execution platform of a new BPMN model (`newModelEnginePrompt`), the engine version (`engineVersionPrompt`), the migration scope (`migrationScopePrompt`), a script's language (`scriptLanguagePrompt`), the cleanup confirmation (`confirmation`, which summarises the affected items), the choice among the files a navigation found (`locatedFileChoices`) and every deployment prompt (`libs/modeler-core/src/deployment/domain/deploymentPrompts.ts`: the payload file, the active target, the status-bar menu, the files to deploy, the additional files, and the confirmations to delete a target and to send credentials to a new host). The core orders a file list by the workspace-relative path `VsCodePicker` shows (`fileChoicesInWorkspaceOrder`), except the payload files, which stay nearest first; either way, keep the order a prompt gives. A prompt only a VS Code command needs (the UI language, the marketplace scope) calls `window.showQuickPick` in its controller:

```typescript
const result = await window.showQuickPick(items, {
  placeHolder: 'Select the modeler language',
});
```

If the user cancels (Escape), the generic prompts answer `undefined`, `[]` or `false` and the caller decides what that means: dismissing an engine, migration or deployment choice writes nothing and shows no message, while declining to send credentials to a new host reports that nothing was sent. Use quick picks for selection from a list. Don't abuse notification buttons for this.

The one input box a core service asks for is the marketplace's personal access token. `VsCodeTokenPrompt` (`apps/vscode-plugin/src/templateMarketplace/infrastructure/VsCodeTokenPrompt.ts`) implements `TokenPromptPort` and shows the `TokenPrompt` the core builds (`libs/modeler-core/src/template-marketplace/domain/tokenPrompt.ts`: the title, the prompt and `password: true`) in `window.showInputBox`. It adds only `ignoreFocusOut: true`, because the user leaves VS Code to create the token. It returns the answer as typed, and the core takes a blank answer for no token, so the adapter does not trim.

## Output Channel

`VsCodeNotifier` wraps a `LogOutputChannel` directly (there is no separate logger class):

```typescript
notifier.logInfo('Element templates loaded from: /path/to/templates');
notifier.logWarning('No element templates found in workspace');
notifier.logError(new Error('Failed to parse element template: invalid JSON'));  // Error object, not string
```

The webview sends `LogInfoCommand` / `LogWarningCommand` / `LogErrorCommand` messages to the host, which writes them to the output channel. This project uses a single channel for the modeler. In the BPMN webview the document lines come from `apps/bpmn-webview/src/session/documentSession.ts` (open and refresh failures) and the shared `libs/shared/src/lib/webviewDocumentSync.ts` (sync failures) and `session/surfaceDocument.ts` (import warnings), the surface-creation and mode-switch failures from `session/modeController.ts`, and a failed host message is prefixed with its type by `session/messageRouter.ts`.

## Clipboard Access

Webviews run in sandboxed iframes without `clipboard-read`/`clipboard-write` permissions, so all clipboard access must go through the extension host via `vscode.env.clipboard`.

### Message Types

Defined in `libs/shared/src/lib/modeler.ts`:

Two separate host round-trips: **element** clipboard (BPMN shapes as JSON) and
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

The BPMN `WebviewMessageRouter` dispatches incoming `GetClipboardCommand` / `SetClipboardCommand` to the clipboard handlers in `libs/modeler-core/src/modeler/bpmn/infrastructure/bpmnMessageHandlers.ts`, which call `BpmnClipboardMediator` → `VsCodeClipboard`.

### Webview Side: Two DI Modules

The webview runs two **bpmn-js DI modules** (from the shared
`libs/bpmn-clipboard` package, `@miragon/bpmn-modeler-clipboard`) because diagram
elements and contenteditable labels have different event handling. The webview
only supplies the `clipboard` option (`apps/bpmn-webview/src/session/protocolClipboard.ts`);
`@miragon/bpmn-modeler` builds the DI modules from it via
`createClipboardModules` in `packages/bpmn-modeler/src/modeler.ts`. Each module
receives its host bridge through didi value injection: a `{ requestClipboard,
writeClipboard }` pair.

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
editing is active, since it fires before diagram-js's `DirectEditing._handleKey`
calls `stopPropagation()`.

- **Cmd/Ctrl+C**: Reads `window.getSelection()`, writes via `textClipboardBridge` → `SetTextClipboardCommand`.
- **Cmd/Ctrl+V**: Reads via `textClipboardBridge` → `GetTextClipboardCommand`, dispatches a synthetic `ClipboardEvent("paste")`, falls back to `document.execCommand("insertText")`.

See the `bpmn-js` skill for the full three-layer copy-paste architecture (the
third layer is a document-level FEEL-editor polyfill outside bpmn-js DI, also
installed by `@miragon/bpmn-modeler` from the `clipboard` option).

### Wiring (bridge override only)

The native browser clipboard is the default (#1374); the bridge modules are only
built when the webview can't reach the system clipboard.
`resolveClipboard` (`apps/bpmn-webview/src/session/protocolClipboard.ts`) wires
one host channel per clipboard with a promise-based resolver pattern into a
`ClipboardOptions` value. The surface factories (`session/surfaceFactories.ts`)
pass it as `clipboard` to `createModeler` / `createDesigner`, and the session
router routes each `ClipboardQuery` / `TextClipboardQuery` reply to its channel:

```typescript
let pendingReply = createResolver<Reply>();
const bridge: ClipboardBridge = {
    requestClipboard: async () => {
        pendingReply = createResolver<Reply>();
        host.postMessage(commands.request()); // GetClipboardCommand / GetTextClipboardCommand
        // Unanswered after HOST_REPLY_TIMEOUT_MS: logs a warning and pastes nothing.
        return pastedText(await pendingReply.wait(HOST_REPLY_TIMEOUT_MS));
    },
    writeClipboard: (text) => host.postMessage(commands.write(text)), // Set(Text)ClipboardCommand
};
const receive = (reply: Reply) => pendingReply.done(reply);

options = { bridge: elementChannel.bridge, text: textChannel.bridge };
```

`BpmnModeler.init()` turns that into
`createClipboardModules({ element: clip.bridge, text: clip.text })` and installs
the FEEL/contenteditable polyfill off `text ?? bridge`; `BpmnDesigner`
(`packages/bpmn-modeler/src/design/designer.ts`) does the same.

`resolveClipboard` returns no `clipboard` option (native path) for dev builds and
for a `clipboard: "native"` caller; a real host gets the protocol bridge above. A
consumer calling `createModeler` without a `clipboard` option gets the native
path too. The single-bridge public override (`clipboard: { bridge }`) maps onto both
channels because `createClipboardModules` defaults `text` to `element`.

## Webview Theming

Webviews **must** respect the user's VS Code theme:

- Theme detection via VS Code's body classes: `document.body.classList.contains("vscode-dark")` / `"vscode-high-contrast"`, watched by a `MutationObserver` on the body `class` attribute
- Both BPMN and DMN theme per-instance via their package's scope attribute (`data-bpmn-theme` / `data-dmn-theme`); theme CSS is in the bundle, no `#theme-link`. The shared host adapter lives in `libs/shared/src/lib/hostTheme.ts`. See [BPMN modeler: themes and locale](../../../docs/adr/bpmn-modeler.md#themes-and-locale) (BPMN) and [DMN modeler: themes](../../../docs/adr/dmn-modeler.md#themes) (DMN)
- Use VS Code CSS custom properties (`--vscode-*`) for colors when possible
- Test with light, dark, and high-contrast themes
- See the vscode-webviews skill for implementation details

## Accessibility & Keyboard Shortcuts

- All interactive elements must be keyboard-accessible
- Use ARIA labels for non-text elements
- Respect VS Code's `editor.fontSize` and zoom level
- The properties panel uses standard HTML form elements with labels
- Keyboard shortcuts (Cmd/Ctrl+C/V/A) work in both diagram and properties panel via the polyfills described above
- The select-all guard (`onSelectAllKeydown` in `packages/bpmn-modeler/src/propertiesPanelClipboard.ts`) ensures Cmd/Ctrl+A works correctly in contenteditable fields
- The BPMN webview makes the page `inert` while a mode switch, a destructive flush or an engine reload runs. Take every such lock from the one `createInertLockGroup(document.body)` in `apps/bpmn-webview/src/bootstrap.ts` (the document session and `session/modeController.ts` each create theirs from it), so the last release restores the page's own `inert` state
- Escape on the closed mode strip returns focus to the canvas (`session/modeController.ts`)

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
