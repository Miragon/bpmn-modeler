# `@miragon/bpmn-modeler-bridge`

The out-of-process **modeler core** for non-VS-Code hosts (today: the IntelliJ
plugin). A stdio JSON-RPC server that runs the **unmodified**
`@miragon/bpmn-modeler-core` engine and exposes it to a host that owns the editor
and the webview, shipped as a **Node-free Bun binary**.

This package imports only the `@miragon/bpmn-modeler-core` public entrypoint,
never deep plugin paths.

## Transport — one stdio NDJSON JSON-RPC pipe

The bridge speaks a single line-delimited JSON-RPC duplex over stdio
(`stdout` = RPC frames only; `stderr` = diagnostics). The host (IntelliJ/Kotlin)
implements the host-capability ports as RPC handlers; the core never knows it
isn't talking to VS Code.

| Direction   | Method(s)                               | Port / handle                                                                                 |
| ----------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| host → core | `session/register`, `session/dispose`   | editor lifecycle (seeds the `DocumentPort` mirror)                                            |
| host → core | `document/didChange`                    | external document change → re-render                                                          |
| host → core | `session/setActive`                     | focused tab → `EditorSessionStore` active-editor pointer                                      |
| host → core | `webview/message`                       | inbound `Command` → `WebviewMessageRouter`                                                    |
| core → host | `document/write`, `document/save`       | `DocumentPort.write` / `.save`                                                                |
| core → host | `editor/postMessage`                    | `EditorHandle.postMessage` (Query/Command → webview)                                          |
| core → host | `notifier/*`                            | `NotifierPort` → IntelliJ `Notifications.Bus` + IDE log                                       |
| core → host | `statusBar/update`                      | `StatusBarPort` → `{slot, view}`, `view: null` hides the slot; IntelliJ shows each slot in its own `StatusBarWidget` |
| host → core | `linting/toggle`                        | BPMNlint widget click → reports the flipped lint choice over `settings/setLintingEnabled`, as the webview toggle does |
| core → host | `settings/setLintingEnabled`            | `LintingPreferencePort` → the host stores the user's lint choice and pushes the snapshot to every open bridge, then acks; the bridge re-lints from that push |
| core → host | `secretStore/*`                         | `SecretStorePort` → `PasswordSafe` (application-scoped, encrypted); `slot` scopes a named target, `delete` removes one with its approved destinations |
| host → core | `deploymentState/seed`                  | seeds the `DeploymentStatePort` mirror with what the host stored; the core fills in the defaults (synchronous `load()`; see BridgeSettings) |
| host → core | `deployment/open`                       | deployment tool-window visibility → refresh form defaults on open                             |
| host → core | `deployment/webviewMessage`             | inbound deployment `Command` → the core `DeploymentFeature`'s panel                            |
| core → host | `deployment/postMessage`                | deployment `Query` → tool-window webview (`window.postMessage`)                               |
| host → core | `deployment/switchTarget`, `deployment/deployFiles` | status-bar/action → switch the active target, or pick + deploy files to it (carries `workspaceRoot`) |
| host → core | `deployment/verify`, `deployment/statusBarMenu` | verify the active diagram against the C7 engine; status-bar click menu (switch/verify) (carries `workspaceRoot`) |
| core → host | `deploymentState/save`                  | `DeploymentStatePort.save(patch)` → `PropertiesComponent` writes exactly the patched fields and ledger rows (non-secret form state, incl. active target + ledger) |
| host → core | `marketplace/add`, `marketplace/update` | Tools-menu actions → `TemplateMarketplaceService` (settings snapshot piggybacked)             |
| core → host | `marketplaceState/save`                 | persist the added registration + fan the snapshot to every open bridge                        |
| core → host | `tokenStore/*`                          | `TokenStorePort` → `PasswordSafe` (per-host marketplace PATs, distinct subsystem)             |
| core → host | `tokenPrompt/show`                      | `TokenPromptPort` → modal password dialog with the core's title and prompt; replies the answer as typed (`null` on cancel), the core judges a blank one |
| host → core | `script/openAll`                        | Tools-menu action → post `OpenAllScriptTasksQuery` to the active webview, bulk-open the reply |

The RPC method index above is prose; the authoritative surface is generated by
`protocolTable()` from `src/protocol/domain/descriptor.ts` and pinned by `protocol.spec.ts`
against the checked-in `protocol.json`. The IntelliJ host's
`ProtocolHandlerCoverageTest` reads the same file and fails when a core → host
method has no Kotlin handler, or a Kotlin handler serves no core → host method.
It also fails when a host → core frame carries other keys than the file lists,
a core → host handler reads a key the file does not list, or the result a
core → host request is answered with carries other keys than the file lists.

The **synchronous-read mismatch** — `BpmnModelerService.display()` reads
`DocumentPort.getContent()` synchronously, impossible over async RPC — is solved
by a local `DocumentMirror` the host seeds on `session/register` and keeps
current with `document/didChange` and `document/write` replies, so reads hit a
cache instead of blocking.

**Session and document causation.** Every open editor gets a host-owned
`sessionId`; lifecycle, webview, document, and post-message frames carry it so
late traffic from a closed same-URI editor cannot affect its replacement. The
host also owns a monotonic `documentRevision`, preserves it across bridge
restarts, and includes it in renders and external-change notifications. A
webview write returns that revision as `expectedDocumentRevision`; the host
accepts the write only while it is still current and reports the decision as
`accepted`.

The host reports only **external** document changes. The core's own
`document/write` is acknowledged by its reply alone: an accepted, changed write
updates the mirror (with `normalizedContent` when the host rewrote line
separators), so the full XML is not echoed back over the pipe. The reply never
re-renders; a command that writes content the page did not produce (Change
Engine Version, Migrate All) renders it afterwards at the unchanged revision.
The core's `ModelerSession` guard stays wired as a second line of defence.

The mirror lifecycle (seed/re-seed, ownership/single-writer, echo rules, and the
checklist for adding the next synchronous port) is written up once in
[Architecture and hosts: host replicated state](../../docs/adr/architecture-and-hosts.md#host-replicated-state).

Automatic form preview uses the existing settings snapshot, not a new RPC:
`formPreviewAutomatic` defaults to `true` and maps to the central
`formPreview.automatic` setting key. The host persists it and sends
`settings/didChange` to each running bridge. The core pushes the flag as
`BpmnModelerSettingQuery.formPreviewAutomatic` metadata to every open editor.
On recovery, request settings before replaying the file so an opt-out made
while the bridge was down reaches the surviving page before selection restore.

> **Why not a WebSocket seam between the webview and the server?** That would be
> the right tool for a plain browser host, where the webview talks to the server
> directly. In the JCEF host the JVM already owns the browser, so relaying
> webview messages over the _same_ stdio pipe keeps the transport single and
> supervised (one crash signal, no WS-reconnect ↔ stdio-restart reconciliation)
> and keeps this binary free of a bundled HTTP/WS server and any open TCP port.
> See [Architecture and hosts: process lifecycle](../../docs/adr/architecture-and-hosts.md#process-lifecycle).

## Scope

BPMN editor render + `Ctrl+S` write-back + element templates (real, filesystem-
backed) + the Notifier/StatusBar display ports + diff + Camunda 7/8 deployment
(the shared core `DeploymentFeature` + REST stack, driven by the IntelliJ
deployment tool window) + the template marketplace (add/update GitHub/GitLab/local
sources into the element-template cache, with per-host PATs in `PasswordSafe`) +
inline script editing (C7 script tasks/listeners, via `scriptFeature`). The DMN
editor is not wired here.

## Build & run

```bash
# from the repo root — the engine + webview the host serves:
corepack yarn build:libs
corepack yarn build:bpmn-webview

# this binary:
corepack yarn workspace @miragon/bpmn-modeler-bridge build   # typecheck + bun compile
#   → apps/modeler-bridge/dist/modeler-bridge

# run from source for local iteration (needs bun on PATH):
corepack yarn workspace @miragon/bpmn-modeler-bridge start
```

The compiled binary is what the IntelliJ plugin bundles and supervises. Talk to
it by writing NDJSON frames to its stdin and reading frames from its stdout.

## Layout

The bridge follows the role folders of the
[architecture ADR](../../docs/adr/architecture-and-hosts.md#workspace-kinds-and-role-folders):

- `src/server.ts` — the entrypoint. It only binds the process streams to
  `createBridge` (`composition/bridge.ts`) and the stdio binding.
- `src/composition/` — `bridge.ts` is the composition root; one
  `*Feature.ts` wiring module per feature slice (diff, marketplace, BPMN
  editor, script, editor-session, commands, deployment) builds the services and
  adapters and binds the slice's handler table (`bindHandlers.ts`). The BPMN
  editor module builds the core `BpmnEditorFeature`, which routes every BPMN
  editor webview command and lists the session participants in VS Code's
  order; `bridge.surfaceCoverage.spec.ts` pins its routes with every other
  webview surface's. The marketplace cache root arrives via the
  `MIRAGON_BPMN_MARKETPLACE_CACHE` env var (`server.ts`).
  `stdioBinding.ts` feeds stdin frames to the `Rpc` and tags every stderr line
  with `[core]`.
- `src/<context>/adapter/in/*Handlers.ts` — the Host→Core handler tables.
- `src/<context>/adapter/out/` — the RPC-backed ports (`RpcEditorHandle`,
  `RpcDocumentPort`, `RpcNotifier`, `RpcStatusBar`, `RpcClipboard`,
  `RpcPicker`, `RpcSecretStore`, `RpcDeploymentState`, `RpcTokenStore`,
  `RpcTokenPrompt`, `RpcLintingPreference`, `RpcDiffPaneHandle`,
  `BridgeScriptEditor`) and the pure-`fs` `NodeWorkspace` / `BridgeSettings`.
- `src/<context>/port/` — what the handlers feed: the settings and
  deployment-state mirrors, the workspace roots, the editor-handle and
  diff-pane factories, the script tabs.
- `src/editorSession/domain/DocumentMirror.ts` — the mirrored document text.
- `src/transport/` — the NDJSON JSON-RPC peer (`adapter/out/Rpc.ts`) and the
  stdin line framing (`domain/lineFraming.ts`).
- `src/protocol/domain/` — the wire contract.
