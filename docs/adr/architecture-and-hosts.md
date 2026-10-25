# Architecture and hosts

- Status: accepted
- Last reviewed: 2026-10-24

## Context

The same modeling features serve embeddable browser consumers, VS Code,
Theia/Electron, and IntelliJ. Sharing them requires separate boundaries for
browser composition, host-independent services, host facilities, and private
webview messages. Otherwise each host either duplicates modeling logic or
depends on another host's internals.

## Contents

- [Package boundaries](#package-boundaries)
- [Host integrations](#host-integrations)
- [Runtime and transport](#runtime-and-transport)
- [Process lifecycle](#process-lifecycle)
- [Host-replicated state](#host-replicated-state)
- [Document causation and session identity](#document-causation-and-session-identity)
- [Shared host caches](#shared-host-caches)
- [Alternatives and consequences](#alternatives-and-consequences)

## Decision

### Package boundaries

Applications consume packages and libraries; packages consume reusable
libraries; libraries import neither applications nor modeler packages.

| Layer | Responsibility |
| --- | --- |
| `packages/bpmn-modeler`, `packages/dmn-modeler` | Published, host-free browser composition and deliberately designed factory/handle APIs |
| Private feature libraries in `libs/` | Reusable behavior, inlined into published packages where needed |
| `libs/modeler-types` | Public, host-agnostic concepts and browser utilities suitable for publication |
| `libs/shared` | Private Query/Command protocol, host channel, document-flush plumbing and webview chrome |
| `libs/modeler-core` | Host-independent domain/service layers and shared editor, routing and diff registries |
| Host applications and webview bootstraps | Concrete adapters, composition, transport, editor lifecycle and page integration |

The public browser contract is the factory/handle API, not Query/Command or
host-specific DI wiring. Published browser code cannot import `modeler-core`
or `shared`. Private browser libraries are inlined; the upstream bpmn-io stacks
remain declared npm dependencies so consumer plugins share their instances.
Externalization does not remove upstream watermark and license-notice
obligations; document them in the package README. Do not publish each private
feature library as an independently versioned API.

Placement in `modeler-types` requires both freedom from the private protocol
and a surface worth publishing. Portable mode types, disposable primitives,
engine versions, canvas utilities and `isTextEditingSurface` qualify.
DOM-id-coupled panel resizers, focus/shortcut bindings and the VS Code body-class
theme adapter belong in `shared`. This deliberately mixes private browser
chrome with the protocol to avoid another workspace for a few helpers.

`modeler-core` owns domain/services plus `EditorSessionStore`,
`WebviewMessageRouter` and `DiffPaneStore`. Host applications import its public
entrypoint and supply capability ports and editor/diff handles. The core is
VS Code-free; its domain cannot reach host modules transitively. This does not
make the whole core browser-safe: portable Node utilities and infrastructure
remain valid there.

The core/host seam and the host/webview seam are distinct. The core reaches
documents, settings, notifications, pickers, secrets and other host facilities
through ports. It sends private Query/Command messages through
`EditorHandle.postMessage`; the adapter delivers them to the actual webview.
The protocol can change across all in-repo hosts in one change without becoming
a public browser API commitment.

Each message class fixes its `type` as a string literal (`Command<"X">`), and
`libs/shared` derives the discriminated unions `ProtocolQuery`,
`ProtocolCommand` and `MessageOfType<"X">` from those classes. The router's
`on(type, handler)` hands each handler the narrowed message, and webview and
host switches narrow on `type` instead of casting, so a misspelt type or a
payload mismatch fails to compile. Inbound messages stay untrusted JSON: a
switch narrows them once (`asProtocolMessage`) and ignores unknown types, and a
handler table finds no entry for them. Code that owns a closed set makes a
missing type a compile error. A switch ends in `exhaustiveMessageGuard` (the
deployment dispatcher). A handler table has a mapped type that needs an entry
for every type (the BPMN webview's session messages in
`apps/bpmn-webview/src/session/messageRouter.ts`). TypeScript does not check
the keys a table gets through spreads, so a spec checks that no two spread
handler groups name the same type. The classes remain the constructors and the
wire format is unchanged: the same `type` strings and fields, which the
IntelliJ host matches.

Commands and Queries are not correlated by default: a request is a Command and
the answer a later pushed Query. A webview port that answers a query while
several requests can be in flight carries a request id that the host echoes,
as `SearchWorkspaceDefinitionsCommand` and `WorkspaceDefinitionsQuery` do.
Hosts answer an awaited request even when they cannot serve it, with an empty
or `failed` answer, as the clipboard reads and the definition search do. The
BPMN and DMN webviews still bound every awaited answer (`HOST_REPLY_TIMEOUT_MS`,
`createReplyRegistry` in `libs/shared`) because IntelliJ's
[best-effort frames](#process-lifecycle) can lose a request or its answer, and
treat a missed deadline as no answer. Only their initial file request waits
without a bound, since a cold first open can outlast any backstop.

Enforcement lives in the [core architecture tests](../../libs/modeler-core/src/architecture.spec.ts),
[VS Code architecture tests](../../apps/vscode-plugin/src/architecture.spec.ts),
[BPMN package tests](../../packages/bpmn-modeler/src/architecture.spec.ts),
[DMN package tests](../../packages/dmn-modeler/src/architecture.spec.ts), and
[ESLint boundary rules](../../eslint.config.cjs).

### Host integrations

VS Code runs the core in-process. The standalone app loads that extension in
Theia/Electron and adds shell behavior through `libs/standalone-extension`.
IntelliJ runs the same core out-of-process and renders its BPMN editor in JCEF.
Its host also integrates diff, deployment and scripting; its visual editor does
not currently provide DMN or Forms parity.

A feature both hosts offer is built once in the core from ports, not wired per
host. `EditorSessionLifecycle` runs every editor session: it routes webview
messages in document order, tracks focus, and runs each
`EditorSessionParticipant` in isolation, so one failing participant cannot skip
the others or their teardown. Participants see focus, document, setting,
re-seed and dispose events, never a host panel. The host-free participants
(element templates, bpmnlint, settings, engine version, deployment status,
code-link, form-reference status, definition search) and the webview message
handlers live in the core. `DeploymentFeature` and `MarketplaceCommands` own
the deployment and marketplace flows. A host supplies adapters and maps its
own surface (VS Code commands and views, bridge RPC) onto these modules. It
keeps only what is genuinely host-specific: VS Code's input UI, settings
writes and reload hint; the bridge's workspace-root registration, acknowledged
marketplace persistence and rendering on `document/didChange`, because the host
owns the document revision there. Host classes depend on the core ports, not
on concrete adapters, so the in-memory test kit fits every one of them; the VS
Code architecture test lets only the composition root and infrastructure
import a class that implements a port.

The BPMN, DMN and Form editors synchronize their document through one core
module, `EditorDocumentSync`: own-write echo suppression, revision-checked
syncs, and a single, snapshot-checked initialization of an empty file that a
webview reload or a host edit cannot race. Each modeler service adds only its
document type (the empty content, BPMN's engine prompt, the query it posts),
and one `DocumentRenderParticipant` re-renders any of them on a host change.
On the webview side the BPMN and DMN webviews share `WebviewDocumentSync` in
`libs/shared` (host revisions, the serialized import queue, debounced host
import and outbound sync, the flush protocol); BPMN adds its engine reload and
deferred actions on top. The Form webview shares the revisions, flush lock and
serialized import, but keeps posting each change at once instead of
debouncing: its JSON export is synchronous and cheap.

The BPMN webview ships an `index.js` entry, one `index.css` and lazily loaded
`chunks/**` that resolve relative to the entry (`base: "./"`), so every host
serves the whole bundle directory. VS Code and the standalone app copy it into
the extension; IntelliJ syncs it into plugin resources and serves any path
below it from the loopback asset server. The BPMN shells set no CSP. One added
later must allow the bundle origin (`webview.cspSource`) in `script-src` and
`style-src` rather than rely on the entry's nonce alone, because the chunk
loader injects preload links.

Camunda Forms use a dedicated form-js webview and `.form` custom editor inside
the existing VS Code extension. Forms share the modeling workflow, host
infrastructure and release lifecycle with BPMN/DMN. A separate form extension
would duplicate that infrastructure and require another installation; the
accepted cost is a larger extension for users who do not model forms.

### Runtime and transport

Ship the IntelliJ bridge as a self-contained binary compiled with
`bun build --compile`. Users need neither Node nor Bun installed. The core's
dependencies work in that runtime, and one toolchain can cross-compile the
platform binaries. Webview assets ship alongside the executable in the plugin.
The [bridge build scripts](../../apps/modeler-bridge/package.json) and
[Gradle staging](../../apps/intellij-plugin/build.gradle.kts) define the current
platform matrix and distinguish local host-only from release staging.

A single NDJSON JSON-RPC duplex over subprocess stdio carries host-capability
calls and the webview relay. JCEF messages travel through `JBCefJSQuery` to the
JVM and then stdio; replies return through the JVM's JavaScript message relay.
The bridge embeds no HTTP/WebSocket server and opens no TCP port. The JVM's
separate loopback asset server serves static resources, not per-document state.

Keep protocol methods, parameter types and directions in the
[protocol descriptor](../../apps/modeler-bridge/src/protocol/descriptor.ts).
Update its committed snapshot when the private wire contract changes; the
[contract tests](../../apps/modeler-bridge/src/protocol/protocol.spec.ts) guard
descriptor/snapshot agreement and host coverage.

### Process lifecycle

One project-scoped supervisor owns one bridge process, isolating failures and
teardown to the project. The stateless asset server is application-scoped.
Project startup now prewarms the bridge and JCEF when supported; process
creation also remains off the UI thread when an editor needs it directly.

On exit, the supervisor retries with backoff and limits repeated rapid crashes;
a stable run resets that budget. Recovery re-registers live sessions from the
authoritative IntelliJ Documents, replays render requests, and re-seeds
deployment state. Stdin EOF terminates the bridge; project disposal and shutdown
cleanup prevent orphan processes.

An asynchronous writer drains a soft-bounded outbound queue so editor and JCEF
threads never block on bridge stdin. Superseded document and host-state updates
coalesce; authoritative document updates and RPC replies remain reliable across
backpressure and writer replacement. Best-effort frames may be dropped.

Notifications and status indicators are native host UI backed by RPC ports.
Secrets use IntelliJ PasswordSafe, an application-scoped store, corresponding
to VS Code SecretStorage. Target-specific credential namespacing belongs to
the [deployment record](deployment.md#targets-and-credentials).

### Host-replicated state

Synchronous core getters cannot wait for asynchronous RPC. The bridge therefore
keeps explicit local mirrors with these ownership rules:

| Mirror | Seed and updates | Writer of record |
| --- | --- | --- |
| Documents, keyed by editor | `session/register`, then `document/didChange` | Host Document; bridge writes are accepted by the host before its content becomes authoritative |
| Settings snapshot | Settings in `session/register`, then `settings/didChange` | Host only; one shared snapshot fans changes out to editors |
| Deployment state | `deploymentState/seed`, including active target and ledger | Bridge snapshot during the process lifetime; host persists it for the next seed |

Apply settings before initial artifact discovery. Seed every synchronous mirror
before its first consumer, and re-seed on process restart; mirrors do not
survive the subprocess.

Deployment writes update the optimistic snapshot and await acknowledged host
persistence. Failures are logged, not rethrown or rolled back: a persistence
failure must not turn a successful deployment into a failed operation, and
rolling back would show stale values mid-session. The next seed reconciles
with the persisted host state.

A new synchronous port must specify its seed, respawn replay, writer, update
direction and any echo handling. Keep these explicit rather than forcing a
generic mirror abstraction across keyed documents, event-producing settings,
and optimistic deployment state.

### Document causation and session identity

The `document/write` reply is the causation signal for the bridge's own
writes; the host sends no `document/didChange` echo for them. While applying a
write, the host marks the editor so the synchronous Document listener skips
the change without copying the text. An accepted, changed reply updates the
bridge mirror and never re-renders. When the host normalizes line separators,
the reply carries `normalizedContent` so the mirror keeps the host's exact
bytes; otherwise the full XML is not sent back. Every `document/didChange` is
therefore external and re-renders. Content equality alone is never used to
classify a change. This relies on the host replying on the same ordered
channel after the Document mutation, so a later external change always
arrives after the reply.

Separately, the host advances `documentRevision` on external changes. Renders
carry it to the webview; writes return it as `expectedDocumentRevision`.
Reject stale writes with `accepted: false` and retain host content. Registration
re-seeds the revision so restart cannot reset this protection.

Host-owned `sessionId` distinguishes successive editors for the same URI. Both
peers reject mismatched identities, including stale disposal. For existing
compatibility, a missing session ID addresses the current session; legacy
webview writes without a document revision are accepted only before revision
zero advances. The core's own session guard remains a second defense.

### Shared host caches

A host process serves every open editor, so work whose result does not depend
on the editor is cached in the `modeler-core` service that every editor of the
process shares. Hosts only wire lifecycle events into that service. Each entry
has an owner that keeps it valid: a version key that changes with its input, or
a live watcher of an open editor. An entry is released with its last editor, and
a cached result must equal an uncached run.

- **Element templates.** `BpmnElementTemplatesService` caches parsed templates
  per template directory, plus the marketplace cache. The directories that exist
  are still probed per request, so a new `element-templates` folder is found.
  A template watcher event drops all directory entries once, after a short
  debounce over the per-editor watchers. A marketplace action drops the
  marketplace entry. Releasing an editor drops the directories no open editor
  still watches, because a change there would otherwise go unnoticed.
  Accepted cost: a marketplace update made by another window is not seen while
  editors of this process stay open.
- **Escalated lint setup.** `NodeBpmnLinter` keeps the moddle, the loaded
  moddle extensions and the resolved rules and configs per `.bpmnlintrc` path,
  keyed by the config content. A changed config replaces the entry. Every run
  still builds its own `Linter`, as [Linting](bpmn-modeler.md#linting) requires.
  Rules no resolver finds, and setups with a missing moddle extension, are not
  kept, so installing the package takes effect on the next run. Accepted cost:
  a workspace plugin installed mid-session that shadows a bundled rule takes
  effect only after the config changes or the host restarts.
- **Code-link source index.** `SourceIndex` keeps, per set of workspace
  folders, the listed source files and each file's facts: the bean ids its
  Spring/CDI annotations name and its short quoted literals. A resolve then
  answers from map lookups instead of reading every source. The facts give the
  same answers as the content matchers for every literal they can decide,
  checked by a fuzz spec. A longer literal, or one with whitespace or quotes,
  is still matched against the content. One `**/*` watcher per folder keeps the
  index current at constant cost per event: a change drops one file's facts, a
  delete or an unknown create lists the folders again on the next resolve, and
  a folder created or deleted as a whole drops its files' facts then. Documents
  outside every folder are not indexed. Accepted costs: facts stay in memory
  while an editor of those folders is open (files over 1 MB are not kept), and
  changes the watchers miss, for example under `files.watcherExclude`, show
  only after the last such editor closes.

## Alternatives and consequences

- Leaving the core or its registries inside the VS Code plugin would couple
  other hosts to plugin internals or force them to duplicate session logic.
- Wiring each feature per host kept the hosts simple to read but let the copies
  drift: the bridge stopped re-linting on edits and setting changes, and did not
  isolate failing session hooks. Feature modules in the core cost a little
  indirection — a host reads its surface mapping, not the flow — in exchange for
  one place per fix.
- A WebSocket relay would add a second reconnect lifecycle and a server to the
  bridge. Stdio uses the browser the JVM already owns and gives one recovery
  boundary. A browser-only host may need a different transport.
- Bundled Node and Node SEA remain more involved distribution options;
  GraalJS would change the seam and introduce unproven JS compatibility costs.
  Bun accepts platform-specific binaries and runtime maintenance in exchange
  for the tested single-toolchain distribution.
- Crash recovery starts from the host Document. Edits that never reached that
  document before a crash can be lost.
- Package semver and shared dependency alignment are real maintenance costs;
  their release mechanics are recorded in [Release and publishing](release-and-publishing.md).
