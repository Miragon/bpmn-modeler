# IntelliJ bridge

- Status: accepted
- Last reviewed: 2026-11-13

## Context

IntelliJ runs the same core as VS Code, out of process, as a bridge binary the
Kotlin host talks to. Host capabilities, webview traffic and document state
therefore cross a process boundary, and the host owns the documents. This topic
records how that boundary behaves. The state mirrors the bridge keeps are in
[Host-replicated state](#host-replicated-state).

## Contents

- [Runtime and transport](#runtime-and-transport)
- [Process lifecycle](#process-lifecycle)
- [Document causation and session identity](#document-causation-and-session-identity)
- [Host-replicated state](#host-replicated-state)
- [Alternatives and consequences](#alternatives-and-consequences)

## Decision

### Runtime and transport

Ship the bridge as a self-contained binary compiled with `bun build --compile`.
Users need neither Node nor Bun, the core's dependencies work in that runtime
and one toolchain cross-compiles the platform binaries. Webview assets ship
beside the executable. The [bridge build scripts](../../apps/modeler-bridge/package.json)
and [Gradle staging](../../apps/intellij-plugin/build.gradle.kts) define the
platform matrix.

One NDJSON JSON-RPC duplex over subprocess stdio carries host-capability calls
and the webview relay. JCEF messages travel through `JBCefJSQuery` to the JVM
and then stdio; replies return through the JVM's JavaScript message relay. The
bridge embeds no HTTP/WebSocket server and opens no TCP port. The JVM's separate
loopback asset server serves static resources, never per-document state.

The wire contract is the
[protocol descriptor](../../apps/modeler-bridge/src/protocol/domain/descriptor.ts)
(methods, parameter types, directions, per-request `replyWait`) and its
committed snapshot. Each bridge feature keeps its methods, directions and
fixtures in its own `protocol/domain/<feature>Protocol.ts` module, so a
feature's protocol change edits that module, and the descriptor aggregates
them. Update the snapshot when the private contract changes; the
[contract tests](../../apps/modeler-bridge/src/protocol/domain/protocol.spec.ts)
guard agreement. The IntelliJ
[handler coverage test](../../apps/intellij-plugin/src/test/kotlin/io/miragon/intellij/bpmn/bridge/ProtocolHandlerCoverageTest.kt)
reads the snapshot against the production `BridgeRouters`:

- Each core→host method needs exactly one Kotlin handler, and a handler for a
  method the core no longer sends fails.
- The host names a host→core method only through the `HostToCoreMethod` enum,
  so it cannot send one the core does not handle.
- Handlers read their params before acting (`RpcParams`, sealed once the read
  returns) and reply only with an `RpcResult` class, so the test can compare
  parameter and result keys with the snapshot's.
- The snapshot is an input of the Gradle test task and of the IntelliJ CI path
  filter, so a TypeScript-only protocol change runs the test.

### Process lifecycle

One project-scoped supervisor owns one bridge process, isolating failures and
teardown to the project. The stateless asset server is application-scoped.
Startup prewarms the bridge and JCEF; process creation stays off the UI thread.

**Crash recovery.** The supervisor retries with backoff and limits rapid
repeated crashes (a stable run resets the budget). Recovery re-registers live
sessions from the authoritative IntelliJ Documents, replays render requests,
focuses the selected diagram tab again and re-seeds deployment state. A tab that
closes while recovery builds its register frame gets a second `session/dispose`,
and the last frame for an editor id belongs to the open tab. Stdin EOF
terminates the bridge; project disposal prevents orphans. Reload Modeler runs
the same recovery against the running bridge.

The replayed render re-imports the Document, and a sync the restart window
dropped never reached it, so recovery first flushes each page with the rule a
tab close uses: a destructive `exportWhenEdited` flush, written into the
Document only while its revision still matches and no external update is
pending. A page cannot tell a dropped sync from a delivered one but knows
whether it was edited since it last imported a host document
(`HostDocumentRevisions`): an edited page exports even if its sync went out, a
page nobody edited answers `clean`, so recovery never writes the modeler's
serialization over an untouched diagram. This is host policy and stays in
Kotlin; a shared render participant must keep the flush before the replay.
Accepted residuals: an edit in the page's import debounce after the unlock can
be overwritten, and each replay clears the page's undo stack. Edits that never
reached the Document before a crash can be lost.

**Backpressure and replies.** An asynchronous writer drains a soft-bounded
outbound queue so editor and JCEF threads never block on bridge stdin.
Superseded document and host-state updates coalesce, authoritative document
updates stay reliable, best-effort frames may be dropped. A respawned bridge
numbers requests from 1 again, so the host tags each request with its process
generation and drops a reply once that process is detached.

The host answers every core request exactly once, with a result or an error
when its handler throws, also when the handler leaves the reader thread
(`RpcChannel.replyFrom`). Deadlines are data on each request (`replyWait`):
host work (a save, a clipboard read, a secret) fails after two minutes so a
reply the host never sends cannot hold the caller's per-editor queue; prompts
wait for the user; a write the core keeps its own state in step with has no
deadline, because giving up on a write the host still applies would leave that
state out of step (`document/write`, `deploymentState/save`,
`marketplaceState/save|remove`). `hostShow` is the short one (10 s), for
`addOns/reveal`, where the host shows one of its views: the approval question
queue waits on the reveal, so a host stuck behind a modal dialog would otherwise
hold every later notice; once it passes, the list review appears instead.
Kotlin counts the same deadline from the request's arrival and shows no tab
after it, so the user does not get both; its copy of the deadline is held to
the one `protocol.json` lists. `Rpc` fails every outstanding and later request
once its input ends. The add-ons view's relays (`addOns/webviewMessage`,
`addOns/open`) are reliable frames that wait for the next process, unlike the
best-effort deployment relay: only a result frees a busy row on the page, so a
dropped request would leave its row busy. `addOns/review` is reliable and
coalesced too, as the user waits for its result across a cold start.

**Never block the reader thread.** One reader thread reads every frame of a
bridge, so a blocking handler holds every editor's relays and document requests
behind it. A PasswordSafe read can block on an OS keychain prompt, so the host
runs `secretStore/*` and `tokenStore/*` on one background thread per project,
never the EDT: a prompt delays only credential requests queued behind it, and
the single thread keeps a save ahead of the read that follows. `document/write`
runs on the EDT, so a modal dialog delays it.

Notifications and status indicators are native host UI behind RPC ports; the
core writes their text. Secrets use IntelliJ PasswordSafe (application-scoped),
the counterpart of VS Code SecretStorage; target-specific namespacing is in
[deployment](deployment.md#targets-and-credentials).

### Document causation and session identity

The `document/write` reply is the causation signal for the bridge's own writes;
the host sends no `document/didChange` echo for them. While applying a write the
host marks the editor so the synchronous Document listener skips it. An
accepted, changed reply updates the bridge mirror and does not re-render; when
the host normalizes line separators the reply carries `normalizedContent` so the
mirror keeps the host's exact bytes. Every `document/didChange` is therefore
external and re-renders. Content equality alone never classifies a change. This
relies on the host replying on the same ordered channel after the Document
mutation.

- A page sync's write never re-renders (the page already shows it). A core write
  of content the page did not produce (Change Engine Version, Migrate All) is
  followed by an explicit render at the unchanged host revision
  (`BpmnEditorFeature.renderCoreWrite`, only for `host-driven` rendering; VS
  Code's change event re-renders already). Accepted cost: a page sync sent
  before that render carries the same revision, is accepted and overwrites the
  core write.
- A page flush the IntelliJ host writes itself (before a save, a close or a
  re-render) bypasses the core, so the mirror misses it. The host remembers it
  per session and the next accepted write of the same content reports `changed`
  so the mirror takes it; every accepted write, external change and register
  forgets it.
- The host advances `documentRevision` on external changes. Renders carry it to
  the webview, writes return it as `expectedDocumentRevision`, and stale writes
  are rejected with `accepted: false`. Registration re-seeds the revision so a
  restart cannot reset the protection.
- When the Document fails an edit the host answers the write with an error;
  `RpcEditorHandle.writeContent` then answers `false` as on VS Code and the mirror keeps
  its text. Accepted cost: on both hosts a failed edit is not reported as such
  (the page sync shows nothing, Change Engine Version blames a change made while
  the user picked a version).
- A host-owned `sessionId` distinguishes successive editors for one URI and both
  peers reject mismatched identities, stale disposal included. A missing session
  id addresses the current session and a legacy webview write without a
  document revision is accepted only before revision zero advances (existing
  compatibility). The core's own session guard is a second defense.

### Host-replicated state

Synchronous core getters cannot wait for asynchronous RPC, so the bridge keeps explicit
local mirrors. The host is always the writer of record, and a bridge write reaches its
mirror only after the host accepted it.

| Mirror | Seed and updates | Writer of record |
| --- | --- | --- |
| Documents, per editor | `session/register`, then `document/didChange` | Host Document |
| Settings snapshot | in `session/register`, then `settings/didChange` after a change and after each spawn (a register queued before the spawn read them early, a push while it started was dropped) | Host only; one snapshot fans out to editors |
| Deployment state | `deploymentState/seed`, then `deploymentState/save` patches | Host |
| Plugin approvals ([allowance](code-allowance.md#approval-store) rows of plugins and rule packages) | `pluginApprovals` + revision in `session/register`, then `pluginApprovals/didChange` to every bridge of the IDE | Host (`PluginApprovalStore`, application level); a bridge sends only rows to allow and ids to revoke, the host merges under one lock and bumps the revision |
| Workspace roots | `workspaceRoot` in `session/register` (counted per session, released with it) and `addOns/open` (claimed once per process, re-sent after every spawn, never released, so the add-ons view lists the project after its last editor closed) | Host (`project.basePath`, or the file's folder for a session without one); an `addOns/open` without a root lists no folder |
| [Template switches](element-templates.md#template-switches) | `templatePreferences` (both scopes, a revision each) in `session/register`, then `templatePreferences/didChange` | Host stores (IntelliJ project and application `PropertiesComponent`, VS Code `workspaceState`/`globalState`); same merge-by-change rule |
| [Workspace trust](code-allowance.md#host-trust) | `workspaceTrust` (`trusted`, `revision`) in `session/register`, then `workspaceTrust/didChange` after each spawn, on a trust change and before **Refresh** of the Add-ons tab, since adding a Trusted Location announces nothing. Untrusted until the first frame | Host (`Project.isTrusted()`), read with a new revision under one lock, so a newer revision never carries an older read |

- Apply settings before initial artifact discovery, seed every synchronous mirror before its
  first consumer and re-seed on process restart; mirrors do not survive the subprocess.
- A mirror fed from more than one frame cannot rely on the host's send order. The bridge
  runs inbound calls on queues keyed by editor or method (`Rpc.handleLine`), so a register
  waits behind its editor's earlier frames while a later push on another queue runs at once,
  and a reply can arrive after a newer push. Lists therefore carry a host revision on every
  frame and the mirror ignores an older one (per scope for template switches). The host
  holds no lock while queueing and does not coalesce, so a later-queued frame can carry the
  older revision. The revision lives in memory per IDE run; a respawned bridge starts below it.
- The deployment state is one `DeploymentState` snapshot (ad-hoc connection, active target,
  freshness ledger) behind `DeploymentStatePort` (synchronous `load()`, `save(patch)`); the
  core owns defaults and shape. A host stores a save all or nothing: VS Code keeps the whole
  snapshot under one workspace-state key because updating one `Memento` key is its only
  atomic write (it still reads earlier releases' per-field keys until the first save and
  leaves them for a downgrade); IntelliJ applies a patch in one handler. The bridge applies a
  patch to its snapshot only after the host accepted it, so a read never shows a value the
  host did not store. The cost: `load()` returns the previous state until the save resolves,
  so a core caller awaits a save before reading what it wrote. Whether a failed write fails
  the operation is the core's call (an engine-accepted deploy stays deployed, see
  [deployment](deployment.md#saved-target-execution)).
- The lint choice is a snapshot setting, but IntelliJ's settings page has no field for it:
  the editor toggle and BPMNlint widget drive it. The bridge never changes its copy; it
  reports the choice (`settings/setLintingEnabled`) and the host stores it per user and
  pushes the snapshot to every bridge before acking, so it survives respawns, restarts and
  other projects. Automatic form preview follows the same ownership, with initial and
  recovery settings arriving before selection restoration so a surviving page cannot reopen
  a preview from a stale preference.
- The IntelliJ host registers each mirror it owns once, as a `ReplicatedState` (its register
  entries, its push to one bridge and whether a change may reach every bridge). The register
  frame, the seed after a spawn and the fan-out walk that list, and `BridgeRoutersTest` fails
  on a router that mirrors a state outside it.
- A new synchronous port must specify its seed, respawn replay, writer, update direction and
  echo handling. Keep these explicit rather than forcing a generic mirror abstraction over
  keyed documents, event-producing settings and patched deployment state.

## Alternatives and consequences

- A WebSocket relay would add a second reconnect lifecycle and a server to the
  bridge; stdio reuses the browser the JVM owns and gives one recovery boundary.
  A browser-only host may need a different transport.
- Bundled Node and Node SEA are more involved distribution options and GraalJS
  would change the seam and add unproven JS-compatibility cost. Bun accepts
  platform-specific binaries and runtime maintenance for a tested
  single-toolchain distribution.
- Recovery starts from the host Document, not from the dead bridge's state.
