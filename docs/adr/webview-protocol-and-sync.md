# Webview protocol and sync

- Status: accepted
- Last reviewed: 2026-11-13

## Context

Every editor runs as a webview (or, on Orca, a frame) that talks to a host over a private protocol, shows a document it does
not own and ships as a bundle the host serves under a content security policy. This topic records the host/webview seam; the
core/host seam (ports, core-built text, features built once) is in
[Architecture and hosts](architecture-and-hosts.md#host-integrations) and the IntelliJ transport in the
[bridge](intellij-bridge.md).

## Contents

- [Protocol](#protocol)
- [Document sync and flush](#document-sync-and-flush)
- [Bundle and CSP](#bundle-and-csp)

## Decision

### Protocol

The Query/Command protocol is private and can change across all
in-repo hosts in one change; the public contract is the factory/handle API.

- Each message class fixes its `type` as a string literal and `libs/shared` derives
  `ProtocolQuery`, `ProtocolCommand` and `MessageOfType<"X">`, so switches narrow instead
  of cast. Inbound messages stay untrusted JSON, narrowed once (`asProtocolMessage`), with
  unknown types ignored. Handler tables use a mapped type needing an entry per type; a spec
  checks that spread groups do not name the same type, which TypeScript does not.
- The commands a webview may post are closed lists per surface, registered in
  `WEBVIEW_SURFACE_COMMAND_TYPES` ([source](../../libs/shared/src/lib/webviewSurfaces.ts)).
  A page narrows its host channel to its list, so it cannot post another surface's command
  or a query; a protocol command on no surface fails a spec (an unposted command is
  deleted, not kept routed). The
  [webview command scan](../../tools/repo-checks/src/webviewCommands.spec.ts) type-checks
  every workspace program that constructs `HostApiImpl` (the one class that calls
  `acquireVsCodeApi()`), so a webview counts whatever its directory is called, and fails on
  a `Command` construction whose type is not a literal or is on no surface. It misses a
  message posted without a construction and a webview that never constructs `HostApiImpl`;
  such a webview drops out without a sign, and the spec fails only when no webview is left.
- A diff pane posts through its own list. The BPMN pane's is the handshake plus the pane
  list. The DMN pane's list spreads the commands every diff pane posts and adds its own, and
  it has no handshake: its bootstrap creates its modeler before the file arrives, so VS Code
  names the page a diff pane in its HTML (`<body data-surface="dmnDiffPane">`) and the page
  loads the diff bootstrap instead of the editor. The bridge registers the surface as
  absent, because IntelliJ has no DMN editor ([DMN diff](diff.md#dmn-diff)).
- The add-ons view is a surface like the others; its protocol is in
  [Add-ons](add-ons.md#page-protocol-and-reveals).
- Each host keeps one coverage spec over every surface (`HostSurfaceCoverage`): per command
  `HANDLED`, `ignored(reason)`, or `absent(reason)` for a surface the host does not offer.
  A new surface or command fails to compile until every host's table names it. A router
  dispatches an unrouted type as a no-op but records deliberate drops (`ignore(type,
  reason)`) so `routeOf` tells a drop from a missing route.
- Commands and queries are not correlated: a request is a command and the answer a later
  pushed query. A port that answers while several requests can be in flight carries a
  request id the host echoes, and hosts answer an awaited request even when they cannot
  serve it. BPMN and DMN webviews bound every awaited answer (`HOST_REPLY_TIMEOUT_MS`)
  because IntelliJ's best-effort frames can lose a request or answer; only the initial file
  request waits unbounded, since a cold first open can outlast any backstop.

### Document sync and flush

BPMN, DMN and Form editors share one core module,
`EditorDocumentSync` (own-write echo suppression, revision-checked syncs, one
snapshot-checked initialization of an empty file); a webview reload cannot race it and a
host edit at a newer revision supersedes it whichever host owns the revision. Each modeler
service adds only its document type and one `DocumentRenderParticipant` re-renders on a
host change. BPMN and DMN webviews share `WebviewDocumentSync` (`libs/shared`); Form posts
each change at once because its export is synchronous and cheap.

Before a document is persisted, `PendingEditsFlush` asks the webview for the edits its
debounce still holds and writes them through the modeler service for the file type. VS Code
runs it on every save and both deploys of the open diagram run it on both hosts. Input
waiting in an editor's debounce counts, so BPMN/DMN panels and form-js inputs use the
flushable debounce from `modeler-types` (`createFlushableDebounceInput`); a BPMN mode
switch that rebuilds the surface applies it before export. Where the platform owns the
save, the host flushes itself.

Every host reads a page's flush reply, and decides what to write from it, with one table:
`parseFlushReply` and `decideFlushWrite` in `libs/shared` (`documentFlush.ts`), whose rows are
`documentFlushReply.cases.json`. The Theia frontend keeps a copy, because that package's build
imports no workspace package; its spec runs the rows and pins the copy's types to the shared
ones. IntelliJ's Kotlin twin runs the rows too. The hosts differ only in what they observe and
how they act on the decision.

- A reply the host cannot read gets the cautious reading: an unknown status, a status that is
  not text and a `flushed` reply without content read as `unavailable`, so a page newer than its
  host is not trusted to have flushed.
- A `flushed` reply writes the export. After a failed sync the write is refused; the page marks
  a failed sync with a field on its log command, so no host reads log text.
- A `clean` reply to a destructive flush keeps the host document: the page answers `clean` only
  when unedited since its last host import. Otherwise the host writes the sync it observed
  during the flush, unless the reply's revision is newer than the sync's: the page has then
  imported an outside change newer than the document its sync was made against.
- On `unavailable` the core writes nothing and answers `unavailable`, so a save proceeds
  best-effort and a destructive caller refuses.

Platform-owned saves:

- *IntelliJ* announces a save with `beforeAllDocumentsSaving` on the EDT before it reads
  unsaved Documents, and the core's flush would end in a `document/write` that waits for
  that EDT. The Kotlin host therefore asks every open page for a non-destructive flush,
  waits at most 250 ms for a project's replies and writes each export whose revision still
  matches into its Document. It numbers flushes down from -1 and the core up from 1: the
  page answers both on one channel and every reply also reaches the core, so neither may
  take the other's reply or release its lock. Accepted residuals: a sync posted before the
  host asked, whose core write has not reached the EDT, lands after the save; a save of one
  Document (`saveDocument`) does not flush.
- *Standalone (Theia)* flushes the page into Theia's text model itself, past the core, with a
  non-destructive flush, before shutdown or before a diagram moves into or out of a secondary
  window, which reloads the webview. It proceeds on `unavailable`: it saw no sync to recover,
  and refusing would block the shutdown for a page that could not flush. Accepted residual: a
  `flushed` export racing a host update on its way to the page is written without a revision
  check; only a flush through the core's `PendingEditsFlush` would close that.

### Bundle and CSP

The BPMN webview ships one `index.js`, one `index.css` (CSS code
splitting is off because host shells link a single stylesheet) and lazy `chunks/**` relative
to the entry (`base: "./"`), so every host serves the whole directory. Every BPMN, DMN, form,
deployment and add-ons shell sends a CSP with `default-src 'none'`, so injected markup cannot run
script with the host message channel; each allows only what its bundle needs:

- `script-src`: the entry by nonce in VS Code, `'self'` in IntelliJ; VS Code BPMN/DMN shells
  also list `webview.cspSource` because modulepreload links carry no nonce. No
  `'unsafe-eval'`.
- `style-src 'unsafe-inline'` in every editor and deployment shell: diagram-js, the properties
  panel and CodeMirror set style attributes and inject `<style>` without a nonce. The add-ons
  shells have only their linked stylesheet and allow `style-src` and `font-src` from the bundle
  alone; the bundle writes no style attribute or `<style>` element.
- `img-src` allows `data:`, and `https:` for BPMN (element-template icons may be remote);
  BPMN and DMN have no `connect-src`. The form shell adds what form-js components load;
  the deployment shells allow only script and styles, and the add-ons shells no images.
- `base-uri` and `form-action` are `'none'` everywhere (`default-src` does not cover them).

VS Code and the standalone app set the policy as a `<meta>` tag (Theia injects unnonced
scripts ahead of it) and limit `localResourceRoots` to each bundle directory; IntelliJ sends
a response header and allows its inline `acquireVsCodeApi` shim by SHA-256. Each host builds
its policies in one place (`webviewContentSecurityPolicy.ts`,
`WebviewContentSecurityPolicy.kt`): shared directives are written once and a shell lists
only what it adds, so a shell cannot drop or reopen `base-uri` or `form-action`. Anything
that loads user-supplied code must widen these policies on purpose, not rely on a gap.
