---
name: architecture
description: Internal architecture of the vscode-plugin extension host (Node.js) — feature-folder layout with a four-layer split (domain, infrastructure, service, controller) inside each feature, host-capability ports + hexagonal engine ports, deployment subsystem (Camunda 7 & 8), per-feature register() composition root, WebviewMessageRouter dispatch, EditorSessionParticipant lifecycle, EditorSessionStore + VsCodeEditorHandle, echo-prevention session guards, webview message protocol (Query/Command), and the ArchUnitTS architecture tests. Use this skill when working on extension-host code — implementing features, fixing bugs, reviewing PRs, refactoring services, adding message types, understanding editor tracking, tracing webview message flow, integrating external systems, or modifying feature wiring. See also bpmn-js, vscode-webviews, vscode-custom-editors, and vscode-ux-guidelines for adjacent concerns.
---

# Extension Architecture

This skill describes the internal architecture of the `vscode-plugin` VS Code extension — the Node.js host process that manages editors, documents, and communication with browser-based webviews.

All paths below are relative to `apps/vscode-plugin/` unless stated otherwise. For webview-side architecture, see the `bpmn-js` and `vscode-webviews` skills.

## Organising principle: feature folders

`src/` is organised **by feature**, not by layer. Each feature folder owns the four classic layers as subfolders (`domain/ service/ controller/ infrastructure/`), and any cross-feature use goes only through that feature's `index.ts` barrel. There is **no DI framework** — wiring is plain constructor calls, grouped into one `register(context, deps)` per feature under `src/composition/`.

```
src/
  main.ts            Activation: build shared deps, then call each feature's register()
  architecture.spec.ts  Executable architecture rules (ArchUnitTS) — see below
  composition/       One register(context, deps) per feature — the wiring root
  shared/            Cross-feature substrate (not a feature): domain/ service/ infrastructure/
  modeler/
    editor-session/  Generic custom-editor host: ModelerEditorController + EditorSessionParticipant
    bpmn/  dmn/       feature folders: { domain/ service/ controller/ infrastructure/  index.ts }
  diff/  deployment/  scriptTask/  navigation/  migration/
                     feature folders, same per-feature layout
```

The four layers still hold *within* each feature: `domain` is pure (no `vscode`/Node host modules, no outer layer); `service` orchestrates domain + infrastructure and never imports `vscode` or `controller`; `infrastructure` is the only adapter layer that imports `vscode`; `controller` is thin VS Code-event → service wiring. `shared/`, `composition/`, and `modeler/editor-session/` are deliberately **not** features (so they are exempt from the feature-isolation rule).

## `shared/` — cross-feature substrate

### `shared/domain/` (pure types, zero external deps)

| File | Purpose |
|---|---|
| `session.ts` | `ModelerSession` — per-editor echo-prevention guard counter |
| `BpmnDocument.ts` | Value object wrapping BPMN XML — execution-platform detection, empty checks, process-definition key |
| `EditorSession.ts` | Per-session event/subscription types (`DocumentChangeEvent`, `SettingChange`, `EditorSubscription`) |
| `engineVersions.ts` | Supported Camunda engine-version constants/helpers |
| `errors.ts` | Domain error types (`NoWorkspaceFolderFoundError`, `FileNotFound`, `UserCancelledError`, deployment errors, …) |
| `hostPorts.ts` | **Host-capability ports** — one interface per host facility (notifications, pickers, clipboard, settings, workspace fs, documents, status bar, secrets, deployment state). Services depend on these interfaces, not the concrete `VsCode*` adapters. |

### `shared/service/`

| File | Purpose |
|---|---|
| `ArtifactService.ts` | Convention-based element-template / payload discovery — walks from the file's directory up to the workspace root looking for `<configFolder>/…`. Shared by the editor and deployment features. |

### `shared/infrastructure/` (the only place that imports `vscode`)

| File | Purpose |
|---|---|
| `EditorSessionStore.ts` | `vscode`-free registry of open editors, parameterised over the `EditorHandle` port. Active-editor pointer, per-editor disposables, subscription helpers, `postMessage`. |
| `VsCodeEditorHandle.ts` | Concrete `EditorHandle` wrapping one `WebviewPanel` + `TextDocument` |
| `VsCodeNotifier.ts` | Notifications + output-channel logging (`logInfo`/`logWarning`/`logError`/`showError`) |
| `VsCodePicker.ts` | Quick-pick prompts |
| `VsCodeClipboard.ts` | `env.clipboard` access |
| `VsCodeDocument.ts` | Document read/write via `WorkspaceEdit.replace()` |
| `VsCodeWorkspace.ts` | Workspace folder resolution, file watchers |
| `VsCodeSettings.ts` | Configuration reads (`miragon.bpmnModeler.*`) |
| `VsCodeStatusBar.ts` | Status-bar items (engine version, element-template feedback) |
| `VsCodeTextEditor.ts` | Toggle/reveal the underlying text editor |
| `WebviewMessageRouter.ts` | Open/closed dispatch table for webview → host messages (see Message Protocol) |
| `WebviewHtml.ts` / `bootstrapWebview.ts` | Nonce-CSP HTML for BPMN/DMN webviews + the shared bootstrap |
| `extensionContext.ts` / `editor.ts` / `helpers.ts` | `setContext`, editor utilities, misc helpers |

> The old `VsCodeUI.ts` god-adapter was split into `VsCodeNotifier` / `VsCodePicker` / `VsCodeClipboard`. There is no `Logger.ts` — logging lives on `VsCodeNotifier`.

## Feature folders

| Feature | Key files (layer) |
|---|---|
| `modeler/editor-session/` | `ModelerEditorController.ts`, `EditorSessionParticipant.ts` (generic host, shared by `.bpmn` + `.dmn`) |
| `modeler/bpmn/` | domain `model.ts` (`BpmnModelerSetting`); service `BpmnModelerService`, `BpmnClipboardMediator`, `BpmnElementTemplatesService`, `BpmnPropertiesPanelService`, `BpmnSettingsBroadcaster`; infrastructure `PropertiesPanelStateRepository`; controller `CommandController`, `webview-handlers/bpmnMessageHandlers`, `editor-participants/*Participant` |
| `modeler/dmn/` | service `DmnModelerService`; controller `webview-handlers/dmnMessageHandlers`, `editor-participants/DmnRenderParticipant` |
| `diff/` | domain `DiffSession`; service `BpmnDiffService`; infrastructure `DiffPaneStore`, `CompareSelectionStore`, `WebviewPaneHandle`; controller `BpmnDiffController`, `BpmnCompareController` |
| `deployment/` | domain `deployment`, `ports`, `startInstance`; service `DeploymentService`, `StartInstanceService`; infrastructure `FetchHttpClient`, `VsCodeDeploymentState`, `VsCodeSecretStore`, `DeploymentWebviewHtml`, `camunda/*`; controller `DeploymentController` |
| `scriptTask/` | domain `ScriptUri`, `scriptApi`, `scriptCompletion`, `scriptLanguage`; infrastructure `BpmnScriptFileSystem`; controller `ScriptTaskService`, `ScriptCompletionProvider` |
| `navigation/` | service `ModelNavigationService`, `ReferencedModelLocator` |
| `migration/` | domain `MigrationPlan`; service `BpmnMigrationService` |

Each feature exposes a public-API barrel `index.ts`; a sibling feature imports only that barrel (enforced by the arch tests).

## Hexagonal Ports (deployment engine)

The deployment subsystem uses ports & adapters to decouple business logic from engine-specific protocols.

**Domain ports** (`deployment/domain/ports.ts`):
- `HttpClient` — transport abstraction (`postJson`, `postForm`, `postMultipart`)
- `CamundaEnginePort` — engine contract (`deploy`, `startInstance`)

**Infrastructure adapters** (`deployment/infrastructure/`):
- `FetchHttpClient` implements `HttpClient` using `globalThis.fetch`
- `camunda/Camunda7RestClient` and `camunda/Camunda8RestClient` each implement `CamundaEnginePort`
- `camunda/CamundaEngineRouter` implements `CamundaEnginePort` by dispatching to the C7 or C8 client based on `config.engine`
- `camunda/AuthHeaderResolver` converts the `AuthConfig` union into `Authorization` headers; `camunda/MultipartBuilder` builds upload bodies

**Benefit**: `DeploymentService` / `StartInstanceService` depend only on `CamundaEnginePort`. Adding a new engine version is a new adapter, no service change.

> Note the two distinct port families: `shared/domain/hostPorts.ts` abstracts the *host* (VS Code) facilities; `deployment/domain/ports.ts` abstracts the *Camunda engine*.

## Composition wiring (`main.ts` + `composition/`)

`activate()` is pure composition — build the shared collaborators once, then call each feature's `register()`:

```
const deps = buildSharedDeps(context);                 // sharedDeps.ts: host adapters + EditorSessionStore + ArtifactService
const { diffController }  = diffFeature.register(context, deps);
const { scriptTaskSvc }  = scriptFeature.register(context, deps);
const { bpmnService }    = editorFeature.register(context, deps, { diffController, scriptTaskSvc });
compareFeature.register(context, deps, { diffController });
commandsFeature.register(context, deps, { bpmnService });
deploymentFeature.register(context, deps);
```

Each `composition/<feature>Feature.ts` constructs that feature's own services/controllers from `deps`, registers its webview handlers / commands / providers, and returns only the lifecycle-bearing handles a later feature needs. Register order is observable and preserved: diff → script → editor → compare → commands → deployment. All disposables go to `context.subscriptions`.

## Webview message dispatch (`WebviewMessageRouter`)

Webview → host messages are routed by a `WebviewMessageRouter`, not a central `switch`:

- `router.on(type, handler)` registers a handler factory; multiple handlers per type run in registration order.
- `router.dispatch(message, editorId)` awaits each handler sequentially.
- Handlers are small factories in `<feature>/controller/webview-handlers/` (e.g. `bpmnMessageHandlers.ts`), each taking only the service(s) it needs, so they unit-test without a controller.

One router is built **per editor** (BPMN and DMN both carry `SyncDocumentCommand` but route it to different services). Routers are constructed in `editorFeature.ts`. The router is `vscode`-free and does no logging; the received/processed log lines live at the controller call site.

**Naming convention** (`libs/shared/src/lib/`): base `Query`/`Command` abstractions + cross-cutting commands (`SyncDocumentCommand`, log commands) live in `messages.ts`; modeler-specific message classes live in `modeler.ts`.
- **Query** = host → webview (data to display / settings to apply)
- **Command** = webview → host (request an action / report state)

## Editor lifecycle (`ModelerEditorController` + participants)

Both `.bpmn` and `.dmn` are served by one generic `ModelerEditorController` (`modeler/editor-session/`). Its `resolveCustomTextEditor` reduces to: optional diff delegation → create session → run participants → wire dispatch/tab/dispose. Constructor is constant-size: `(editorStore, notifier, options)`.

Each per-editor lifecycle concern is an **`EditorSessionParticipant`** (`onResolve(session)`), so adding a concern needs no controller edit. BPMN participants: `BpmnRenderParticipant`, `ElementTemplatesParticipant`, `SettingsParticipant`, `EngineVersionStatusBarParticipant`, `ScriptTaskTeardownParticipant`; DMN: `DmnRenderParticipant`. The controller aggregates all participants' `onDispose` callbacks into a single dispose subscription (so `disposeEditor` runs once, after the store's own bookkeeping).

`options.delegateResolve` is the BPMN-only diff branch: when `BpmnDiffController.shouldResolveAsDiff(uri)` is true the diff controller owns the pane and no editor session is created.

### `EditorSessionStore`

`EditorSessionStore` (`shared/infrastructure/`) is the `vscode`-free registry of open editors, parameterised over the `EditorHandle` port (`VsCodeEditorHandle` is the concrete handle):

1. **register(handle)** — stores the handle, sets it active, bumps the open-count context key.
2. **Subscriptions** — message / document-change / setting-change / tab-change / dispose helpers, each adding disposables to the per-editor bag.
3. **postMessage** — sends a Query to the active editor's webview (throws if the webview is hidden — see the scriptTask resync path).
4. **disposeEditor** — disposes the per-editor bag, removes the entry, reassigns the active pointer to the most-recently-registered remaining editor (or clears it).
5. **findEditorIdByPath** — returns only the `file:`-scheme handle, never the `git:` counterpart sharing the same fs path (diff dual-registration).

## Session Management (Echo Prevention)

**Problem**: the host writes webview-edited XML to the document, which fires `onDidChangeTextDocument`, which would echo back to the webview — an infinite loop.

**Solution**: `ModelerSession` (`shared/domain/session.ts`) keeps a per-editor guard counter.

```
1. Webview → SyncDocumentCommand → BpmnModelerService.sync()
2. sync() acquires the guard → counter++
3. sync() writes XML via VsCodeDocument
4. write fires onDidChangeTextDocument → BpmnModelerService.display()
5. display() sees the guard (counter > 0) → returns early (no echo)
6. sync()'s finally releases the guard → counter--
```

A counter (not a boolean) handles overlapping async syncs; release in `finally` prevents leaks on error.

## Architecture tests (`src/architecture.spec.ts`)

The layer + feature boundaries are enforced in CI via ArchUnitTS (runs under Vitest):

- **Layer purity** — `domain` imports no outer layer and no `vscode`/`node:*`/`fs`/`http`; `service` imports no `vscode` and no `controller`.
- **No cycles** — the whole `src/**` tree is acyclic.
- **Feature isolation** — a feature reaches a sibling only through its `index.ts` (internals are off-limits). `shared/`, `composition/`, and `modeler/editor-session/` are exempt.

A violation (e.g. `import "vscode"` in a service, or one feature importing another's internals) fails the build. Don't relax a rule to make CI green — that defeats the gate.

## Adding a New Feature (Checklist)

1. Create `src/<feature>/` with the layer subfolders you need and an `index.ts` barrel exporting the public surface.
2. Pure data → a `domain/` type. External system → a port in `domain/` implemented in `infrastructure/`.
3. New host capability → add a method to the relevant `VsCode*` adapter (+ its `hostPorts.ts` interface); never reach for `vscode.*` from a service.
4. New message → add the class in `libs/shared/src/lib/modeler.ts` (or `messages.ts` for cross-cutting), consume on both ends.
5. Service logic in `service/`; webview-command handlers as factories in `controller/webview-handlers/`; per-editor lifecycle as an `EditorSessionParticipant`.
6. Add a `composition/<feature>Feature.ts` `register(context, deps)` and one call in `main.ts`.
7. Cross-feature use only through the other feature's `index.ts` — the arch tests will fail otherwise.

## Related Skills

| Skill | When to use |
|---|---|
| `bpmn-js` | BPMN webview, diagram interactions, copy-paste, clipboard, element templates |
| `vscode-webviews` | Webview HTML, CSP, postMessage protocol, state persistence, theming, `acquireVsCodeApi` |
| `vscode-custom-editors` | `CustomTextEditorProvider` registration, document sync lifecycle, editor controller patterns |
| `vscode-ux-guidelines` | Notification vs status bar vs quick pick, clipboard access, theming, accessibility |

## Key Files for Quick Reference

- **Entry point**: `src/main.ts`; **wiring**: `src/composition/*.ts`
- **Editor registry**: `src/shared/infrastructure/EditorSessionStore.ts` (+ `VsCodeEditorHandle.ts`)
- **Generic editor host**: `src/modeler/editor-session/ModelerEditorController.ts`
- **Message router**: `src/shared/infrastructure/WebviewMessageRouter.ts`; BPMN handlers: `src/modeler/bpmn/controller/webview-handlers/bpmnMessageHandlers.ts`
- **Host-capability ports**: `src/shared/domain/hostPorts.ts`; **engine ports**: `src/deployment/domain/ports.ts`
- **BPMN service**: `src/modeler/bpmn/service/BpmnModelerService.ts`
- **Deployment service**: `src/deployment/service/DeploymentService.ts`; **engine router**: `src/deployment/infrastructure/camunda/CamundaEngineRouter.ts`
- **Session guard**: `src/shared/domain/session.ts`
- **Arch tests**: `src/architecture.spec.ts`
- **Message types**: `libs/shared/src/lib/messages.ts` (base) + `libs/shared/src/lib/modeler.ts` (modeler) — repo root
- **Path aliases**: `tsconfig.base.json` (`@miragon/bpmn-modeler-shared` → `libs/shared/src/index.ts`)
