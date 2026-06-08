# `@miragon/bpmn-modeler-bridge`

The out-of-process **modeler core** for non-VS-Code hosts (today: the IntelliJ
plugin). A stdio JSON-RPC server that runs the **unmodified**
`@miragon/bpmn-modeler-core` engine and exposes it to a host that owns the editor
and the webview, shipped as a **Node-free Bun binary**.

This is the production bridge promised by the #920 spike and the #1060 / #1061
ADRs — not the `apps/modeler-cli/` browser server (that is a throwaway
HTTP+WebSocket _External-Tool_ prototype, with a stubbed message router). This
package imports only the `@miragon/bpmn-modeler-core` public entrypoint, never
deep plugin paths.

## Transport — one stdio NDJSON JSON-RPC pipe

The bridge speaks a single line-delimited JSON-RPC duplex over stdio
(`stdout` = RPC frames only; `stderr` = diagnostics). The host (IntelliJ/Kotlin)
implements the host-capability ports as RPC handlers; the core never knows it
isn't talking to VS Code.

| Direction | Method(s) | Port / handle |
|---|---|---|
| host → core | `session/register`, `session/dispose` | editor lifecycle (seeds the `DocumentPort` mirror) |
| host → core | `document/didChange` | document change → re-render (external edits) or no-op (own-write echo) |
| host → core | `session/setActive` | focused tab → `EditorSessionStore` active-editor pointer |
| host → core | `webview/message` | inbound `Command` → `WebviewMessageRouter` |
| core → host | `document/write`, `document/save` | `DocumentPort.write` / `.save` |
| core → host | `editor/postMessage` | `EditorHandle.postMessage` (Query/Command → webview) |
| core → host | `notifier/*` | `NotifierPort` → IntelliJ `Notifications.Bus` + IDE log |
| core → host | `statusBar/*` | `StatusBarPort` → `StatusBarWidget` (engine version + template count) |
| core → host | `secretStore/*` | `SecretStorePort` → `PasswordSafe` (application-scoped, encrypted at rest) |

The **synchronous-read mismatch** — `BpmnModelerService.display()` reads
`DocumentPort.getContent()` synchronously, impossible over async RPC — is solved
by a local `DocumentMirror` the host seeds on `session/register` and keeps
current with `document/didChange`, so reads hit a cache instead of blocking.

**Echo prevention.** The host stays dumb: it reports *every* document change,
including the echo of the core's own `document/write`. The bridge tells the two
apart by content — `RpcDocumentPort.write` updates the mirror before the RPC, so
a `document/didChange` whose content already equals the mirror is the host's echo
and is dropped; only a genuinely different text (a git revert, the plain-text tab,
another tool) re-renders. The core's `ModelerSession` guard stays wired as a
second line of defence. This keeps echo prevention in TypeScript — host-agnostic,
with no cross-process timing assumptions — so every future host inherits it.

> **Why not the `window.__WS_BRIDGE__` / `WebSocketChannelImpl` seam?** That seam
> (from #1061) is the right tool for the browser/CLI host, where the webview
> talks to the server directly. In the JCEF host the JVM already owns the
> browser, so relaying webview messages over the *same* stdio pipe keeps the
> transport single and supervised (one crash signal, no WS-reconnect ↔
> stdio-restart reconciliation) and keeps this binary free of a bundled HTTP/WS
> server and any open TCP port. See
> `docs/vscode/contributing/architecture/intellij-host-foundation.md`.

## Scope

BPMN editor render + `Ctrl+S` write-back + element templates (real, filesystem-
backed) + the Notifier/StatusBar display ports. DMN, diff, deployment, and
scriptTask are their own follow-up issues and are intentionally not wired here.

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

- `src/rpc.ts` — the bidirectional NDJSON JSON-RPC peer.
- `src/adapters.ts` — `DocumentMirror` + the RPC-backed ports
  (`RpcEditorHandle`, `RpcDocumentPort`, `RpcNotifier`, `RpcStatusBar`,
  `RpcSecretStore`, `RpcPicker`).
- `src/nodeAdapters.ts` — pure-`fs` `WorkspacePort` / `SettingsPort` for the
  element-templates pipeline.
- `src/server.ts` — the entrypoint that wires the real core to the adapters.
