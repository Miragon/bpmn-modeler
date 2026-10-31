# Architecture and hosts

- Status: accepted
- Last reviewed: 2026-10-30

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
| `libs/modeler-types` | Public, host-agnostic concepts and browser utilities suitable for publication, and pure rules browser code shares with the core |
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

Placement in `modeler-types` requires freedom from the private protocol and
either a surface worth publishing or a pure rule that both browser code and the
core apply. Portable mode types, disposable primitives, engine versions, canvas
utilities and `isTextEditingSurface` qualify as surface. Script-surface
addressing (`scriptSurface.ts`) is such a shared rule, and so is the XML comment
and CDATA scan (`xmlMarkup.ts`) behind the published `extractModelDefinitions`,
the core's workspace content search and code-link. Process-variable extraction
(`processVariables.ts`) belongs here too: the BPMN webview runs it on the live
model, and the core's script domain keeps the `VariableDef`s it yields, which
the protocol only carries. Browser code cannot import the core, whose barrel
exports Node-only modules, so a rule both apply has no other common home. The
package is private and inlined: its npm surface is only what a package entry
re-exports by name, which `check-dts` and `publicApi.spec.ts` gate, so a shared
rule adds nothing to it. A rule there keeps its module free of top-level side
effects, so a bundle that does not use it leaves it out. A rule only the core
applies stays in the core's `domain/`. DOM-id-coupled panel resizers,
focus/shortcut bindings and the VS Code body-class theme adapter belong in
`shared`. This deliberately mixes private browser chrome with the protocol to
avoid another workspace for a few helpers.

`modeler-core` owns domain/services, the editor-session core
(`EditorSessionStore`, `WebviewMessageRouter`, `EditorSessionLifecycle`) and
`DiffPaneStore`. Host applications import its public entrypoint and supply
capability ports and editor/diff handles. The core is VS Code-free, and no core
file reaches a host module (`node:*`, `fs`, `http`), directly or transitively.
This does not make the whole core browser-safe: portable Node utilities such as
`path` remain valid there.

Inside the core, each feature folder (`modeler/<editor>` for the editors)
splits into `domain/`, an application layer of `service/` and `session/` (the
editor-session participants), `infrastructure/` and root files that compose the
feature. `domain/` imports only domain modules, `@miragon/bpmn-modeler-types`
and Node `path`. Two folders are shared, and features reach each other only
through them. A feature's `domain/` may import only its own `domain/` and the
`domain/` of `kernel/` and `editorSession/`.

- `kernel/` holds the vocabulary several features build on: `BpmnDocument`,
  engine versions, the workspace path, config-folder, glob, containment and
  watcher rules, the cross-cutting errors and host ports, and the HTTP
  contract (`HttpClient`, `HttpTransportError`, `loggableHost`) with its fetch
  adapter. A service joins `kernel/service/` only when at least two features
  use it, as `ArtifactService` and the workspace file search do. `kernel/`
  imports no other folder, so it stays the bottom layer.
- `editorSession/` is the application core every editor runs on. Its
  `service/` holds the store, lifecycle, router, document sync, ordered
  dispatch, flush services and webview log routing, `session/` the render
  participant, and `infrastructure/` only the inbound document, focus, log and
  notification handlers. Its `domain/` keeps the session events, the
  participant contract, the echo guard and status-item ownership.
  `EditorHandle` sits in `service/` because its `postMessage` speaks the
  private protocol; `EditorSessionDocuments` implements `DocumentPort` on top
  of the store, so it is a service, not an adapter. `editorSession/` imports
  only `kernel/`, which the cross-feature rule already implies.

Services and participants import no infrastructure; in infrastructure only the
inbound `*MessageHandlers` adapters import services. A relative import resolves
to a feature module, never to the package entry or the test kit, and the core
has no import cycles. The core architecture test enforces these rules.
Cross-cutting host ports live in `kernel/domain/hostPorts.ts`; a port, prompt
or error one feature owns lives in that feature's `domain/` (`ports.ts`,
`errors.ts`), so `kernel/` names no feature.
A store that holds application state and reaches the host, if at all, only
through ports, such as `MarketplaceCache` and `DiffPaneStore`, lives in its
feature's `service/` with no port of its own. The test lists no exception
today. A new one names the issue that removes it, and the test fails when one
is no longer needed, so the lists only shrink.

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

The commands the BPMN editor webview may post are a closed set, kept as a value
so a host can iterate it: `BPMN_EDITOR_COMMAND_TYPES` in
`libs/shared/src/lib/bpmnEditorCommands.ts`. The webview's `HostChannel` takes
only those, and the bootstrap narrows its host to it once, so neither the
bootstrap nor a session module can post another surface's command or a query.
`HostApi` declares its members as properties, not methods, because TypeScript
compares a method's parameters bivariantly: the narrowed channel could
otherwise be handed to a helper typed for every message. The shared
`WebviewDocumentSync` takes a channel for exactly the three messages it posts,
so handing it the BPMN channel proves they are on the list. The diff pane,
which the bootstrap starts instead of the editor, posts through its own
`DiffPaneChannel`, typed to the closed `DIFF_PANE_COMMAND_TYPES`
(`libs/shared/src/lib/diffPaneCommands.ts`), so it cannot post an editor
command. Both hosts route a pane's commands through the core's
`createDiffPaneRouter`, a `CommandTable` whose handlers get the pane. The table
covers that list and `DIFF_PANE_HANDSHAKE_COMMAND_TYPES`, the editor requests
the page posts before it knows it is a diff pane: it answers the file request
and ignores the settings and panel-state requests, which a read-only pane does
not use. A `DiffPaneHostExtensions` entry a host leaves out makes its command
ignored: VS Code supplies the swap and the pane log; the bridge supplies
neither, because IntelliJ's diff viewer swaps the sides before it forwards a
message and the bridge keeps no log of its diff panes. Each host pins these
routes in a coverage spec, a `Record` over both lists, and the preview host's
spec posts every command of the editor and diff-pane lists. The DMN and Form editors
and the deployment sidebar post their own commands, and a spec fails when a
protocol command belongs to none of the lists. A host's router still
dispatches an unrouted type as a no-op, but records a type it drops on purpose
with `ignore(type, reason)`, once and with a non-blank reason. `routeOf(type)`
reports a type as handled, ignored with that reason, or unrouted, and a type is
never both handled and ignored, so a coverage spec can tell a deliberate drop
from a missing route.

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
code-link, form-reference status, definition search, script editor) and the
webview message handlers live in the core. `DeploymentFeature` and
`MarketplaceCommands` own the deployment and marketplace flows.
`BpmnEditorFeature` (`modeler/bpmn/`) builds the BPMN editor: its services, one
router from a `CommandTable` that has an entry for every type in
`BPMN_EDITOR_COMMAND_TYPES` (`WebviewMessageRouter.fromTable`), and its
participants in one order. The
cross-feature rule holds for it as for every feature, with no exempt
composition folder: navigation, definition search, code-link and the script
editor each export their handlers and participant as an `EditorContribution`
(`NavigationFeature`, `DefinitionSearchFeature`, `CodeLinkFeature`,
`ScriptEditorFeature`), and the host's composition hands them to the editor
with the deployment status participant. A feature that holds watchers or timers
has a `dispose()` the host calls on shutdown. A capability that differs between
hosts is a `BpmnEditorHostExtensions` entry, and an absent one makes the editor
ignore its commands with one reason. The three document commands
(`DOCUMENT_SYNC_COMMAND_TYPES`) form one such group: a host routes all of them
to the core's document services or the editor ignores all three, because a host
that routed `SyncDocumentCommand` without `DocumentFlushedCommand` would time
out every flush, so a save or deploy could miss the last debounced edit. A host
with its own document plumbing leaves `documentSync` out and answers the three
on its own channel. Both hosts run the feature from their
`composition/bpmnEditorFeature.ts`, so their routes and participant order are
the same, and each pins its routes in a coverage spec, a
`Record<BpmnEditorCommandType, "handled" | "ignored">`, with a row that the
document group is handled or ignored as a whole. VS Code supplies every
extension; the bridge leaves out the panel visibility.

A host supplies adapters and maps its own surface (VS Code commands and views,
bridge RPC) onto these modules. It keeps only what is genuinely host-specific:
VS Code's input UI, settings writes and reload hint; the bridge's
workspace-root registration, acknowledged marketplace persistence and
rendering on `document/didChange`, because the host owns the document revision
there. Host classes depend on the core ports, not
on concrete adapters, so the in-memory test kit fits every one of them; the VS
Code architecture test lets only the composition root and infrastructure
import a class that implements a port.

Inline scripts still open and sync their tabs per host, behind the core
`ScriptEditorPort` (`ScriptTaskService`, `BridgeScriptEditor`), because tab
handling is host API. What the webview's script commands mean is the core
`ScriptEditorFeature`'s on both: it stores the process variables the webview
extracts, writes a "Generate Script Files" batch one script at a time and names
its folder in the toast, logs a failed open with its element, resyncs after a
reload and tears an editor's scripts down on close. Both hosts read, write and
delete the script files through the core `ScriptFileStore`. It decides where a
diagram's scripts live: below the config folder of its workspace root, or in
the OS temp folder for a diagram that is not a file. A failed workspace lookup
rejects instead of moving the scripts to the temp folder, so no host writes
them somewhere the user did not configure. The store also owns the orphan
sweep, once per folder and process, and the `.gitignore`, which it writes only
when there is none. Each host passes its OS temp folder in the path spelling
its workspace port answers, because VS Code compares `uri.path` values
(`/c:/…`) where the bridge compares `C:/…`. It also passes how it spells such a
path for the user, so a message names `c:\…` and not `/c:/…`.

An editor's focus is its handle's `isActive()`, read through
`EditorSessionStore.isFocused`. The status items every editor shares (engine
version, bpmnlint, deployment) show an editor's state only if it is focused
when the item is written. A ledger write or a
[target change](deployment.md#targets-and-credentials) refreshes the
deployment item for the focused editor (`refreshFocused`), not the editor it
acted on. Each item's participant hides it on blur and close, and
`StatusItemOwnership` decides only that hide. Only BPMN sessions run these
participants, so `refreshFocused` hides the deployment item when no BPMN
editor is focused (a DMN or Form editor, or none) instead of showing an item
nothing would hide. The store's command target (`CommandTarget`, read as
`getActiveEditorId`) is the session focused last, not focus. It stays on a
diagram while a text editor or a sidebar has focus, because those are not
sessions. Only a session that opens while no session holds the target takes it
without focus. So in VS Code a diagram that resolves in a background group
never takes commands from the focused one, and a session that replaces another
under the same id in the background leaves the target where it is. When the
target's panel turns inactive, the target moves to the session that has
reported focus longest without blurring since, if any. A host focuses one
editor at a time, so focusing a session drops every other session's report,
and a target the host focused keeps the target when it blurs. Theia creates
every custom-editor panel with `active = true`, so in the standalone app a
diagram that resolves behind the focused one takes the target, and hands it
back when Theia blurs its panel. Theia does not always send that blur. It
caches each panel's view state, compares new states against that cache, and
drops an update for a panel that does not exist yet. A background tab restored
behind the focused one therefore keeps reporting `active` until the user
activates and leaves it, and `isFocused` and `getFocusedEditorId` report it
focused. Such a panel can take the target through a blur hand-off only until
the host focuses a session. Running the app with Theia 1.76 showed that stale
tab after a restart. It also showed Theia restoring a hidden tab as its active
widget and reporting that panel active, and the target follows that report
like any other activation. So after a restart, commands can still act on a
diagram the user does not see ([#1911](https://github.com/Miragon/bpmn-modeler/issues/1911)).
In VS Code only one panel is active at a time, so the target ends on the panel
VS Code activated whichever view-state event comes first, and the bridge blurs
only sessions that no longer hold the target. A
closed target goes back to the open editor that held it before, and to the
newest remaining editor only when none did, until the host reports the next
focused one. The bridge treats `session/register` as the focused tab, so
it marks the handle active before registering it, and it derives `isActive()`
from the target. On IntelliJ the two agree with each other but not always
with the selected tab: after a bridge respawn the host re-registers every
session without replaying `session/setActive`, so the session registered last
counts as focused. Theia sets a webview's `active` from
`shell.activeWidget`, so in the standalone app focusing a sidebar view such as
the deployment sidebar blurs the editor, and the shared items hide while the
sidebar has focus. VS Code keeps the panel active.

Status items are published as views, not widget calls. `StatusBarPort` has
`show(slot, view)` and `hide(slot)` for four closed slots: element templates,
engine version, BPMNlint and deployment target. A `StatusView` carries the
text, an icon, a tone, a tooltip, a click action and a `transient` flag, each
from a closed union in `kernel/domain/statusView.ts`. The kernel owns only the
slots and the view shape, so it names no feature type; each feature builds its
slot's view. A host decides where a slot goes and how an icon, a tone and an
action look, nothing more. VS Code follows its
[status-bar guideline](https://code.visualstudio.com/api/ux-guidelines/status-bar):
workspace-wide status on the left (element templates, whose loads also run for
background diagrams), the focused diagram's state on the right (engine
version, BPMNlint, deployment target). A transient view hides itself after
3 s, and a later show or hide of its slot cancels that
([`VsCodeStatusBar.spec.ts`](../../apps/vscode-plugin/src/shared/infrastructure/VsCodeStatusBar.spec.ts)).
The bridge sends a slot as one `statusBar/update {slot, view}` frame, with
`view: null` to hide it. IntelliJ follows VS Code as far as its status bar
allows: one widget per slot, the same text and tooltip, the same 3 s rule, and
the same click actions (Change Engine Version, the lint toggle over
`linting/toggle`, the deployment menu). Its status bar has no left side, so all
four widgets sit on the right in VS Code's left-to-right order. A tone colours
only the `dot` icon; the other icons are IntelliJ's own. The protocol snapshot holds
only top-level keys, so `HostUiRouterTest` pins the view fields and
`StatusSlotPlacementTest` reads `statusView.ts` and fails when a slot, icon,
tone or action has no Kotlin counterpart; at runtime the router logs and drops
what it does not know. `statusBar/update` is the only status RPC, so a new
status needs a slot, its view function and one placement per host, and no new
port method, RPC or Kotlin handler. No host builds status text of its own.

Prompts follow the same split. `PickerPort` has four methods, `choose`,
`chooseMany`, `confirm` and `searchAndChoose`, and each takes a prompt the core
builds in full, typed in `kernel/domain/prompts.ts`: an id, a title, a
placeholder and items with a label, a description or a file path, an icon from
a closed union, and the value a pick returns. A dismissal is an answer (`undefined`, `[]` or `false`), so the
caller decides whether it cancels. `confirmation()` in
`kernel/domain/affectedItems.ts` summarises a confirmation's details, and both
hosts show every line. The core also orders a file list by the path VS Code
shows for it (`fileChoicesInWorkspaceOrder` in `kernel/domain/fileChoices.ts`,
over `relativeToWorkspace`), and both hosts keep the order a prompt gives, so
they list the files alike. Only the payload files stay nearest first, as their
lookup finds them. VS Code
shows a path relative to the workspace, filters on descriptions too, draws an
icon as its codicon and reveals the busy list of a search after 150 ms. The
bridge sends a choice over the existing `picker/show` request with the path as
its description and no icon, maps the chosen indices back to values, and
brackets a search with status-bar progress, so neither the protocol nor Kotlin
changes. The test kit's `ScriptedPicker` answers a prompt by its id and fails
a test whose answer the prompt does not offer, so the prompts of one run carry
distinct ids: each engine's version prompt has its own. The new-model engine,
engine-version, migration-scope, script-language and cleanup prompts, the choice
among located files and every deployment prompt
(`deployment/domain/deploymentPrompts.ts`: the payload file, the active target,
the status-bar menu, the files to deploy, the additional files, and the
confirmations to delete a target and to approve a credential host) come from
the core. The deployment services search the workspace through
`WorkspacePort.findFiles` themselves and offer the found files through
`chooseMany`.

One prompt stays outside `PickerPort`: the template marketplace asks for a
personal access token in a masked input, which a chooser cannot show. Its port
follows the same split. `TokenPromptPort.promptForToken` takes a `TokenPrompt`
that `tokenPromptFor` (`template-marketplace/domain/tokenPrompt.ts`) builds in
full from the host and why the session asks: a refused request, worded by
`AccessDenial`, or a source the marketplace declares private. The view holds
the title `Personal Access Token for <host>`, the prompt text,
`password: true`, and the host. The session stores the answer under that host
and the test kit's `ScriptedTokenPrompt` answers by it; no host shows it. No
service writes any of this text. VS Code renders the view in an input box that
stays open while the user leaves to create the token. The bridge sends the
title and the prompt over `tokenPrompt/show`, and IntelliJ shows them in its
password dialog. Both hosts return the answer as typed, and
the core (`enteredToken`) takes a blank answer for no token, so a blank token
is never stored and no host trims.

No adapter builds prompt text. A new choice or confirmation needs a builder and
an id, and no new port method, RPC or Kotlin handler. A new kind of input, such
as the masked one, needs its own port method, RPC and Kotlin handler, as the
token prompt has.

The BPMN, DMN and Form editors synchronize their document through one core
module, `EditorDocumentSync`: own-write echo suppression, revision-checked
syncs, and a single, snapshot-checked initialization of an empty file that a
webview reload or a host edit cannot race. Each modeler service adds only its
document type (the empty content, BPMN's engine prompt, the query it posts),
and one `DocumentRenderParticipant` re-renders any of them on a host change.
Before a document is persisted, the core's `PendingEditsFlush` asks the
webview for the edits its sync debounce still holds and writes them through
the modeler service served for the file type; VS Code runs it on every save,
and both deploys of the open diagram (Deploy Diagram and the deployment
sidebar's Deploy) run it on both hosts before they save.
In the BPMN webview, a value that still waits in the properties panel's
600 ms input debounce counts as such an edit. The panel's `debounceInput`
service comes from `libs/properties-panel` and tracks its waiting calls; the
flush applies them before it exports, so the persisted file holds the value
the panel shows.
A save IntelliJ starts itself (Ctrl+S, autosave, the save on switching to
another application) flushes in the Kotlin host instead. IntelliJ announces it
with `beforeAllDocumentsSaving` on the EDT, before it reads which Documents
are unsaved, and the core's flush would end in a `document/write` that waits
for that EDT. The host asks every open page with a non-destructive flush,
waits at most 250 ms for all replies of a project together, and writes each
export whose revision still matches into its Document, which the same save
then persists. A page that answers `clean` because its sync went out while
the host waited gets that sync written the same way, since its core write
would land after the save. The page stays editable and its sync stays armed,
so the core still gets the edit; the host reports that late write as a
change, see [document causation](#document-causation-and-session-identity). A
page that does not answer in time is saved as it is. The host numbers its
flushes down from -1 and the core up from 1: the page answers both on one
channel, and every reply also reaches the core, so neither may take the
other's reply or release the other's lock. On 2026.1 (checked on 2026.1.3),
switching away saves from a background thread, but the platform still
delivers the event on the EDT through `invokeAndWait` while the saving thread
holds no lock, so the host's write cannot deadlock it.
Accepted residual: a sync the page posted before the host asked, whose core
write has not reached the EDT yet, lands after the save; a DMN
properties-panel value the panel has not passed to the modeler yet is not
flushed; and a save of one Document (`saveDocument`), which neither Ctrl+S nor
autosave makes, does not flush.
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
below it from the loopback asset server.

Every BPMN, DMN, form and deployment shell sends a Content-Security-Policy with
`default-src 'none'`, so injected markup cannot run script with the host
message channel. Each policy allows only what its bundle needs:

- `script-src` allows the entry by nonce in VS Code and by `'self'` in
  IntelliJ. The VS Code BPMN and DMN shells also list `webview.cspSource`,
  because the chunk loader's modulepreload links carry no nonce; the form and
  deployment bundles are one script each, so the nonce alone covers them. No
  `'unsafe-eval'`: nothing in the bundles compiles strings at runtime.
- `style-src` keeps `'unsafe-inline'` in every shell: diagram-js, the
  properties panel and CodeMirror set style attributes and inject `<style>`
  elements without a nonce, and the deployment form's markup carries a style
  attribute.
- In the BPMN, DMN and form shells `img-src` allows `data:`, and for BPMN also
  `https:`, because element-template icons may be either. BPMN and DMN have no
  `connect-src`, so a copy-as-PNG of a remote `.svg` icon renders without that
  icon. `font-src` allows `data:` for the embedded fonts.
- The form shell also allows what form-js components load at runtime: `https:`
  images and iframes (`frame-src`), and document previews, which fetch files
  over `connect-src https:` and show them from `blob:` URLs (`img-src blob:`,
  and `object-src blob:` for a PDF's `<embed>`).
- VS Code's deployment shell allows only its script and its styles, because the
  deployment form loads no images or fonts. IntelliJ builds its deployment
  policy from the BPMN one without `https:` images.
- `base-uri` and `form-action` are `'none'` in every shell: `default-src` does
  not cover them, and no bundle needs a `<base>` or a native form submission.

VS Code and the standalone app set the policy as a `<meta>` tag, because Theia
injects its own unnonced scripts ahead of it, and limit `localResourceRoots` to
each webview's bundle directory. IntelliJ sends it as a response header from
`WebviewServer` and allows the inline `acquireVsCodeApi` shim by its SHA-256
hash. The `#ide-theme-vars` block is computed per request and rewritten live, so
it relies on `'unsafe-inline'`. Each host builds its policies in one place,
VS Code in `webviewContentSecurityPolicy.ts` and IntelliJ in
`WebviewContentSecurityPolicy.kt`: the directives every shell shares are written
once, and a shell lists only what its bundle adds, so a shell can neither drop
nor reopen `base-uri` or `form-action` on its own. A loader for user-supplied bpmn-io
plugins must widen these policies on purpose rather than depend on a gap in
them.

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
descriptor/snapshot agreement. The IntelliJ
[handler coverage test](../../apps/intellij-plugin/src/test/kotlin/io/miragon/intellij/bpmn/bridge/ProtocolHandlerCoverageTest.kt)
reads that snapshot and registers the production `BridgeRouters`: each
core→host method needs exactly one Kotlin handler, and a handler for a method
the core no longer sends fails it. It compares method names, not parameter
keys. The snapshot is an input of the Gradle test task and of the IntelliJ CI
path filter, so a TypeScript-only protocol change runs the test.

### Process lifecycle

One project-scoped supervisor owns one bridge process, isolating failures and
teardown to the project. The stateless asset server is application-scoped.
Project startup now prewarms the bridge and JCEF when supported; process
creation also remains off the UI thread when an editor needs it directly.

On exit, the supervisor retries with backoff and limits repeated rapid crashes;
a stable run resets that budget. Recovery re-registers live sessions from the
authoritative IntelliJ Documents, replays render requests, and re-seeds
deployment state. A tab that closes while recovery builds its register frame
gets a second `session/dispose` after that frame, so the new bridge keeps no
session for it. Accepted gap: if the same file registers again inside that
window, the new bridge can end with no session for the new tab until it
reopens or the next recovery runs. Stdin EOF terminates the bridge; project
disposal and shutdown cleanup prevent orphan processes.

The replayed render re-imports the Document, and a sync the restart window
dropped never reached it. Recovery therefore first flushes each page with the
rule a tab close uses: a destructive `exportWhenEdited` flush, written into the
Document only while its revision still matches, and skipped while an external
host update is pending. A page cannot tell a dropped sync from a delivered one,
but it knows whether it was edited since it last imported a host document
(`HostDocumentRevisions`). An edited page exports even when its sync already
went out; a page nobody edited answers `clean`, so recovery never writes the
modeler's serialization over a diagram nobody touched. A Document that refuses
the write keeps its text, a page the host cannot post the flush into is
skipped, and the other pages still recover. Each reply resolves the flush whose
token it carries, so a tab close and a recovery that flush the same page at
once both get their answer. The page stays locked until a render reaches it,
or a timeout after the replay passes; only the recovery that posted the page's
last flush holds that lock. A crash
recovery with an edit to write waits for an open modal dialog to close before
it re-registers. Reload Modeler runs the same recovery against the running
bridge. This is host policy and stays in Kotlin; a shared render participant
must keep the flush before the replay.
Accepted residual: an edit in the page's import debounce after the unlock can
still be overwritten; the first render to reach the page unlocks it, so a
render already in flight or an overlapping recovery's replay can unlock it
before the last replay re-imports; and each replay clears the page's undo stack.

An asynchronous writer drains a soft-bounded outbound queue so editor and JCEF
threads never block on bridge stdin. Superseded document and host-state updates
coalesce; authoritative document updates and RPC replies remain reliable across
backpressure and writer replacement. Best-effort frames may be dropped.

The host answers every core request exactly once: with its result, or with an
error when its handler throws, also when the handler runs on the EDT
(`RpcChannel.replyFromEdt`, pinned by the
[channel tests](../../apps/intellij-plugin/src/test/kotlin/io/miragon/intellij/bpmn/bridge/RpcChannelTest.kt)).
The bridge's `Rpc.request` has no deadline. Prompts wait on the user, a document
write waits behind any open modal dialog, and a write that landed after a
timeout would leave the document mirror stale, because only its reply updates
the mirror. An unanswered request would therefore hold the core's per-editor
queue until the editor reopens.

Notifications and status indicators are native host UI backed by RPC ports.
The core writes the text of every notification, including the error balloon
that puts a `notifyError` context above the error's message
(`notifiedErrorToastText`), so the host shows that text and composes none of
its own. Secrets use IntelliJ PasswordSafe, an application-scoped store,
corresponding to VS Code SecretStorage. Target-specific credential namespacing
belongs to the [deployment record](deployment.md#targets-and-credentials).

### Host-replicated state

Synchronous core getters cannot wait for asynchronous RPC. The bridge therefore
keeps explicit local mirrors with these ownership rules:

| Mirror | Seed and updates | Writer of record |
| --- | --- | --- |
| Documents, keyed by editor | `session/register`, then `document/didChange` | Host Document; bridge writes are accepted by the host before its content becomes authoritative |
| Settings snapshot | Settings in `session/register`, then `settings/didChange` | Host only; one shared snapshot fans changes out to editors |
| Deployment state | `deploymentState/seed` with what the host stored, then `deploymentState/save` patches | Bridge snapshot during the process lifetime; host persists the patches for the next seed |

Apply settings before initial artifact discovery. Seed every synchronous mirror
before its first consumer, and re-seed on process restart; mirrors do not
survive the subprocess.

Every host reads a setting the same way, as `normalizeSettings` in the core's
[`kernel/domain/modelerSettings.ts`](../../libs/modeler-core/src/kernel/domain/modelerSettings.ts)
decides: a blank config folder, an unknown theme or mode, or a value of the
wrong type reads as the default, and at most six favourites are pinned. Its
`DEFAULT_MODELER_SETTINGS` are the defaults the VS Code manifest declares.
VS Code parses each value as it reads it. The bridge normalises the host's
snapshot before it compares it with the current one, so a value that reads as
the current one fires no change. A setting change names its settings by the
closed `SettingKey` union, the keys VS Code stores below `miragon.bpmnModeler`
(`scripting.spin`, `linting.enabled`). One table in the same file maps each
snapshot key to its `SettingKey` (`settingKeyOf`), and the union is derived
from it. Core subscribers ask `affects(key)` the same way on every host:
VS Code adds the prefix to ask its own event, and the bridge names the keys
`changedSettingKeys` reports with `settingChangeNaming`. The VS Code adapter
reads, writes and watches settings only through `modelerConfiguration.ts`,
whose keys are typed `SettingKey`; its manifest contract spec fails on a
configuration call in any other file. IntelliJ's `ModelerSettingsStore` keeps a
Kotlin copy of the normalisation, because the IDE's Settings page stores and
shows the values without the bridge.
`settingsNormalization.cases.json` beside the rule holds the rows all three
hosts run (see [test-first for rules](engineering-practices.md#test-first-for-rules));
the Kotlin test also compares its defaults with the manifest's.

The deployment state is one `DeploymentState` snapshot in the core's
[`deployment/domain/deploymentState.ts`](../../libs/modeler-core/src/deployment/domain/deploymentState.ts):
the ad-hoc connection, the active target and the freshness ledger.
`DeploymentStatePort` has two methods, a synchronous `load()` and
`save(patch)`. A `DeploymentStatePatch` names the fields it writes and the
ledger rows it puts and removes, so a deploy's connection or a prune's rows
travel as one write. The core owns the defaults and the shape:
`deploymentStateFrom` reads a missing value or one of the wrong type as the
default and drops a ledger row that is not a revision, on both hosts. Hosts
store only what a patch names: VS Code writes the patched workspace-state
keys, and IntelliJ seeds the bridge with the keys it has stored, without
defaults, and applies each patch in the one `deploymentState/save` handler.

The bridge applies a patch to its snapshot and awaits the acknowledged host
persistence. Failures reject, as they do on VS Code, but are not rolled back:
rolling back would show stale values mid-session, and the next seed reconciles
with the persisted host state. Whether a failed write fails the operation is
the core's decision, not the adapter's: an engine-accepted deploy stays
deployed (see [deployment](deployment.md#saved-target-execution)).

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

A page flush the IntelliJ host writes itself (before a save, a close or a
re-render) bypasses the core, so the bridge mirror misses that content. The
host remembers it per session, and the next accepted write of the same content
reports `changed` although the Document already holds it, so the mirror takes
it. Every accepted write and every external change forget it, and a register
forgets it before it re-seeds the mirror from the Document.

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
- Enforcing a layer rule only once no violation remains would let new ones in
  meanwhile. A known exception lets the gate start first, at the cost of a list
  that review has to keep from growing.
- A separate library for the pure rules browser code shares with the core
  would need a manifest, path aliases, a Vitest target and entries in the
  inlined-library lists, about ten config edits for a few hundred lines. The
  rules live in `modeler-types` instead, at two costs: a `feat` or `fix` there
  triggers both npm release lines (see
  [Release and publishing](release-and-publishing.md)), and the core's
  [mutation run](engineering-practices.md#mutation-testing) does not cover
  them.
- `kernel/` and `editorSession/` could be workspaces of their own, which would
  turn their direction into package dependencies. That adds manifests, path
  aliases and Vitest targets for code no consumer imports apart from the core,
  so they stay folders whose import direction the core architecture test
  enforces.
- One port method per status item or prompt let each host build the text. The
  copies drifted (labels, plurals, summaries, tooltips), and every new item
  touched both adapters, the RPC and Kotlin. Core-built views and prompts cost
  the hosts per-item freedom: a host renders only what the shared shape
  carries, so a widget-specific touch needs a field in that shape first.
- A port for `MarketplaceCache` or `DiffPaneStore` would add an interface with
  one implementation that no host or spec substitutes; the specs already run
  the real stores over the in-memory host kit. A second implementation is the
  point to extract one.
- Wiring each feature per host kept the hosts simple to read but let the copies
  drift: the bridge stopped re-linting on edits and setting changes, and did not
  isolate failing session hooks. Feature modules in the core cost a little
  indirection — a host reads its surface mapping, not the flow — in exchange for
  one place per fix.
- `BpmnEditorFeature` could import the features whose commands it routes, if a
  composition folder were exempt from the cross-feature rule. That exception
  would never shrink, so the features hand their handlers and participants to
  it as contributions instead, at the cost of one slot per contributing feature
  in `BpmnEditorContributions`.
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
