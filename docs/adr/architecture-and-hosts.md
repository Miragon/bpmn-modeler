# Architecture and hosts

- Status: accepted
- Last reviewed: 2026-11-14

## Context

The same modeling features serve embeddable browser consumers, VS Code,
Theia/Electron, IntelliJ and Orca. Sharing them takes separate boundaries for
browser composition, host-independent services, host facilities and private webview
messages. Otherwise each host duplicates modeling logic or depends on another host's
internals.

Related topics: [role folders](role-folders.md) (folder convention),
[webview protocol and sync](webview-protocol-and-sync.md) (the host/webview seam),
[IntelliJ bridge](intellij-bridge.md) (out-of-process runtime) and
[architecture enforcement](architecture-enforcement.md) (the checks behind these
rules).

## Contents

- [Package boundaries](#package-boundaries)
- [Host integrations](#host-integrations)
- [Shared host caches](#shared-host-caches)
- [Alternatives and consequences](#alternatives-and-consequences)

## Decision

### Package boundaries

Applications consume packages and libraries; packages consume reusable libraries;
libraries import neither applications nor modeler packages.

| Layer | Responsibility |
| --- | --- |
| `packages/bpmn-modeler`, `packages/dmn-modeler` | Published, host-free browser composition and deliberately designed factory/handle APIs |
| Private feature libraries in `libs/` | Reusable behavior, inlined into published packages where needed |
| `libs/modeler-types` | Public, host-agnostic concepts and browser utilities suitable for publication, and pure rules browser code shares with the core |
| `libs/shared` | Private Query/Command protocol, host channel, document-flush plumbing and webview chrome |
| `libs/modeler-core` | Host-independent domain/service layers and shared editor, routing and diff registries |
| Host applications and webview bootstraps | Concrete adapters, composition, transport, editor lifecycle and page integration |

**Public contract.** The public browser contract is the factory/handle API, not
Query/Command or host DI wiring. Published browser code cannot import `modeler-core` or
`shared`. Private browser libraries are inlined; the upstream bpmn-io stacks stay
declared npm dependencies so consumer plugins share their instances (upstream watermark
and license notices still bind: document them in the package README). Do not publish
each private library as an independently versioned API.

**`modeler-types`.** A module belongs here only if it is free of the private protocol
and is either a surface worth publishing (portable mode types, disposable primitives,
engine versions, canvas utilities) or a pure rule that both browser code and the core
apply (script-surface addressing, the XML comment/CDATA scan, process-variable
extraction, element-template folder rules). Browser code cannot import the core, whose
barrel exports Node-only modules, so such a rule has no other common home. A rule only
the core applies stays in the core's `domain/`. The package is private and inlined, and
its modules have no top-level side effects so a bundle that does not use one leaves it
out. `libs/shared` also holds the editor page chrome and the VS Code body-class theme
adapter, deliberately mixing private browser chrome with the protocol to avoid a
workspace for a few helpers. `mountPanelChrome` builds the canvas, the divider and the
properties panel into an empty root, and every editor page mounts it (the BPMN and DMN
webviews and the Orca editors), so host shells ship only an empty `#app` and the modeler
packages' stylesheets do not lay out the page.

A public type that references a declaration in a private library publishes that
declaration too, even unnamed. A consumer cannot import it, but editing it changes the
published types of `@miragon/bpmn-modeler` or `@miragon/dmn-modeler` with no change in
their sources. `check-dts` scans the roll-up for protocol symbols, private-lib imports
and ambient functions with a body but does not notice a *changed* declaration, and
`publicApi.spec.ts` pins only the names it lists, so pin a new public-type dependency
there.

**`modeler-core`** owns domain/services, the editor-session core (`EditorSessionStore`,
`WebviewMessageRouter`, `EditorSessionLifecycle`) and `DiffPaneStore`. Hosts import its
public entrypoint and supply capability ports and editor/diff handles. It is VS
Code-free and no core file reaches a host module (`node:*`, `fs`, `http`), directly or
transitively; portable Node utilities such as `path` stay valid.

**Core contexts.** Each feature folder (`modeler/<editor>` for the editors) is a context
with the [role folders](role-folders.md) it needs. Two contexts are shared; the others
reach each other only through them, composition included, and a context's `domain/`
imports only its own `domain/` and that of the shared two.

- `kernel/` is the vocabulary several features build on (`BpmnDocument`, engine
  versions, workspace path and config-folder rules, cross-cutting errors, the host
  ports in `kernel/port/hostPorts.ts`, the HTTP contract). It imports no other folder,
  and a service joins `kernel/service/` only when at least two features use it.
- `editorSession/` is the application core every editor runs on (store, lifecycle,
  router, document sync, flush, render participant, session events). `EditorHandle` is a
  port the host implements, and the only port for an editor's document:
  `EditorSessionDocuments` routes an editor id to its handle, so it is a service every
  host wires, not a port with an adapter per host. `EditorSessionParticipant` stays in
  its `domain/` as an in-core extension point. It imports only `kernel/`. The store also
  owns who holds each status slot: a writer claims the slot for one exact session, so a
  late blur or close of another editor, or of a same-URI predecessor, cannot hide the
  newly focused editor's item, and no host wires an owner.
- A context that lists what other contexts own (`addOns/`, the catalog behind the
  [Add-ons view](add-ons.md#catalog)) declares structural ports in its own `port/` and
  leaves the rules with the owners; their inventories import nothing of it and host
  compositions wire them. Shared values live in `kernel/domain/`.
- A port file holds only types ([rule 10](role-folders.md#roles-and-rules)); the value
  types, errors and pure functions it names stay in `domain/`. A port, prompt or error one feature owns lives in that feature, so
  `kernel/` names no feature. A store that holds application state and reaches the host
  only through ports (`MarketplaceCache`, `DiffPaneStore`, `DiffSession`) lives in
  `service/` with no port of its own.
- The core architecture test lists no exception today; a new one names the issue that
  removes it and the test fails when it is no longer needed, so the lists only shrink.

The core/host seam and the host/webview seam are distinct. The core reaches documents,
settings, notifications, pickers, secrets and other host facilities through ports and
sends private Query/Command messages through `EditorHandle.postMessage`; the host
adapter delivers them to the webview.

### Host integrations

**Hosts.** VS Code runs the core in-process. The standalone app loads that extension in
Theia/Electron and adds shell behavior through `libs/standalone-extension`. IntelliJ runs
the core out of process ([bridge](intellij-bridge.md)) and renders its BPMN editor in
JCEF; it has no DMN or Forms parity and no element-template builder. Camunda Forms are
edited inside the VS Code extension ([Form editor](form-editor.md)).

[Orca](https://www.onorca.dev) hosts the two npm packages *without* the core. Its
sandboxed frames have no worker, network or file access, and a webview needs the host
protocol and the Node core, which a frame cannot run, so `apps/orca-plugin` composes
`@miragon/bpmn-modeler` and `@miragon/dmn-modeler` directly for seeing what an agent
writes and light modeling. Every capability port stays empty (no code links, navigation,
definition search, form preview, scripting, workspace templates or deployment). Orca's
document session is the document authority:
[`syncDocument`](../../apps/orca-plugin/src/service/documentSync.ts) serializes imports,
sends an edit's export only while no newer import replaced its source and applies pending
panel input on Orca's `editor.flush` before a save. A read-only tab gets the BPMN viewer
only; the DMN modeler has no read-only mode, so its frame is inert.

**One feature, built once in the core.** A feature both hosts offer is built from ports in
the core, never wired per host. Per-host wiring kept hosts simple to read but let copies
drift (the bridge stopped re-linting on edits and setting changes and did not isolate
failing session hooks); the price is indirection.

- `EditorSessionLifecycle` routes webview messages in document order, tracks focus and
  runs each `EditorSessionParticipant` in isolation, so one failing participant skips
  neither the others nor their teardown. Participants see focus, document, setting,
  re-seed and dispose events, never a host panel. A hidden editor is no failure:
  `postUnlessHidden` holds back what a webview asks for and reports `"hidden"` for what
  must be replayed.
- A `*Feature` module (`BpmnEditorFeature`, `ElementTemplateEditorFeature`,
  `DeploymentFeature`, …) builds a context's services, one router from a `CommandTable`
  with an entry for every type of the surface's command list, and its participants in
  one order. Features that contribute to the editor (navigation, definition search,
  code-link, script editor) export an `EditorContribution` that the host composition
  hands over; importing them would need a composition exception that never shrinks.
- A capability that differs per host is a `BpmnEditorHostExtensions` entry; an absent one
  makes the editor ignore its commands with one stated reason. The three document
  commands (`DOCUMENT_SYNC_COMMAND_TYPES`) are routed or ignored as a group, since
  routing `SyncDocumentCommand` without `DocumentFlushedCommand` would time out every
  flush. Each host pins its routes in a surface coverage spec.
- A host keeps only what is genuinely host-specific: the layout of prompts the core builds,
  its own stores, VS Code's reload hint, the bridge's workspace-root registration and
  rendering on `document/didChange`. Host classes depend on core ports, never concrete
  adapters, so the in-memory test kit fits every host. Inbound adapters never import
  outbound ones (they get a port, factory or value from the composition root). A context of
  the VS Code host reaches another only through `shared/`.
- Once a second adapter meets a port the core reads back from, the port has one
  contract suite in the test kit that every adapter runs, the in-memory fake included
  ([testing](testing.md#test-environments)). A render-only port and a strategy the core
  chooses between need none.
- Only tab handling is host API for inline scripts, so the host's `ScriptEditorPort` holds
  tab operations and host events and nothing else. Which scripts have a tab, which file a
  script gets, streaming a tab's edits into the model and what the webview's script
  commands mean are the core's (`ScriptTabService`, `ScriptEditorFeature`) on both hosts.
  An edit still waiting to stream when its editor closes is dropped on both. `ScriptFileStore` decides where
  a diagram's scripts live (below its workspace root's config folder, or the OS temp
  folder for a diagram that is not a file); a failed workspace lookup rejects instead of
  moving scripts somewhere the user did not configure.
- The element ID review ([IDs from names](bpmn-modeler-features.md#ids-from-names)) is drawn
  natively by each host from a view the core builds: VS Code's Panel area holds an Element IDs
  tab, a checkbox tree beside Problems and Output, and IntelliJ an Element IDs tool window. The
  core's `ElementIdsService` keeps the review's state behind `ElementIdReviewPort`; the webview
  lists the rows (`ElementIdProposalsQuery` → `ElementIdProposalsCommand`) after every change,
  host import and mode switch and applies them (`ApplyElementIdsQuery` →
  `ElementIdsAppliedCommand`), and IntelliJ reaches the port over `elementIdReview/*`. VS Code
  wires the port only from 1.80, by `vscode.version`: 1.76 to 1.79 export the checkbox API only
  as a proposal, which fails the activation, so an older VS Code hides the command behind
  `bpmn-modeler.elementIdReviewAvailable` and keeps Generate from name.

**The core builds every user-visible text; a host renders it.** Hosts that word their own
text drift (engine-version label, add-marketplace dialog title, "Saved in …" hints), so
status items and prompts are typed values the core builds in full and no adapter builds
text. Two kinds of text belong to the host: its chrome (VS Code's "Reload Window") and
messages about its own failure (the bridge process dying, a failed compare view). The
`host-text` fitness function reports host-written text. The cost is that a widget-specific
touch needs a field in the shared shape first.

- *Status.* `StatusBarPort.show(slot, view)`/`hide(slot)` serve four closed slots (element
  templates, engine version, BPMNlint, deployment target); a `StatusView` (text, icon,
  tone, tooltip, click action, `transient`) is built from closed unions in
  `kernel/domain/statusView.ts`, and the kernel names no feature. A host decides placement
  and look only (VS Code: workspace-wide status left, the focused diagram's right;
  IntelliJ has no left side). A new status needs a slot, a view function and a placement
  per host, no new port method, RPC or Kotlin handler; `StatusSlotPlacementTest` fails
  when Kotlin lacks a slot, icon, tone or action.
- *Prompts.* `PickerPort` has `choose`, `chooseMany`, `confirm` and `searchAndChoose`, each
  taking a prompt the core builds (`kernel/domain/prompts.ts`). A dismissal is an answer
  (`undefined`, `[]`, `false`) and the caller decides whether it cancels. The core orders
  file lists. IntelliJ shows `chooseMany` as a checkbox dialog, not a list popup, because a
  plain click chooses a popup row at once and one stray click would remove a marketplace
  or deploy a file. Test prompts of one run carry distinct ids (`ScriptedPicker` answers by
  id). A new choice needs a builder and an id; a new *kind* of input (the masked token,
  the marketplace's free-text location) needs its own port method, RPC and Kotlin handler.
  The engine-version, new-file and modeler-language prompts are core builders too, so both
  hosts show the same title, choices and order.
- *Kotlin copies.* IntelliJ shows its New BPMN/DMN Model dialog without a bridge session,
  because starting the bridge only to fetch static text would cost a process start before
  the dialog opens. It therefore keeps those texts in Kotlin, and a test holds each copy to
  the core's source ([testing](testing.md#test-first-for-rules)). The same holds for the
  untyped-variable label of the script completion.
- *Language.* The modeler-language command writes through `LanguagePreferencePort`, which
  sets only the selected locale and leaves `SettingsPort` read-only. Neither host changes a
  settings mirror optimistically: the host stores, pushes the settings and then
  acknowledges.
- *Notices with actions.* `ActionNotifierPort.offer(notice)` takes a core-built
  `ActionNotice` (id, tone, message, actions with their returned values) and returns the
  chosen value or `undefined`. `NotifierPort` only shows text and a picker is too heavy for
  a yes-or-later question.
- *Settings.* Every host reads a setting the same way, `normalizeSettings` in
  `kernel/domain/modelerSettings.ts` (blank config folder, unknown theme or mode or wrong
  type reads as the default). `SettingKey` is closed and VS Code reads, writes and watches
  settings only through `modelerConfiguration.ts`. IntelliJ keeps a Kotlin copy because its
  settings page works without the bridge, pinned by `settingsNormalization.cases.json`
  ([testing](testing.md#test-first-for-rules)). Settings use the `miragon.bpmnModeler`
  namespace.

**Workspace listings.** The core decides which folders a listing leaves out
(`excludedDirsGlob`: `EXCLUDED_DIRS` plus every dot-folder) and passes the exclude to the
host's `findFiles`. Filtering afterwards made every host read `node_modules` first (206–273
ms per listing on this repository against 3–5 ms for a pruned walk); the cost is a stricter
port contract, which the workspace contract suite checks for every adapter. VS Code hands
the glob to ripgrep, the bridge prunes while walking (before following a symlink), and both
follow symlinked folders. Dot-folders are left out everywhere because nothing listed needs
a file in one (templates, targets, payloads and code-link maps are read by path). The
bridge's recursive watch also skips VCS, build and IDE state folders to stay within the OS
watch budget but keeps other dot-folders, since the config-folder watchers need them.
Pickers offer every match: a cap cut the list in each host before the core sorted it.

**The Add-ons view** and its catalog are in [Add-ons](add-ons.md), workspace code and its
approval in [Workspace code allowance](code-allowance.md).

The host/webview seam (the private protocol and its closed command lists, document sync and flush, the
webview bundle and its CSP) is in [Webview protocol and sync](webview-protocol-and-sync.md).

**Editor focus and command target.** An editor's focus is its handle's `isActive()`; status
items show an editor's state only while it is focused. The store's command target is the
session focused *last*, not focus: it stays on a diagram while a text editor or sidebar has
focus, a background session does not take it from the holder, and a closed target returns
to the editor that held it before. The VS Code handle counts a panel active only while also
visible. Theia restores hidden tabs as active and caches view state, so after a restart a
hidden diagram can keep the target until the user focuses a diagram (pinned as an expected
failure in `VsCodeEditorHandle.spec.ts`, tracked in #1972).

### Shared host caches

A host process serves every open editor, so work whose result does not depend on the editor
is cached in the core service all editors of the process share; hosts only wire lifecycle
events into it. Each entry has an owner that keeps it valid (a version key that changes with
its input, or a live watcher of an open editor), is released with its last editor, and a
cached result must equal an uncached run.

- *Element templates* (`BpmnElementTemplatesService`): parsed templates per template
  directory plus the marketplace cache. Existing directories are probed per request so a new
  `element-templates` folder is found. Accepted cost: another window's marketplace update is
  not seen while this process's editors stay open.
- *BPMN plugin copies* (`PluginCache`): a content-addressed folder shared by every process
  of the host, owned by last use, not by the approval list
  ([serving and the cache](bpmn-plugins.md#serving-and-the-cache)).
- *Escalated lint setup* (`NodeBpmnLinter`): moddle, extensions and resolved rules per
  `.bpmnlintrc`, keyed by config content and the rule package rows, and rebuilt when an
  admitted package's manifest stamps differently
  ([rule packages](bpmn-linting.md#updates-without-a-reload)); every run still builds its
  own `Linter`.
  Unresolved rules are not kept, so installing a package takes effect on the next run.
  Accepted cost: a workspace plugin installed mid-session that shadows a bundled rule takes
  effect only after the config changes or the host restarts.
- *Code-link source index* (`SourceIndex`): per workspace-folder set, each file's bean ids
  and short literals, kept current by one `**/*` watcher per folder and held to the content
  matchers by a fuzz spec. Accepted costs: facts stay in memory while an editor of the
  folders is open (files over 1 MB are not kept), and changes the watchers miss (for example
  under `files.watcherExclude`) show only after the last such editor closes.

## Alternatives and consequences

- Leaving the core inside the VS Code plugin would couple other hosts to plugin internals or
  force them to duplicate session logic.
- A separate library for the pure rules browser code shares with the core would need a
  manifest, path aliases, a Vitest target and inlined-library entries (about ten config
  edits for a few hundred lines). They live in `modeler-types` instead, at two costs: a
  `feat` or `fix` there triggers both npm release lines ([release](release-and-publishing.md)),
  and the core's [mutation run](testing.md#mutation-testing) does not cover them.
- `kernel/` and `editorSession/` as workspaces would turn their direction into package
  dependencies at the price of manifests, aliases and Vitest targets for code only the core
  imports; they stay folders whose import direction the core architecture test enforces.
- A port for `MarketplaceCache` or `DiffPaneStore` would add an interface with one
  implementation no host or spec substitutes; a second implementation is the point to extract.
- Enforcing a layer rule only once no violation remains would let new ones in meanwhile; a
  known exception lets the gate start first, at the cost of a list review must keep from
  growing.
- Package semver and shared-dependency alignment are real maintenance costs; see
  [Release and publishing](release-and-publishing.md) and [Dependencies](dependencies.md).
