# Architecture and hosts

- Status: accepted
- Last reviewed: 2026-09-18

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

Each bridge write carries a per-editor revision. The host threads it through
the synchronous Document change and echoes it as `causedBy`. The bridge
consumes matching pending revisions to suppress its own render echo, after
updating its mirror with the host's normalized bytes. Content equality alone
cannot distinguish an echo from an external edit. A no-op reply (`changed:
false`) removes the pending revision because no echo will arrive.

Separately, the host advances `documentRevision` on external changes. Renders
carry it to the webview; writes return it as `expectedDocumentRevision`.
Reject stale writes with `accepted: false` and retain host content. Registration
re-seeds the revision so restart cannot reset this protection.

Host-owned `sessionId` distinguishes successive editors for the same URI. Both
peers reject mismatched identities, including stale disposal. For existing
compatibility, a missing session ID addresses the current session; legacy
webview writes without a document revision are accepted only before revision
zero advances. The core's own session guard remains a second defense.

## Alternatives and consequences

- Leaving the core or its registries inside the VS Code plugin would couple
  other hosts to plugin internals or force them to duplicate session logic.
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
