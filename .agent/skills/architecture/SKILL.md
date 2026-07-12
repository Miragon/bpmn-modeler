---
name: architecture
description: Internal architecture of the modeler engine and its hosts — the host-agnostic `libs/modeler-core` package (domain/service/vscode-free infrastructure) consumed by the `apps/vscode-plugin` extension host, the IntelliJ plugin (via `apps/modeler-bridge`), and the Theia/Electron standalone. Covers the feature-folder + four-layer split (domain, infrastructure, service, controller), host-capability ports + hexagonal engine ports, deployment subsystem (Camunda 7 & 8), per-feature register() composition root, WebviewMessageRouter dispatch, EditorSessionParticipant lifecycle, EditorSessionStore + VsCodeEditorHandle, echo-prevention session guards, codeLink + template-marketplace features, webview message protocol (Query/Command), and the ArchUnitTS architecture tests. Use this skill when working on extension-host or modeler-core code — implementing features, fixing bugs, reviewing PRs, refactoring services, adding message types, understanding editor tracking, tracing webview message flow, integrating external systems, or modifying feature wiring. See also bpmn-js, vscode-webviews, vscode-custom-editors, and vscode-ux-guidelines for adjacent concerns.
---

# Extension Architecture

This skill describes the internal architecture of the modeler engine and the VS Code host that drives it — the Node.js host process that manages editors, documents, and communication with browser-based webviews.

**The core moved.** The host-agnostic modeling engine was extracted into its own
package, `@miragon/bpmn-modeler-core` (`libs/modeler-core/src/`, ADR #1060). It
holds each feature's `domain/` and `service/` layers plus the `vscode`-free
infrastructure registries (`EditorSessionStore`, `WebviewMessageRouter`,
`DiffPaneStore`). `apps/vscode-plugin/src/` keeps only the VS Code host code:
the `VsCode*` port adapters, the controllers/participants, webview HTML, and the
`composition/` wiring root. The same core is consumed by three hosts — VS Code
(in-process), the IntelliJ plugin (out-of-process over the `apps/modeler-bridge`
RPC), and the Theia/Electron `apps/standalone` — see **Multi-host** below.

Paths below name their package explicitly (`libs/modeler-core/src/…` vs
`apps/vscode-plugin/src/…`). For webview-side architecture, see the `bpmn-js` and
`vscode-webviews` skills.

## Organising principle: feature folders across two packages

Both packages are organised **by feature**, not by layer. A single feature's
four classic layers are **split across the two packages by layer**: the
host-agnostic `domain/` + `service/` (and any `vscode`-free `infrastructure/`)
live in `libs/modeler-core`; the `controller/` glue and the concrete `VsCode*`
`infrastructure/` adapters live in `apps/vscode-plugin`. Any cross-feature use
still goes only through that feature's `index.ts` barrel. There is **no DI
framework** — wiring is plain constructor calls, grouped into one
`register(context, deps)` per feature under `apps/vscode-plugin/src/composition/`.

```
libs/modeler-core/src/          Host-agnostic engine (@miragon/bpmn-modeler-core)
  architecture.spec.ts          Forbids any `vscode` / Node host import (transitively)
  shared/                       domain/ (ports + session + BpmnDocument) service/ infrastructure/ (EditorSessionStore, WebviewMessageRouter)
  modeler/bpmn/  modeler/dmn/    domain/ service/  (the modeling services)
  deployment/ diff/ migration/  domain/ service/ infrastructure/
  navigation/ scriptTask/        domain/ service/
  codeLink/ template-marketplace/ domain/ service/ (+ template-marketplace infrastructure/)

apps/vscode-plugin/src/         VS Code host (imports the core package)
  main.ts                       Activation: build shared deps, then each feature's register()
  architecture.spec.ts          Layer-purity + feature-isolation + no-cycles gate (ArchUnitTS)
  composition/                  One register(context, deps) per feature — the wiring root
  shared/infrastructure/        The VsCode* port adapters + VsCodeEditorHandle + WebviewHtml
  modeler/
    editor-session/             Generic custom-editor host: ModelerEditorController + EditorSessionParticipant
    bpmn/  dmn/                  controller/ (participants + webview-handlers) [+ bpmn infrastructure/]
  diff/ deployment/ scriptTask/ controller/ (+ host-side infrastructure)
  codeLink/ templateMarketplace/ controller/ (+ codeLink infrastructure)
  navigation/ migration/         thin barrels re-exporting the core service
```

The four layers still hold *within* each feature: `domain` is pure (no `vscode`/Node host modules, no outer layer); `service` orchestrates domain + infrastructure and never imports `vscode` or `controller`; `infrastructure` is the only adapter layer that imports `vscode` (and those adapters live in the app, not the core); `controller` is thin VS Code-event → service wiring. `shared/`, `composition/`, and `modeler/editor-session/` are deliberately **not** features (so they are exempt from the feature-isolation rule).

## `shared/` — cross-feature substrate

The substrate is itself split: pure `domain/`, the `service/` layer, and the
`vscode`-free `infrastructure/` registries live in
`libs/modeler-core/src/shared/`; the concrete `VsCode*` adapters live in
`apps/vscode-plugin/src/shared/infrastructure/`.

### `libs/modeler-core/src/shared/domain/` (pure types, zero external deps)

| File | Purpose |
|---|---|
| `session.ts` | `ModelerSession` — per-editor echo-prevention guard counter |
| `BpmnDocument.ts` | Value object wrapping BPMN XML — execution-platform detection, empty checks, process-definition key |
| `EditorSession.ts` | Per-session event/subscription types (`DocumentChangeEvent`, `SettingChange`, `EditorSubscription`) |
| `engineVersions.ts` | Supported Camunda engine-version constants/helpers |
| `errors.ts` | Domain error types (`NoWorkspaceFolderFoundError`, `FileNotFound`, `UserCancelledError`, deployment errors, …) |
| `hostPorts.ts` | **Host-capability ports** — one interface per host facility (notifications, pickers, clipboard, settings, workspace fs, documents, status bar, secrets, deployment state). Services depend on these interfaces, not the concrete `VsCode*` adapters. |

### `libs/modeler-core/src/shared/service/`

| File | Purpose |
|---|---|
| `ArtifactService.ts` | Convention-based element-template / payload discovery — walks from the file's directory up to the workspace root looking for `<configFolder>/…`. Shared by the editor and deployment features. |

### `libs/modeler-core/src/shared/infrastructure/` (`vscode`-free registries)

| File | Purpose |
|---|---|
| `EditorSessionStore.ts` | `vscode`-free registry of open editors, parameterised over the `EditorHandle` port. Active-editor pointer, per-editor disposables, subscription helpers, `postMessage`. |
| `WebviewMessageRouter.ts` | Open/closed dispatch table for webview → host messages (see Message Protocol) |
| `helpers.ts` | Misc host-agnostic helpers |

### `apps/vscode-plugin/src/shared/infrastructure/` (the VS Code adapters — the only place that imports `vscode`)

| File | Purpose |
|---|---|
| `VsCodeEditorHandle.ts` | Concrete `EditorHandle` wrapping one `WebviewPanel` + `TextDocument` |
| `VsCodeNotifier.ts` | Notifications + output-channel logging (`logInfo`/`logWarning`/`logError`/`showError`) |
| `VsCodePicker.ts` | Quick-pick prompts |
| `VsCodeClipboard.ts` | `env.clipboard` access |
| `VsCodeDocument.ts` | Document read/write via `WorkspaceEdit.replace()` |
| `VsCodeWorkspace.ts` | Workspace folder resolution, file watchers |
| `VsCodeSettings.ts` | Configuration reads (`miragon.bpmnModeler.*`) |
| `VsCodeStatusBar.ts` | Status-bar items (engine version, element-template feedback) |
| `VsCodeTextEditor.ts` | Toggle/reveal the underlying text editor |
| `WebviewHtml.ts` / `bootstrapWebview.ts` | Nonce-CSP HTML for BPMN/DMN webviews + the shared bootstrap |

> The `VsCode*` adapters each implement a `hostPorts.ts` interface from the
> core. The old `VsCodeUI.ts` god-adapter was split into `VsCodeNotifier` /
> `VsCodePicker` / `VsCodeClipboard`. There is no `Logger.ts` — logging lives on
> `VsCodeNotifier`.

## Feature folders

Each row shows where each layer lives — **core** = `libs/modeler-core/src/…`,
**app** = `apps/vscode-plugin/src/…`. The `modeler/editor-session/` host glue is
app-only (it implements `CustomTextEditorProvider`, a VS Code type).

| Feature | Key files (layer → package) |
|---|---|
| `modeler/editor-session/` | **app** `ModelerEditorController.ts`, `EditorSessionParticipant.ts` (generic host, shared by `.bpmn` + `.dmn`) |
| `modeler/bpmn/` | **core** domain `model.ts` (`BpmnModelerSetting`); **core** service `BpmnModelerService`, `BpmnClipboardMediator`, `BpmnElementTemplatesService`, `BpmnPropertiesPanelService`, `BpmnSettingsBroadcaster`, `BpmnLintConfigService`; **app** infra `PropertiesPanelStateRepository`; **app** controller `CommandController`, `webview-handlers/bpmnMessageHandlers`, `editor-participants/*Participant` |
| `modeler/dmn/` | **core** service `DmnModelerService`; **app** controller `webview-handlers/dmnMessageHandlers`, `editor-participants/DmnRenderParticipant`, `DmnSettingsParticipant` |
| `diff/` | **core** domain `DiffSession`, service `BpmnDiffService`, infra `DiffPaneStore`; **app** controller `BpmnDiffController` (+ compare) |
| `deployment/` | **core** domain `deployment`, `ports`, `startInstance`; **core** service `DeploymentService`, `StartInstanceService`, `DeploymentMessageDispatcher`; **core** infra `FetchHttpClient`, `camunda/*`; **app** infra `VsCodeDeploymentState`, `VsCodeSecretStore`, `DeploymentWebviewHtml`; **app** controller `DeploymentController` |
| `scriptTask/` | **core** domain `ScriptUri`, `ScriptVariableStore`, `scriptApi`, `scriptCompletion`, `scriptLanguage`; **core** service `ScriptVariableManifestService`; **app** infra `BpmnScriptFileSystem`; **app** controller `ScriptTaskService`, `ScriptCompletionProvider`, `ScriptDeclareVariableCodeAction` |
| `codeLink/` | **core** domain `CodeLinkMap`, `ImplementationReference`; **core** service `CodeLinkMapService`, `ImplementationLocator`, `ImplementationNavigationService`; **app** controller `editor-participants/CodeLinkParticipant` — maps activity ids to workspace source files (javaClass/delegate/expression/topic/jobType matchers) |
| `template-marketplace/` | **core** domain `marketplace`, `ports` (`RepositorySource`); **core** service `TemplateMarketplaceService`; **core** infra `GitHubSource`, `LocalFileSource`, `MarketplaceCache`; **app** controller `templateMarketplace/TemplateMarketplaceController` — element-template sources from GitHub or local folders (`provider:local`) |
| `navigation/` | **core** service `ModelNavigationService`, `ReferencedModelLocator`; **app** barrel only |
| `migration/` | **core** domain `MigrationPlan`; **core** service `BpmnMigrationService`; **app** barrel only |

Each feature exposes a public-API barrel `index.ts`; a sibling feature imports only that barrel (enforced by the arch tests).

## Hexagonal Ports (deployment engine)

The deployment subsystem uses ports & adapters to decouple business logic from engine-specific protocols.

**Domain ports** (`libs/modeler-core/src/deployment/domain/ports.ts`):
- `HttpClient` — transport abstraction (`postJson`, `postForm`, `postMultipart`)
- `CamundaEnginePort` — engine contract (`deploy`, `startInstance`)

**Infrastructure adapters** (`libs/modeler-core/src/deployment/infrastructure/`):
- `FetchHttpClient` implements `HttpClient` using `globalThis.fetch`
- `camunda/Camunda7RestClient` and `camunda/Camunda8RestClient` each implement `CamundaEnginePort`
- `camunda/CamundaEngineRouter` implements `CamundaEnginePort` by dispatching to the C7 or C8 client based on `config.engine`
- `camunda/AuthHeaderResolver` converts the `AuthConfig` union into `Authorization` headers; `camunda/MultipartBuilder` builds upload bodies

**Benefit**: `DeploymentService` / `StartInstanceService` depend only on `CamundaEnginePort`. Adding a new engine version is a new adapter, no service change.

> Note the two distinct port families (both in the core): `shared/domain/hostPorts.ts` (13 interfaces) abstracts the *host* (VS Code / IntelliJ) facilities; `deployment/domain/ports.ts` abstracts the *Camunda engine*. Each host provides its own adapter set — `VsCode*` in the plugin, RPC-backed adapters in the bridge.

## Composition wiring (`main.ts` + `composition/`)

`activate()` is pure composition — build the shared collaborators once, then call each feature's `register()`:

```
const deps = buildSharedDeps(context);                 // sharedDeps.ts: VsCode* adapters + EditorSessionStore + ArtifactService
const { diffController }  = diffFeature.register(context, deps);
const { scriptTaskSvc }   = scriptFeature.register(context, deps);
const codeLink            = codeLinkFeature.register(context, deps);
const { marketplaceSvc }  = templateMarketplaceFeature.register(context, deps);
const { bpmnService, templatesSvc } = editorFeature.register(context, deps, {
    diffController, scriptTaskSvc, codeLink, /* … */
});
templateMarketplaceFeature.registerCommands(context, deps, { marketplaceSvc, templatesSvc });
compareFeature.register(context, deps, { diffController });
commandsFeature.register(context, deps, { bpmnService });
deploymentFeature.register(context, deps);
```

Each `composition/<feature>Feature.ts` constructs that feature's own services/controllers from `deps` (services come from the core package; adapters/controllers are built here), registers its webview handlers / commands / providers, and returns only the lifecycle-bearing handles a later feature needs. Register order is observable and preserved: diff → script → codeLink → marketplace → editor → (marketplace commands) → compare → commands → deployment. All disposables go to `context.subscriptions`.

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

Each per-editor lifecycle concern is an **`EditorSessionParticipant`** (`onResolve(session)`), so adding a concern needs no controller edit. BPMN participants: `BpmnRenderParticipant`, `ElementTemplatesParticipant`, `BpmnlintParticipant`, `SettingsParticipant`, `EngineVersionStatusBarParticipant`, `ScriptTaskTeardownParticipant`, `ScriptManifestParticipant`, `CodeLinkParticipant`; DMN: `DmnRenderParticipant`, `DmnSettingsParticipant`. The controller aggregates all participants' `onDispose` callbacks into a single dispose subscription (so `disposeEditor` runs once, after the store's own bookkeeping).

`options.delegateResolve` is the BPMN-only diff branch: when `BpmnDiffController.shouldResolveAsDiff(uri)` is true the diff controller owns the pane and no editor session is created.

### `EditorSessionStore`

`EditorSessionStore` (`libs/modeler-core/src/shared/infrastructure/`) is the `vscode`-free registry of open editors, parameterised over the `EditorHandle` port (`VsCodeEditorHandle`, in the app, is the concrete handle):

1. **register(handle)** — stores the handle, sets it active, bumps the open-count context key.
2. **Subscriptions** — message / document-change / setting-change / tab-change / dispose helpers, each adding disposables to the per-editor bag.
3. **postMessage** — sends a Query to the active editor's webview (throws if the webview is hidden — see the scriptTask resync path).
4. **disposeEditor** — disposes the per-editor bag, removes the entry, reassigns the active pointer to the most-recently-registered remaining editor (or clears it).
5. **findEditorIdByPath** — returns only the `file:`-scheme handle, never the `git:` counterpart sharing the same fs path (diff dual-registration).

## Session Management (Echo Prevention)

**Problem**: the host writes webview-edited XML to the document, which fires `onDidChangeTextDocument`, which would echo back to the webview — an infinite loop.

**Solution**: `ModelerSession` (`libs/modeler-core/src/shared/domain/session.ts`) keeps a per-editor guard counter.

```
1. Webview → SyncDocumentCommand → BpmnModelerService.sync()
2. sync() acquires the guard → counter++
3. sync() writes XML via VsCodeDocument
4. write fires onDidChangeTextDocument → BpmnModelerService.display()
5. display() sees the guard (counter > 0) → returns early (no echo)
6. sync()'s finally releases the guard → counter--
```

A counter (not a boolean) handles overlapping async syncs; release in `finally` prevents leaks on error.

## Architecture tests (two `architecture.spec.ts` gates)

Both packages ship an ArchUnitTS spec (runs under Vitest), enforcing complementary boundaries:

- **`libs/modeler-core/src/architecture.spec.ts`** — the host-agnosticity gate: **no** file in the core imports `vscode` or a Node host module (`node:*`/`fs`/`http`), transitively. This is what keeps the core reusable by the IntelliJ bridge and the standalone.
- **`apps/vscode-plugin/src/architecture.spec.ts`** — the layer + feature gate: `domain` imports no outer layer and no `vscode`/`node:*`/`fs`/`http`; `service` imports no `vscode` and no `controller`; the `src/**` tree is acyclic; a feature reaches a sibling only through its `index.ts` (`shared/`, `composition/`, and `modeler/editor-session/` are exempt).

A violation (e.g. `import "vscode"` in a core file, or one feature importing another's internals) fails the build. Don't relax a rule to make CI green — that defeats the gate.

## Adding a New Feature (Checklist)

1. Create the feature folder — host-agnostic `domain/` + `service/` under `libs/modeler-core/src/<feature>/`, host glue (`controller/`, `VsCode*` infra) under `apps/vscode-plugin/src/<feature>/` — each with an `index.ts` barrel exporting the public surface.
2. Pure data → a `domain/` type in the core. External system → a port in the core's `domain/` implemented in `infrastructure/` (core if host-agnostic, app if it touches `vscode`).
3. New host capability → add a method to the relevant `VsCode*` adapter (in the app) **and** its `hostPorts.ts` interface (in the core); the bridge then needs a matching RPC adapter. Never reach for `vscode.*` from a service.
4. New message → add the class in `libs/shared/src/lib/modeler.ts` (or `messages.ts` for cross-cutting), consume on both ends.
5. Service logic in the core's `service/`; webview-command handlers as factories in the app's `controller/webview-handlers/`; per-editor lifecycle as an `EditorSessionParticipant` (app).
6. Add a `composition/<feature>Feature.ts` `register(context, deps)` and one call in `main.ts`.
7. Cross-feature use only through the other feature's `index.ts` — the arch tests will fail otherwise. Keep new core files free of `vscode`/Node imports, or the core arch gate fails.

## Multi-host

The core (`@miragon/bpmn-modeler-core`) is written once and driven by three hosts. The seam is always the `hostPorts.ts` interfaces — each host supplies its own adapters:

| Host | Path | How it consumes the core |
|---|---|---|
| **VS Code** | `apps/vscode-plugin` | In-process: imports the package and calls it directly; `VsCode*` adapters implement the host ports. The primary, full-featured host. |
| **IntelliJ** | `apps/intellij-plugin` (Kotlin/Gradle) + `apps/modeler-bridge` | Out-of-process: the Kotlin plugin spawns `apps/modeler-bridge` — a Node-free **Bun binary** running the *unmodified* core — and talks to it over a single **stdio JSON-RPC** pipe (ADR #1061/#1062). The bridge provides RPC-backed port adapters; host-replicated mirrors (document, settings, deployment state) give the core synchronous reads (ADR #1106). |
| **Standalone** | `apps/standalone` (Theia/Electron) + `libs/standalone-extension` | Runs the packaged VS Code extension inside a Theia shell, so it reuses the plugin's adapters transitively. |

For deep IntelliJ/bridge work (Gradle `runIde`, webview bundle staging, the sandbox bridge-binary cache trap, plugin.xml extension points), see the `intellij-plugin` skill.

## Related Skills

| Skill | When to use |
|---|---|
| `bpmn-js` | BPMN webview, diagram interactions, copy-paste, clipboard, element templates |
| `intellij-plugin` | IntelliJ host, modeler-bridge RPC, Gradle build/run, webview staging |
| `vscode-webviews` | Webview HTML, CSP, postMessage protocol, state persistence, theming, `acquireVsCodeApi` |
| `vscode-custom-editors` | `CustomTextEditorProvider` registration, document sync lifecycle, editor controller patterns |
| `vscode-ux-guidelines` | Notification vs status bar vs quick pick, clipboard access, theming, accessibility |

## Key Files for Quick Reference

Core (`libs/modeler-core/src/…`):
- **Editor registry**: `shared/infrastructure/EditorSessionStore.ts`
- **Message router**: `shared/infrastructure/WebviewMessageRouter.ts`
- **Host-capability ports**: `shared/domain/hostPorts.ts`; **engine ports**: `deployment/domain/ports.ts`
- **Session guard**: `shared/domain/session.ts`
- **BPMN service**: `modeler/bpmn/service/BpmnModelerService.ts`
- **Deployment service**: `deployment/service/DeploymentService.ts`; **engine router**: `deployment/infrastructure/camunda/CamundaEngineRouter.ts`
- **Core arch gate**: `architecture.spec.ts` (no `vscode`/Node imports)

App (`apps/vscode-plugin/src/…`):
- **Entry point**: `main.ts`; **wiring**: `composition/*.ts`
- **Editor handle (VS Code adapter)**: `shared/infrastructure/VsCodeEditorHandle.ts`
- **Generic editor host**: `modeler/editor-session/ModelerEditorController.ts`; BPMN handlers: `modeler/bpmn/controller/webview-handlers/bpmnMessageHandlers.ts`
- **Layer/feature arch gate**: `architecture.spec.ts`

Repo root:
- **Message types**: `libs/shared/src/lib/messages.ts` (base) + `libs/shared/src/lib/modeler.ts` (modeler)
- **Host API (webview side)**: `libs/shared/src/lib/host.ts` (`HostApi`/`HostApiImpl`/`MockHostApi`)
- **Path aliases**: `tsconfig.base.json` (`@miragon/bpmn-modeler-shared` → `libs/shared/src/index.ts`; `@miragon/bpmn-modeler-core` → `libs/modeler-core/src/index.ts`)
