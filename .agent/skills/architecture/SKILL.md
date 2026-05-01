---
name: architecture
description: Internal architecture of the modeler-plugin extension host (Node.js) — flat four-layer design (domain, infrastructure, service, controller), hexagonal ports pattern for engine abstraction, deployment subsystem (Camunda 7 & 8), constructor wiring in main.ts, echo-prevention session guards, webview message protocol (Query/Command), and EditorStore lifecycle. Use this skill when working on extension-host code — implementing features, fixing bugs, reviewing PRs, refactoring services, adding message types, understanding editor tracking, tracing webview message flow, integrating external systems, or modifying constructor wiring. See also bpmn-js, vscode-webviews, vscode-custom-editors, and vscode-ux-guidelines for adjacent concerns.
---

# Extension Architecture

This skill describes the internal architecture of the `modeler-plugin` VS Code extension — the Node.js host process that manages editors, documents, and communication with browser-based webviews.

All paths below are relative to `apps/modeler-plugin/` unless stated otherwise. For webview-side architecture, see the `bpmn-js` and `vscode-webviews` skills.

## Layer Responsibilities

The extension follows a flat, four-layer architecture with **no DI framework**. All wiring happens via plain constructor calls in `main.ts`.

### Domain (`src/domain/`)

Pure domain types with **zero external dependencies** — no VS Code API, no Node.js modules.

| File              | Purpose                                                                                                                                                              |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `session.ts`      | `ModelerSession` — per-editor echo-prevention guard counter                                                                                                          |
| `model.ts`        | `BpmnModelerSetting` (immutable value object) + `SettingBuilder` (fluent builder)                                                                                    |
| `errors.ts`       | Domain error types: `NoWorkspaceFolderFoundError`, `FileNotFound`, `DirectoryNotFound`, `ExecutionPlatformNotDetectedError`, `UserCancelledError`, deployment errors |
| `ports.ts`        | Hexagonal port interfaces: `HttpClient` (transport abstraction) and `CamundaEnginePort` (deploy + start-instance contract)                                           |
| `deployment.ts`   | `DeploymentConfig` + `DeploymentConfigBuilder` (fluent, validated), `DeploymentResult`, `AuthConfig` discriminated union (`NoAuth`, `BasicAuth`, `OAuth2Auth`)       |
| `startInstance.ts` | `StartInstanceConfig`, `StartInstanceResult` — value objects for starting a process instance                                                                        |

### Infrastructure (`src/infrastructure/`)

Adapters that wrap VS Code APIs and external systems. Each adapter has a single responsibility.

#### Core Adapters

| File                       | Purpose                                                                                                                                                        |
|----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `EditorStore.ts`           | Central registry of open editors. Tracks webview panels, documents, disposables. Manages active-editor pointer. Provides subscription helpers and postMessage. |
| `VsCodeDocument.ts`        | Document read/write via `WorkspaceEdit.replace()`                                                                                                              |
| `VsCodeWorkspace.ts`       | Workspace folder resolution, file system watchers                                                                                                              |
| `VsCodeSettings.ts`        | Configuration reads (`miragon.bpmnModeler.*`), execution-platform quick-pick, status bar feedback                                                              |
| `VsCodeUI.ts`              | Notifications, clipboard access (`env.clipboard`), output channel logging, toggle text editor                                                                  |
| `WebviewHtml.ts`           | HTML generation with nonce-based CSP for BPMN and DMN webviews                                                                                                 |
| `DeploymentWebviewHtml.ts` | Inline HTML for deployment sidebar (dual-HTML pattern — see CLAUDE.md)                                                                                         |
| `VsCodeDeploymentState.ts` | Persists deployment form state (endpoint, name, auth) in VS Code `workspaceState`                                                                              |
| `VsCodeSecretStore.ts`     | Encrypted credential storage via VS Code `SecretStorage` API                                                                                                   |
| `FetchHttpClient.ts`       | `HttpClient` port implementation using `globalThis.fetch`                                                                                                      |
| `Logger.ts`                | Static singleton wrapper around `LogOutputChannel` for structured logging                                                                                      |

#### Camunda Engine Adapters (`src/infrastructure/camunda/`)

| File                     | Purpose                                                                                               |
|--------------------------|-------------------------------------------------------------------------------------------------------|
| `CamundaEngineRouter.ts` | `CamundaEnginePort` facade — dispatches `deploy()` and `startInstance()` to C7 or C8 client by config |
| `Camunda7RestClient.ts`  | `CamundaEnginePort` implementation for Camunda Platform 7 REST API                                    |
| `Camunda8RestClient.ts`  | `CamundaEnginePort` implementation for Camunda Cloud 8 REST API                                       |
| `AuthHeaderResolver.ts`  | Converts `AuthConfig` discriminated union into HTTP `Authorization` headers                            |
| `MultipartBuilder.ts`    | Builds `multipart/form-data` request bodies for deployment file uploads                               |

### Service (`src/service/`)

Business logic that orchestrates domain and infrastructure. Each service owns its state (e.g., session maps).

| File                      | Purpose                                                                                                                                                                    |
|---------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `BpmnModelerService.ts`   | BPMN use cases: display, sync, artifact injection, settings, clipboard mediation. Owns `Map<string, ModelerSession>`. Implements `ArtifactChangeTarget`.                   |
| `DmnModelerService.ts`    | DMN use cases (similar pattern, simpler)                                                                                                                                   |
| `ArtifactService.ts`      | Convention-based element-template discovery. Walks directory tree from BPMN file to workspace root looking for `<configFolder>/element-templates/`. Sets up file watchers. |
| `DeploymentService.ts`    | Orchestrates deployment workflow: reads files, builds config via `DeploymentConfigBuilder`, delegates to `CamundaEnginePort`, manages secret storage for credentials        |
| `StartInstanceService.ts` | Orchestrates start-instance workflow: reads process definition key from BPMN XML, collects payload, delegates to `CamundaEnginePort`                                       |
| `bpmnUtils.ts`            | Shared BPMN XML helpers (execution platform detection, empty-file checks)                                                                                                  |

### Controller (`src/controller/`)

Thin wiring layer that connects VS Code events to service calls. Most controllers implement `CustomTextEditorProvider`; the deployment controller implements `WebviewViewProvider` for the sidebar panel.

| File                       | Purpose                                                                                                                                                 |
|----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| `BpmnEditorController.ts`  | `CustomTextEditorProvider` for `.bpmn` files. Routes webview messages to `BpmnModelerService`, sets up document-change and config-change subscriptions. |
| `DmnEditorController.ts`   | Same pattern for `.dmn` files                                                                                                                           |
| `CommandController.ts`     | VS Code command registrations (palette commands)                                                                                                        |
| `DeploymentController.ts`  | `WebviewViewProvider` for the deployment sidebar. Routes deploy/start-instance commands to their respective services.                                    |

## Hexagonal Ports

The deployment subsystem uses a hexagonal (ports & adapters) pattern to decouple business logic from engine-specific protocols.

**Domain ports** (`src/domain/ports.ts`) define two interfaces:
- `HttpClient` — transport abstraction (`postJson`, `postForm`, `postMultipart`)
- `CamundaEnginePort` — engine contract (`deploy`, `startInstance`)

**Infrastructure adapters** implement these ports:
- `FetchHttpClient` implements `HttpClient` using `globalThis.fetch`
- `Camunda7RestClient` and `Camunda8RestClient` each implement `CamundaEnginePort`
- `CamundaEngineRouter` implements `CamundaEnginePort` by dispatching to the C7 or C8 client based on `config.engine`

**Benefit**: Services (`DeploymentService`, `StartInstanceService`) depend only on `CamundaEnginePort`. All engine-specific concerns — URL paths, multipart field names, response shapes, auth header assembly — are fully encapsulated in infrastructure. Adding a new engine version requires only a new adapter, no service changes.

## Constructor Wiring (`main.ts`)

The `activate()` function instantiates layers bottom-up in a single function — no container, no factory:

```
1. Infrastructure: EditorStore, VsCodeDocument, VsCodeWorkspace, VsCodeSettings, VsCodeUI,
                   VsCodeDeploymentState, VsCodeSecretStore, FetchHttpClient,
                   AuthHeaderResolver, Camunda7RestClient, Camunda8RestClient, CamundaEngineRouter
2. Services:       ArtifactService, BpmnModelerService, DmnModelerService,
                   DeploymentService, StartInstanceService
3. Controllers:    CommandController, BpmnEditorController, DmnEditorController,
                   DeploymentController
4. Registration:   .register(context) on each controller
```

Order matters: infrastructure adapters are created first, then injected into services, then services into controllers. All disposables are pushed to `context.subscriptions` for cleanup.

## Session Management (Echo Prevention)

**Problem**: When the webview sends edited XML back to the host, the host writes it to the VS Code document. This triggers `onDidChangeTextDocument`, which would normally send the document back to the webview — creating an infinite loop.

**Solution**: `ModelerSession` maintains a guard counter per editor.

```
1. Webview → SyncDocumentCommand → BpmnModelerService.sync()
2. sync() calls session.acquireGuard() → counter++
3. sync() writes XML to document via VsCodeDocument
4. Write triggers onDidChangeTextDocument → BpmnModelerService.display()
5. display() checks session.isGuarded() → counter > 0 → returns early (no echo)
6. sync()'s finally block calls session.releaseGuard() → counter--
```

A counter (not a boolean) is used because multiple async sync operations can overlap. The guard is only released in the `finally` block to prevent leaks on error.

## Message Protocol

All webview ↔ extension communication uses structured message types defined in `libs/shared/src/lib/messages.ts`.

**Naming convention**:
- **Query** = extension host → webview (carries data to display or settings to apply)
- **Command** = webview → extension host (requests an action or reports a state change)

Base types provide a `type` discriminator string. Concrete messages extend `Query` or `Command`. The controller's message handler uses a `switch` on `message.type` to route to the appropriate service method.

## EditorStore Lifecycle

`EditorStore` is the central state holder for all open editors:

1. **createEditor()** — Called by controller when VS Code opens a new editor. Stores webview panel reference, document reference, and per-editor disposable list. Sets as active editor.
2. **Subscriptions** — `onMessage()`, `onDocumentChanged()`, `onConfigurationChanged()`, `onTabChanged()`, `onDispose()` — all register per-editor listeners and add their disposables to the editor's disposable list.
3. **postMessage()** — Sends a Query to the active editor's webview.
4. **dispose()** — When an editor tab is closed, all per-editor disposables are disposed, and the editor entry is removed from the map.
5. **Active editor tracking** — `onTabChanged()` updates the active editor pointer when the user switches tabs. Services always operate on the active editor.

## Adding a New Feature (Checklist)

1. If the feature needs new data, add a domain type to `src/domain/`
2. If the feature calls an external system, define a port interface in `src/domain/ports.ts` and implement it in `src/infrastructure/`
3. Add infrastructure adapters if you need new VS Code API access
4. Add a new message type (Query or Command) in `libs/shared/src/lib/messages.ts`
5. Add service logic in the appropriate `*Service.ts`
6. Wire the message routing in the controller's message handler (`switch` case)
7. Wire constructor dependencies in `main.ts`
8. Add webview-side handling in the webview app

## Related Skills

| Skill                    | When to use                                                                                     |
|--------------------------|-------------------------------------------------------------------------------------------------|
| `bpmn-js`                | Working on the BPMN webview, diagram interactions, copy-paste, clipboard, element templates      |
| `vscode-webviews`        | Webview HTML, CSP, postMessage protocol, state persistence, theming, `acquireVsCodeApi`          |
| `vscode-custom-editors`  | `CustomTextEditorProvider` registration, document sync lifecycle, editor controller patterns     |
| `vscode-ux-guidelines`   | Choosing notification vs status bar vs quick pick, clipboard access, theming, accessibility      |

## Key Files for Quick Reference

- **Entry point**: `src/main.ts`
- **Editor registry**: `src/infrastructure/EditorStore.ts`
- **Domain ports**: `src/domain/ports.ts`
- **BPMN service**: `src/service/BpmnModelerService.ts`
- **Deployment service**: `src/service/DeploymentService.ts`
- **BPMN controller**: `src/controller/BpmnEditorController.ts`
- **Deployment controller**: `src/controller/DeploymentController.ts`
- **Engine router**: `src/infrastructure/camunda/CamundaEngineRouter.ts`
- **Session guard**: `src/domain/session.ts`
- **Message types**: `libs/shared/src/lib/messages.ts` (repo root)
- **Path aliases**: `tsconfig.base.json` (repo root, `@miragon/bpmn-modeler-shared` → `libs/shared/src/index.ts`)
