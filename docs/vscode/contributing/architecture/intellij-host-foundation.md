# IntelliJ host foundation — transport & process supervision

## Status

Accepted (#1062). Parent: epic #920 (IntelliJ host parity). Builds on
[`modeler-core-extraction.md`](./modeler-core-extraction.md) (#1060, the engine
package + host-protocol seam) and [`runtime-distribution.md`](./runtime-distribution.md)
(#1061, the Node-free Bun binary). Foundation for the per-feature host work
(#1063–#1073).

## Context

The #920 spikes proved an IntelliJ host can drive the unmodified TypeScript core
out-of-process. #1060 extracted that core into `@miragon/bpmn-modeler-core`;
#1061 fixed distribution (a single Bun `--compile` binary, subprocess-over-bridge
transport). This issue turns the throwaway spike into a production foundation:
a real bridge entrypoint, a process supervisor, a cleaned plugin skeleton, and
the first two display ports (Notifier, StatusBar) wired for real.

Two design questions were left open by the prior ADRs and are decided here.

## Decision 1 — transport: one stdio JSON-RPC pipe (not the WS seam)

The JCEF host has two process boundaries: **JVM ↔ Bun core** and **core ↔
webview**. #1061 added a reusable webview channel (`WebSocketChannelImpl` +
`window.__WS_BRIDGE__`). We **do not** use it for this host. Instead, a single
line-delimited (NDJSON) JSON-RPC duplex over the subprocess's stdio carries
everything: the host-capability ports (`DocumentPort`, `NotifierPort`,
`StatusBarPort`, session lifecycle) **and** the webview-message relay
(`webview/message` ⇄ `editor/postMessage`). The JVM owns the JCEF browser and
relays its messages over the same pipe (webview → `acquireVsCodeApi` shim →
`JBCefJSQuery` → stdio; core → stdio → `executeJavaScript(window.postMessage)`).

Rationale:

- **It is the designed protocol.** `modeler-core-extraction.md`'s RPC table
  already maps `webview/message` + `editor/postMessage` onto stdio; the spike
  proved it end-to-end.
- **Single supervised transport ⇒ robust recovery.** One EOF signal detects a
  crash; there is no WS-reconnect ↔ stdio-restart reconciliation to get right.
  This directly serves the #1 acceptance criterion (crash → editor recovers).
- **Leanest, most secure binary.** Pure stdio means the compiled binary embeds
  **no HTTP/WS server** and opens **no TCP port**. Reusing the WS seam would
  either bloat the binary with a server or add a pointless JVM→WS→stdio
  double-hop, since the JVM already owns the browser.
- **Latency is a non-issue** for BPMN editing; the direct-WS win does not apply.

The `WebSocketChannelImpl` seam remains the right tool for the browser/CLI host
(`apps/modeler-cli`) and a documented future option if the JS-injection relay
ever proves a bottleneck.

## Decision 2 — topology: one core per project

`CoreProcess` is a **project-level** IntelliJ service (`@Service(Service.Level.PROJECT)`),
lazily spawned on the first `.bpmn` editor, not one application-wide process (the
spike's choice). Rationale:

- **Deterministic teardown.** Scoping the supervisor to the `Project` disposable
  means closing a project window tears its core down — no orphan bookkeeping.
- **Isolated blast radius.** A crash affects only that project's editors.
- **Pay-as-you-go.** Lazy spawn (≈12 ms cold start) keeps idle project windows
  free; users rarely keep many windows open.

The stateless loopback **asset server** (`WebviewServer`) stays application-level:
it serves an identical static bundle to every editor in every project, and all
per-file data flows over the JCEF message bridge, never over HTTP.

## The process supervisor

`CoreProcess` is pure transport + port adapters. Beyond the spike it adds:

- **Bun binary, not `node`.** Spawns the bundled, self-contained binary
  (`/bin/<os>-<arch>/modeler-bridge`, extracted from the classpath and made
  executable). Dev override: `-Dmiranum.bridge=…` / `MIRANUM_BRIDGE`.
- **Crash recovery.** Detects process exit; respawns with linear backoff (giving
  up after repeated *rapid* crashes — a stable run resets the counter);
  re-registers every live session from the authoritative IntelliJ `Document` and
  replays `GetBpmnFileCommand` so open editors re-render without a page reload.
- **No orphans.** The bridge exits on stdin EOF, so a dying JVM never orphans it;
  `dispose()` (destroy → `destroyForcibly` after a grace period) plus a JVM
  shutdown hook are belt-and-suspenders for hard exits.
- **Backpressure.** A single writer thread drains a bounded outbound queue that
  coalesces superseded document-sync frames per editor, so the EDT / JCEF
  threads never block on bridge stdin under an edit flood.

## Display ports

The spike's Notifier/StatusBar were log-only stubs. Both are now RPC-backed
(`apps/modeler-bridge` forwards `notifier/*` and `statusBar/*`) and rendered by
the host: **Notifier → `Notifications.Bus`** balloons + IDE log
(`HostNotifications`), **StatusBar → `EngineStatusBarWidget`** (engine version +
element-template count). The template count is genuine: the bridge wires the real
`ArtifactService` + `BpmnElementTemplatesService` over pure-`fs` adapters.

## Secret store

Deployment credentials (basic-auth / OAuth2) route through `secretStore/*` to
`IntellijSecretStore` → **`PasswordSafe`** — the host equivalent of VS Code's
`context.secrets`. `PasswordSafe` is an *application*-level service (not
project-scoped): secrets are keyed only by `CredentialAttributes`, shared across
project windows and IDE restarts, and encrypted at rest in the OS keychain — the
same scope the core assumes. The port adapter (`RpcSecretStore`) is shipped and
unit-tested but not yet wired into a service; the deployment feature consumes it
when it lands.

## Consequences

- A second host exists as a thin Kotlin glue layer + a 58 MB Node-free binary;
  no modeling logic crosses the language line.
- `apps/modeler-bridge` is the production stdio bridge (distinct from the
  `apps/modeler-cli` browser prototype): `server.ts` (stdio entry) → `bridge.ts`
  (wiring) → `rpc.ts` / `adapters.ts` / `nodeAdapters.ts`, consuming only the
  `@miragon/bpmn-modeler-core` public entrypoint.
- DMN, diff, deployment, and scriptTask stay out of scope (their own issues);
  the bridge structure does not preclude them.

## Follow-ups

- **Cross-platform packaging (publish gate).** This PR stages only the host
  platform's binary. Shipping needs the Bun `--target` matrix
  (darwin-arm64/x64, linux-x64, windows-x64) each staged under `bin/<os>-<arch>/`,
  plus macOS codesign / notarization — the release-pipeline loop flagged in the
  runtime-distribution ADR.
- **Recursive `fs.watch`** (element-template live reload) is macOS/Windows only;
  the Linux target needs chokidar or per-directory watches.
- Unsaved in-webview edits made during the crash window are lost on recovery
  (the mirror re-seeds from the last on-disk/Document content) — acceptable for a
  crash path; revisit if it bites.
