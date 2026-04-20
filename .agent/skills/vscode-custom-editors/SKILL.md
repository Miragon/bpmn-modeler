---
name: vscode-custom-editors
description: VS Code CustomTextEditorProvider pattern — registration, document sync, lifecycle, disposables, editor controllers, BPMN/DMN differences. Use this skill whenever working on editor controllers, document synchronization, CustomTextEditorProvider, webview lifecycle, editor registration, resolveCustomTextEditor, EditorStore, or understanding how BPMN/DMN files are opened and edited. Also consult this skill when debugging issues with editor state, hidden webviews, tab switching, or disposable cleanup — even if the user doesn't mention "custom editors" explicitly.
---

# VS Code Custom Editors

How this project implements VS Code custom editors using `CustomTextEditorProvider`, including registration, document synchronization, and lifecycle management.

## CustomTextEditorProvider Overview

VS Code's `CustomTextEditorProvider` allows extensions to replace the default text editor for specific file types with a custom webview-based editor while keeping the standard `TextDocument` as the data model.

**Key distinction**: Unlike `CustomReadonlyEditorProvider` or `CustomEditorProvider` (which use binary `CustomDocument`), `CustomTextEditorProvider` works with the existing `TextDocument` — meaning VS Code handles file I/O, dirty tracking, save, and undo/redo at the document level.

## How This Project Uses Custom Editors

### Registration (`package.json`)

Custom editors are registered in `apps/modeler-plugin/package.json` under `contributes.customEditors`:

- `"bpmn-modeler.bpmn"` — opens by default for `*.bpmn` files
- `"bpmn-modeler.dmn"` — opens by default for `*.dmn` files

The `priority: "default"` means these editors open automatically. Users can still right-click → "Open With..." to use the standard text editor.

### Provider Registration

Each controller has a `register(context)` instance method that calls `window.registerCustomEditorProvider()` and pushes the disposable into the extension context.

**Important**: BPMN and DMN controllers do **not** pass `retainContextWhenHidden`. Their webviews are destroyed when hidden and recreated when shown again. `EditorStore.postMessage()` throws an error if code tries to message a hidden webview. Only `DeploymentController` (which uses `registerWebviewViewProvider`, not `registerCustomEditorProvider`) passes `retainContextWhenHidden: true`.

### Controller Implementation

Controllers (`BpmnEditorController`, `DmnEditorController`) implement `CustomTextEditorProvider` with a single method: `resolveCustomTextEditor(document, webviewPanel, _token)`.

VS Code calls this each time a file matching the selector is opened. The `editorId` is `document.uri.path`. Inside, the controller:

1. **Creates the editor session** — calls `EditorStore.createEditor()` which sets webview HTML, registers the entry, and sets it as active
2. **Registers a service session** — calls `service.registerSession(editorId)`
3. **Subscribes to events** — all subscriptions go through `EditorStore` helpers that manage per-editor disposable lists
4. **Sets up artifact watchers** — BPMN only, via `ArtifactService.createWatcher()`

### Event Subscriptions

The controller sets up these subscriptions per editor:

| Subscription             | Source                             | Handler                                                                 |
|--------------------------|------------------------------------|-------------------------------------------------------------------------|
| `onMessage`              | `webview.onDidReceiveMessage`      | Routes `Command` messages to service methods via `switch(message.type)` |
| `onDocumentChanged`      | `workspace.onDidChangeTextDocument`| Calls `service.display()` to push updated content to webview            |
| `onConfigurationChanged` | `workspace.onDidChangeConfiguration`| Re-reads settings and sends updated config to webview (BPMN only)      |
| `onTabChanged`           | `WebviewPanel.onDidChangeViewState`| Updates `EditorStore`'s active editor pointer when `panel.active` is true |
| `onDispose`              | `WebviewPanel.onDidDispose`        | Cleans up session, disposables, file watchers                           |

## Document Synchronization

### Extension Host → Webview (Display)

When the document content changes (external edit, git checkout, etc.):
1. `onDidChangeTextDocument` fires
2. Controller calls `service.display(editorId)`
3. Service checks echo-prevention guard (see `/architecture` skill)
4. If not guarded: reads document text, sends `BpmnFileQuery` (or `DmnFileQuery`) to webview
5. Webview imports the XML into the modeler

### Webview → Extension Host (Sync)

When the user edits the diagram in the webview:
1. `commandStack.changed` fires in bpmn-js
2. Webview exports current XML, sends `SyncDocumentCommand` to extension host
3. Controller routes to `service.sync(editorId, content)`
4. Service acquires echo-prevention guard, writes XML to document via `VsCodeDocument`
5. `VsCodeDocument` uses `WorkspaceEdit.replace()` to update the full document content

### WorkspaceEdit.replace() Pattern

Document writes replace the entire document content using `WorkspaceEdit`:

```typescript
const edit = new WorkspaceEdit();
edit.replace(doc.uri, new Range(0, 0, doc.lineCount, 0), content);
return workspace.applyEdit(edit);
```

VS Code handles dirty tracking and undo/redo integration automatically. The `write()` method short-circuits if the new content equals the existing text (`doc.getText() === content`).

## BPMN vs DMN Controller Differences

The DMN controller is significantly simpler than the BPMN controller:

| Feature                   | BPMN Controller             | DMN Controller          |
|---------------------------|-----------------------------|-------------------------|
| **Message types handled** | 6 (`GetBpmnFileCommand`, `GetElementTemplatesCommand`, `GetBpmnModelerSettingCommand`, `GetClipboardCommand`, `SetClipboardCommand`, `SyncDocumentCommand`) | 2 (`GetDmnFileCommand`, `SyncDocumentCommand`) |
| **Artifact watching**     | Yes — watches element-template JSON files via `ArtifactService` | No |
| **Setting subscriptions** | Yes — `alignToOrigin`, `showTransactionBoundaries`, `configFolder` | No |
| **Service dependencies**  | `editorStore`, `bpmnService`, `artifactSvc`, `vsUI` | `editorStore`, `dmnService`, `vsUI` |

DMN files don't use element templates or BPMN-specific settings, so the DMN controller omits those concerns entirely.

## Disposable Management

Each editor instance gets its own disposable list managed by `EditorStore`. When the editor is closed:

1. `WebviewPanel.onDidDispose` fires
2. `EditorStore.disposeEditor()` disposes all per-editor subscriptions and removes the entry
3. The controller's `onDispose` callback runs (e.g. `service.disposeSession(editorId)`)
4. `EditorStore` moves the active-editor pointer to the most recently opened remaining editor, or clears it

This per-editor cleanup prevents memory leaks when editors are opened and closed repeatedly.

## Multi-Editor Scenarios

Multiple editors can be open simultaneously (e.g., two `.bpmn` files side by side). `EditorStore` maintains:
- A `Map<string, EditorEntry>` of all open editors keyed by `document.uri.path`
- An `activeEditorId` pointer updated via `onDidChangeViewState`
- Per-editor isolation — each editor has its own webview, subscriptions, and session
- An `onDidChangeActiveEditor` event that `DeploymentController` listens to for refreshing form defaults
- A VS Code context variable (`bpmn-modeler.openCustomEditors`) tracking the count of open editors, used in keybinding/menu `when` clauses

Services operate on the active editor by default. The echo-prevention guard is per-session, so concurrent edits in different editors don't interfere.

## Key Files

- **BPMN Controller**: `apps/modeler-plugin/src/controller/BpmnEditorController.ts`
- **DMN Controller**: `apps/modeler-plugin/src/controller/DmnEditorController.ts`
- **Command Controller**: `apps/modeler-plugin/src/controller/CommandController.ts`
- **Deployment Controller**: `apps/modeler-plugin/src/controller/DeploymentController.ts`
- **Editor Store**: `apps/modeler-plugin/src/infrastructure/EditorStore.ts`
- **Document Adapter**: `apps/modeler-plugin/src/infrastructure/VsCodeDocument.ts`
- **Message Types**: `libs/shared/src/lib/modeler.ts` (all `Command` and `Query` classes)
- **Registration**: `apps/modeler-plugin/package.json` → `contributes.customEditors`
- **Activation**: `apps/modeler-plugin/src/main.ts`

## Related Skills

- **`/architecture`** — Echo-prevention guard, service layer patterns, dependency injection
- **`/vscode-webviews`** — HTML generation, CSP, `postMessage` protocol, asset URIs
- **`/bpmn-js`** — bpmn-js modeler internals, `commandStack.changed`, XML import/export
