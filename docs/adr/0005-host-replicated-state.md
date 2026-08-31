# 0005 — Host-replicated state: the bridge's synchronous-mirror pattern

- Status: accepted (#1106)
- Date: 2026-06-28
- Category: modeler-bridge

Builds on [ADR 0004](0004-intellij-host-foundation.md) (#1062, the stdio
JSON-RPC transport + process supervision) and the deployment feature's
host-side state work. This ADR documents a pattern that already exists in
three places; it forces no new abstraction.

## Context

The out-of-process modeler core (`@miragon/bpmn-modeler-core`) runs unmodified in
a Bun subprocess and reaches the IntelliJ host only over async JSON-RPC (see the
host-foundation ADR). But three host-capability ports the core depends on are
**synchronous**:

- `DocumentPort.getContent(editorId): string` — read by
  `BpmnModelerService.display()` on the render hot path.
- `SettingsPort` getters (`getConfigFolder(): string`, `getLanguage(): string`, …)
  — read during template discovery and render.
- `DeploymentStatePort` getters (`getEndpoint(): string`, …) — read while
  building the deployment form defaults.

A synchronous getter cannot do an RPC round-trip; the core would have to block the
event loop on the host. The bridge solves this the same way an LSP server solves
it for `textDocument` reads: the **host pushes** the authoritative state into the
core, which keeps a local **read-model projection** (a "mirror") that the
synchronous getters read from. The host owns the truth (the IntelliJ `Document`,
the native Settings UI, the persisted `PropertiesComponent`); the bridge holds a
cache kept current by host-pushed updates.

Three mirrors implement this today:

| Mirror | Source of truth | Seeded by | Kept current by | Cardinality |
|---|---|---|---|---|
| `DocumentMirror` (`adapters.ts`) | IntelliJ `Document` | `session/register` | `document/didChange` | keyed by `editorId` |
| `BridgeSettings` (`nodeAdapters.ts`) | native Settings UI | `session/register` (`settings`) | `settings/didChange` | singleton |
| `RpcDeploymentState` (`adapters.ts`) | `PropertiesComponent` | `deploymentState/seed` | bridge-authoritative (see below) | singleton |

The pattern is correct, but two pieces used to be implicit and fragile; #1106
made them explicit. This ADR is the single write-up of the lifecycle, ownership,
and echo rules so the next contributor adding a synchronous port has a checklist.

## Seed / re-seed lifecycle

A mirror is useless until seeded, so seeding is part of session setup, not a
later event:

- **Document + settings** are seeded together on `session/register`: the host
  sends the current `Document` text plus a settings snapshot in the register
  frame. The bridge applies settings **before** any element-template discovery so
  the very first scan uses the configured `configFolder` rather than the default
  (`editorSessionFeature.ts` — settings are applied ahead of the hook loop).
- **Deployment state** is seeded on `deploymentState/seed`, sent when the
  deployment tool window registers (and re-sent on respawn).

Because the host is authoritative and the subprocess is disposable, **re-seeding
on respawn is mandatory**: when the supervisor restarts a crashed bridge, the
host replays every live session (`EditorSessionRouter.reregisterLiveSessions`)
— rebuilding each `DocumentMirror` entry from the live `Document` — and re-sends
the deployment seed. The mirror never persists across a restart; it is always
reconstructed from the host's truth.

## Ownership / single-writer rule

Each mirror has exactly one writer of record, and the direction of writes is
fixed:

- **Settings** flow host → bridge only. The bridge never writes settings back;
  it only reacts (re-render, template reload). One snapshot fans out to every
  open editor via the shared `BridgeSettings` event hub.
- **Document** is host-authoritative, but the core also *writes back* via
  `document/write` (a `Ctrl+S` or a webview edit). The bridge updates the mirror
  only after the host accepts that write and the host echoes the change back as
  `document/didChange`. Distinguishing that echo from a genuine external edit is
  the subtle part — see the next section.
- **Deployment state** is **bridge-snapshot-authoritative in-process**: the
  optimistic snapshot is the single source of truth for reads, and the host is a
  persisted *replica* reconciled on the next re-seed. `save*` updates the
  snapshot, then sends an **acknowledged** persist request; a persist failure is
  *logged* via the notifier, not left to diverge silently, and is **not**
  rethrown — a failed persist must not fail an otherwise-successful deploy
  (`DeploymentService.deploy` awaits these post-success). The snapshot is
  deliberately not rolled back on failure: reverting mid-session would surface
  stale form values, and the next seed reconciles anyway.

## Echo suppression — explicit revision/`causedBy` causation

When the core writes the document (`document/write`), the host applies it to the
IntelliJ `Document`. That `setText` **synchronously** fires the editor's
`DocumentListener`, which sends a `document/didChange` back — the host echoes our
own write. Re-rendering that echo would loop, so the bridge must drop it while
still rendering genuine external edits (git revert, the plain-text tab, another
tool).

The original implementation inferred the echo by **content comparison**:
`document/write` updated the mirror first, so a `didChange` whose content equalled
the mirror was assumed to be the echo. That was correct but implicit — it relied
on render-idempotency reasoning and would misfire if an external edit happened to
reproduce the mirror's exact bytes.

#1106 replaced it with **explicit causation**, LSP-style (versioned `didChange`):

1. Every `document/write` mints a per-editor monotonic **revision**
   (`DocumentMirror.nextWriteRevision`), recorded in a per-editor set of pending
   own revisions, and ships it on the write frame.
2. The host threads the revision through a per-editor **pending-causation** token
   (`EditorSessionRouter`): `handleWrite` stores it right before `setText` and
   clears it right after. The synchronous `DocumentListener` echo reads the token
   and stamps the outgoing `document/didChange` with `causedBy: <revision>`.
3. The bridge drops a `didChange` iff `causedBy` matches a pending own revision
   (`DocumentMirror.isOwnEcho`, which consumes the entry so the set stays
   bounded — one changing write, one echo). A genuine external edit carries no
   `causedBy` (or a stale/unknown one) and renders.

A no-op write is the one case that mints a revision without an echo: the host
only fires `document/didChange` when the `Document` actually changes, so a write
whose content already matches (e.g. after `\r\n`→`\n` normalisation) echoes
nothing. The bridge sees `changed: false` on the write reply and drops the
orphan revision while completing the write, keeping the pending set bounded. If
an echo does arrive, its host-provided content updates the mirror before the
bridge suppresses the redundant render, so a later write response cannot replace
normalized host bytes with the originally requested text.

The IntelliJ transport treats `document/didChange` as reliable. Superseded
external updates coalesce per editor, but the latest authoritative frame is not
dropped under queue backpressure or while the bridge writer is being replaced.

## Stale-write and stale-session rejection

Echo causation identifies who produced a change; it does not prove that a
webview write still represents the latest host document. The host therefore
owns a second monotonic counter, `documentRevision`, and increments it for every
external document change. Renders carry that revision into the webview, and
`SyncDocumentCommand` returns it through `document/write` as
`expectedDocumentRevision`. The host rejects the write with `accepted: false`
when the revision changed in flight. The bridge then leaves its mirror on the
authoritative host content. `session/register` re-seeds the current revision, so
a bridge restart cannot reset this protection to zero.

Each open editor also gets a host-owned `sessionId`. Frames that address an
editor session carry this identity in addition to the URI. Both peers reject a
mismatched identity, so late messages or disposal from an old same-URI editor
cannot mutate or tear down its replacement. Bridge write causation is keyed by
both URI and session ID for the same reason. For compatibility, a missing
`sessionId` addresses the current session, while a legacy webview sync without a
document revision is accepted only before the host advances past revision zero.

The core's `ModelerSession` guard stays wired as a second line of defence. Echo
prevention remains entirely in TypeScript, so every future host inherits it
without re-implementing the rule — the host only has to thread the token, which
is a mechanical forward of a number it received.

## Adding the next synchronous port — checklist

When a new core port has synchronous getters that the host must back:

1. **Define the mirror** next to the others (`adapters.ts` for keyed/per-editor,
   `nodeAdapters.ts` for fs-backed). Getters read the mirror; never await.
2. **Seed it.** Add a `*/seed` (or fold into `session/register` if it is
   per-editor and known at open time). Apply the seed *before* anything that
   reads it synchronously.
3. **Re-seed on respawn.** Wire the seed into the host's respawn replay so a
   crashed bridge is reconstructed from the host's truth.
4. **Pick the writer.** Host → bridge only (like settings) is simplest. If the
   core writes back, decide whether the bridge snapshot is authoritative (like
   deployment) and make the persist **acknowledged + logged**, never
   fire-and-forget.
5. **If a write can echo**, suppress it by explicit causation (revision /
   `causedBy`), not content comparison.
6. **Update the protocol contract.** Add the method to `METHODS` + `PROTOCOL`
   in `descriptor.ts`, refresh `protocol.json` (dump `protocolSnapshot()`), and
   the contract test (`protocol.spec.ts`) keeps the Kotlin host honest.

## Out of scope

A single generic `HostMirror<T>` unifying the three mirrors was considered and
**deferred**: they differ in cardinality (keyed map vs singleton), change-event
fan-out, echo handling, and write direction, so forcing one generic risks a leaky
abstraction. This ADR captures the shared pattern instead.
