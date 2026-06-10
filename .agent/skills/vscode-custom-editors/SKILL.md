---
name: vscode-custom-editors
description: VS Code CustomTextEditorProvider pattern — registration, document sync, lifecycle, disposables, the generic ModelerEditorController + EditorSessionParticipant pattern, BPMN/DMN differences. Use this skill whenever working on the editor controller, document synchronization, CustomTextEditorProvider, webview lifecycle, editor registration, resolveCustomTextEditor, EditorSessionStore, session participants, or understanding how BPMN/DMN files are opened and edited. Also consult this skill when debugging issues with editor state, hidden webviews, tab switching, or disposable cleanup — even if the user doesn't mention "custom editors" explicitly.
---

# VS Code Custom Editors

How this project implements VS Code custom editors using `CustomTextEditorProvider`, including registration, document synchronization, and lifecycle management.

## CustomTextEditorProvider Overview

VS Code's `CustomTextEditorProvider` allows extensions to replace the default text editor for specific file types with a custom webview-based editor while keeping the standard `TextDocument` as the data model.

**Key distinction**: Unlike `CustomReadonlyEditorProvider` or `CustomEditorProvider` (which use binary `CustomDocument`), `CustomTextEditorProvider` works with the existing `TextDocument` — meaning VS Code handles file I/O, dirty tracking, save, and undo/redo at the document level.

## How This Project Uses Custom Editors

### Registration (`package.json`)

Custom editors are registered in `apps/vscode-plugin/package.json` under `contributes.customEditors`:

- `"bpmn-modeler.bpmn"` — opens by default for `*.bpmn` files
- `"bpmn-modeler.dmn"` — opens by default for `*.dmn` files

The `priority: "default"` means these editors open automatically. Users can still right-click → "Open With..." to use the standard text editor.

### Provider Registration

The single generic controller has a `register(context)` instance method that calls `window.registerCustomEditorProvider()` (once per `viewType`) and pushes the disposable into the extension context.

**Important**: BPMN and DMN editors do **not** pass `retainContextWhenHidden`. Their webviews are destroyed when hidden and recreated when shown again. `EditorSessionStore.postMessage()` throws an error if code tries to message a hidden webview. Only `DeploymentController` (which uses `registerWebviewViewProvider`, not `registerCustomEditorProvider`) passes `retainContextWhenHidden: true`.

### Controller Implementation

A single generic controller — `ModelerEditorController` (`src/modeler/editor-session/`) — serves both `.bpmn` and `.dmn`. Everything that differs between them is passed as `options` (the `viewType`, the per-editor `WebviewMessageRouter`, the participant list, the BPMN-only diff `delegateResolve` hook). It implements `CustomTextEditorProvider` with the single method `resolveCustomTextEditor(document, webviewPanel, _token)`.

VS Code calls this each time a file matching the selector is opened. The `editorId` is the **full URI string** (`document.uri.toString()`, not just the path — so a `git:` diff ref and the `file:` working tree resolve to distinct ids). Inside, the controller:

1. **Diff branch (BPMN only)** — if `options.delegateResolve` returns true the diff controller owns the pane and no session is created.
2. **Registers the editor** — `editorStore.register(VsCodeEditorHandle.create(...))`, which sets webview HTML and the active pointer.
3. **Wires dispatch/tab/dispose** synchronously (before participants run, since the webview is already loading): message dispatch into the router, tab-change tracking, and a single aggregated dispose subscription.
4. **Runs participants** — `for (const p of options.participants) await p.onResolve(ctx)`. Each participant registers its own concern (render + service session, element-template watcher, settings broadcast, status bar, script-task teardown).

### Per-editor concerns (participants + router)

Lifecycle is split into independently testable `EditorSessionParticipant`s; webview messages go through a `WebviewMessageRouter` (not a `switch`):

| Concern | Where | Notes |
|---|---|---|
| Webview messages | `WebviewMessageRouter.dispatch` → handler factories in `<feature>/controller/webview-handlers/` | Replaces the old `switch(message.type)` |
| Render + service session | `BpmnRenderParticipant` / `DmnRenderParticipant` | `service.registerSession` + doc-change → `service.display()` |
| Element templates | `ElementTemplatesParticipant` (BPMN only) | config-folder watch via `ArtifactService.createWatcher()` |
| Settings / language | `SettingsParticipant` (BPMN only) | subscribes `BpmnSettingsBroadcaster` (watches `miragon.bpmnModeler.*`) |
| Engine-version status bar | `EngineVersionStatusBarParticipant` (BPMN only) | view-state → show/hide |
| Tab tracking | `editorStore.subscribeToTabChangeEvent` | updates the active-editor pointer |
| Dispose | controller aggregates every participant's `onDispose` into one `subscribeToDisposeEvent` | `disposeEditor` runs once, after store bookkeeping |

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
3. The editor's `WebviewMessageRouter` dispatches it to `syncDocumentHandler`, which calls `service.sync(editorId, content)`
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

Both editors share `ModelerEditorController`; the difference is purely in the `options` each is wired with (in `composition/editorFeature.ts`):

| Concern | BPMN editor | DMN editor |
|---|---|---|
| **Router handlers** | full set (get-file, element-templates, settings + script resync, properties-panel get/set, structured + text clipboard, sync, open-script-editor, navigate-to-referenced-model) | 2 (`GetDmnFileCommand`, `SyncDocumentCommand`) |
| **Participants** | `BpmnRenderParticipant`, `ElementTemplatesParticipant`, `SettingsParticipant`, `EngineVersionStatusBarParticipant`, `ScriptTaskTeardownParticipant` | `DmnRenderParticipant` only |
| **Diff delegation** | yes (`delegateResolve` → `BpmnDiffController`) | no |

DMN files don't use element templates, BPMN settings, inline scripts, or the diff viewer, so the DMN editor simply gets fewer handlers and one participant.

## Disposable Management

Each editor instance gets its own disposable list managed by `EditorSessionStore`. When the editor is closed:

1. `WebviewPanel.onDidDispose` fires the controller's single aggregated dispose subscription
2. `EditorSessionStore.disposeEditor()` disposes all per-editor subscriptions and removes the entry
3. Each participant's `onDispose` callback runs (e.g. `service.disposeSession(editorId)`, `scriptTaskSvc.disposeForEditor(editorId)`) — collected by the controller and run **once**, after the store's bookkeeping
4. `EditorSessionStore` moves the active-editor pointer to the most recently registered remaining editor, or clears it

This per-editor cleanup prevents memory leaks when editors are opened and closed repeatedly.

## Multi-Editor Scenarios

Multiple editors can be open simultaneously (e.g., two `.bpmn` files side by side). `EditorSessionStore` maintains:
- A `Map` of all open editor handles keyed by `editorId` (the full `document.uri.toString()`)
- An `activeEditorId` pointer updated via `onDidChangeViewState`
- Per-editor isolation — each editor has its own webview, subscriptions, and session
- An `onDidChangeActiveEditor` event that `DeploymentController` listens to for refreshing form defaults
- A VS Code context variable (`bpmn-modeler.openCustomEditors`) tracking the count of open editors, used in keybinding/menu `when` clauses

Services operate on the active editor by default. The echo-prevention guard is per-session, so concurrent edits in different editors don't interfere.

## Key Files

- **Generic editor controller**: `apps/vscode-plugin/src/modeler/editor-session/ModelerEditorController.ts`
- **Session participant interface**: `apps/vscode-plugin/src/modeler/editor-session/EditorSessionParticipant.ts`
- **BPMN participants / handlers**: `apps/vscode-plugin/src/modeler/bpmn/controller/editor-participants/`, `…/webview-handlers/bpmnMessageHandlers.ts`
- **Message router**: `apps/vscode-plugin/src/shared/infrastructure/WebviewMessageRouter.ts`
- **Command Controller**: `apps/vscode-plugin/src/modeler/bpmn/controller/CommandController.ts`
- **Deployment Controller**: `apps/vscode-plugin/src/deployment/controller/DeploymentController.ts`
- **Editor session store / handle**: `apps/vscode-plugin/src/shared/infrastructure/EditorSessionStore.ts`, `…/VsCodeEditorHandle.ts`
- **Document Adapter**: `apps/vscode-plugin/src/shared/infrastructure/VsCodeDocument.ts`
- **Message Types**: `libs/shared/src/lib/modeler.ts` (modeler `Command`/`Query` classes) + `messages.ts` (base + cross-cutting)
- **Registration**: `apps/vscode-plugin/package.json` → `contributes.customEditors`
- **Editor wiring**: `apps/vscode-plugin/src/composition/editorFeature.ts`; **activation**: `apps/vscode-plugin/src/main.ts`

## Related Skills

- **`/architecture`** — Echo-prevention guard, service layer patterns, dependency injection
- **`/vscode-webviews`** — HTML generation, CSP, `postMessage` protocol, asset URIs
- **`/bpmn-js`** — bpmn-js modeler internals, `commandStack.changed`, XML import/export
