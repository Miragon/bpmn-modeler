# `@miragon/bpmn-modeler-bridge`

The modeler core for hosts without Node, today the IntelliJ plugin: a stdio JSON-RPC server that runs
the unmodified `@miragon/bpmn-modeler-core` and lets the host own the editor and the webview. It
ships as a Bun binary per platform, which the IntelliJ plugin bundles and supervises. Internal
workspace, not published on its own.

It imports only the public entry of `@miragon/bpmn-modeler-core`, never deep paths.

## How it works

- **One pipe.** Host and core exchange line-delimited JSON-RPC over stdio: `stdout` carries RPC frames
  only, `stderr` diagnostics. The host implements the core's host-capability ports as RPC handlers,
  and relays the webview's messages over the same pipe, so the core never knows it is not in VS Code.
  Why not a WebSocket between webview and bridge: [IntelliJ bridge: process lifecycle](../../docs/adr/intellij-bridge.md#process-lifecycle).
- **One protocol descriptor.** Every method is declared once, with its fixtures, in its feature's
  `src/protocol/domain/<feature>Protocol.ts` (`editorSessionProtocol.ts`, `deploymentProtocol.ts`,
  …); `src/protocol/domain/descriptor.ts` gathers them into `METHODS` and `PROTOCOL` in wire order.
  Its snapshot, with each method's direction, kind and the keys
  of its frames and results, is checked in as
  [`src/protocol/domain/protocol.json`](src/protocol/domain/protocol.json) and pinned by
  `protocol.spec.ts`. `hostToCore` entries are what the IDE sends (lifecycle, document changes,
  webview messages, tool-window actions); `coreToHost` entries are the ports the IDE serves (document
  writes, notifications, status bar, password safe, stores and prompts). IntelliJ's
  `ProtocolHandlerCoverageTest` reads the same file and fails on a method or key without its
  counterpart on the Kotlin side.
- **Synchronous reads hit a mirror.** The core reads `EditorHandle.getContent()` synchronously, which
  RPC cannot answer. `src/editorSession/domain/DocumentMirror.ts` holds the text the host seeds on
  `session/register` and keeps current with `document/didChange` and the replies to
  `document/write`. Settings, plugin approvals, template switches and deployment state use mirrors
  the same way; the rules are in [IntelliJ bridge: host-replicated state](../../docs/adr/intellij-bridge.md#host-replicated-state).
- **Causation.** Every editor has a host-owned `sessionId`, so late frames from a closed editor on the
  same file cannot reach its replacement. The host also owns a monotonic `documentRevision` that
  survives bridge restarts; a write is accepted only while its `expectedDocumentRevision` is still
  current. The host reports only external changes; the core's own write is confirmed by its reply,
  and an error reply reads as a refused write, as on VS Code. Details:
  [IntelliJ bridge: document causation and session identity](../../docs/adr/intellij-bridge.md#document-causation-and-session-identity).
- **UI language.** The host → core `modeler/changeLanguage` command builds the application UI-language
  choice through generic `picker/show`, even without an editor. The core → host `settings/setLanguage`
  request stores the selected locale in application settings, pushes snapshots, then acknowledges
  with null, without an optimistic mirror write.

## Scope

The BPMN editor with save write-back, element templates, the template marketplace (with per-host
tokens in the IDE's password safe), the diff, inline scripts, Camunda 7 and 8 deployment, BPMN plugins
and the Add-ons view, plus the notifier and status-bar ports. The DMN editor is not wired.

## Develop

```bash
corepack yarn build:libs                                    # from the root: the engine
corepack yarn build:bpmn-webview                            # and the webview the host serves
corepack yarn workspace @miragon/bpmn-modeler-bridge build  # typecheck + compile → dist/modeler-bridge (darwin-arm64)
corepack yarn workspace @miragon/bpmn-modeler-bridge start  # run from source, needs bun on PATH
corepack yarn workspace @miragon/bpmn-modeler-bridge test
```

`compile:all` builds the binaries for every platform into `dist/<platform>/`. `corepack yarn
intellij:run` from the root builds what the plugin needs and starts a sandbox IDE; the IntelliJ dev
loop is in [`apps/intellij-plugin/CONTRIBUTING.md`](../intellij-plugin/CONTRIBUTING.md).

## Layout

The role folders follow [Role folders](../../docs/adr/role-folders.md).

- `src/server.ts` binds the process streams to `createBridge`; the marketplace and plugin cache roots
  arrive as `MIRAGON_BPMN_MARKETPLACE_CACHE` and `MIRAGON_BPMN_PLUGIN_CACHE`.
- `src/composition/bridge.ts` is the composition root; one `*Feature.ts` per slice builds its
  services and adapters and binds its handler table (`bindHandlers.ts`). `stdioBinding.ts` feeds
  stdin frames to the RPC peer and tags every stderr line with `[core]`.
- `src/<context>/adapter/in/*Handlers.ts` are the host → core handlers, `src/<context>/adapter/out/`
  the RPC-backed ports (`Rpc*`) and the `fs`-based `NodeWorkspace` and `BridgeSettings`,
  `src/<context>/port/` the mirrors and factories the handlers feed.
- `src/transport/` is the NDJSON JSON-RPC peer and the stdin line framing; `src/protocol/domain/` the
  wire contract.
