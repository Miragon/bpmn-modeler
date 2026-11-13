# BPMN modeler

- Status: accepted
- Last reviewed: 2026-11-13

## Context

`@miragon/bpmn-modeler` is the shared browser composition for embedders and IDE
webviews. A separate embeddable implementation would duplicate the feature stack and
drift. The package needs a deliberate public API, surfaces suited to different
permissions and modeling tasks, and reliable lifecycle behavior.

Single-file bundlers inline reachable dynamic imports. Optional features and
engine-neutral surfaces therefore need separable module graphs; a runtime flag alone
cannot keep their dependencies out of a consumer's bundle. Common package boundaries
are in [Architecture and hosts](architecture-and-hosts.md#package-boundaries);
element-template authoring (preview, editor, marketplaces) is in
[Element templates](element-templates.md).

Related topics: [BPMN modeler features](bpmn-modeler-features.md) (properties panel,
themes and locale, form previews, transaction boundaries, formatting),
[BPMN linting](bpmn-linting.md), [Diff](diff.md), [BPMN plugins](bpmn-plugins.md) and
the [allowance](code-allowance.md) workspace code runs under.

## Contents

- [Public API and capabilities](#public-api-and-capabilities)
- [Surfaces and modes](#surfaces-and-modes)
- [Document identity and creation](#document-identity-and-creation)
- [Mode session and lifecycle](#mode-session-and-lifecycle)
- [Consequences and enforcement](#consequences-and-enforcement)

## Decision

### Public API and capabilities

The asynchronous `createModeler(container, options)` factory, its options, handle and typed
`on*` callbacks (no generic event bus) are the supported facade. `engine` is a required
construction option; changing engines needs a new instance. Inputs such as element templates
are data, not filesystem paths. `additionalModules` and `moddleExtensions` allow deliberate
customization. Clipboard defaults to native and accepts a host bridge or disabling; theme and
locale have defaults; linting is opt-in through the [injection contract](bpmn-linting.md#linting).

Navigation, code-link, scripting and definition search are capabilities enabled by supplying
ports; without a port their UI is absent. A notification callback cannot replace a capability
that must resolve a target or answer a query. Internal DI factories are composition details.

- **Subscriptions.** `onCommandStackChanged` and `onFormatted` are handle methods returning
  their unsubscribe (#1835). They deliver plain payloads and ignore the listener's return
  value, because a value returned to the event bus stops the event for later listeners; hosts
  therefore need no event names, which are unstable internals.
- **Reference availability.** `isReferenceAvailable` is synchronous because context-pad
  construction is; hosts with asynchronous discovery keep a cache and emit
  `onReferenceAvailabilityChanged`. Without the hooks, syntactically valid references are
  available.
- **QName references.** `calledElement` is a QName, so the modeler resolves a prefixed
  reference (`child:Process_Target`) to `{ id, namespace }` before the port. An unprefixed
  reference stays literal (the default namespace would break files that declare one); the IDE
  protocol carries the URI as `referenceNamespace`.
- **Definition search** is the first query port. The entry ignores answers to superseded
  queries, so implementations need not cancel. BPMN cannot reference another file's
  definitions, so a picked result is copied into the model (or an equal one reused) in one
  undoable command. `extractModelDefinitions(xml)` is exported so host-less consumers can index
  with the scanner the IDE hosts use; it is a tag scanner, not a moddle parse, because hosts
  index whole workspaces.
- **Hidden element templates.** `setHiddenElementTemplates(refs)` keeps templates out of *new*
  choices (the chooser, the append/create/replace menus, the default template applied after a
  create) without removing them. Loading and `get`/`getLatest`/`getAll` stay unfiltered because
  the properties panel reads applied templates and their update check through them, so an
  element that uses a hidden template keeps it. The default is narrowed by replacing
  `getDefault` on the instance, a narrow upstream reach that browser specs pin for both
  engines. It is its own method because filtering `setElementTemplates` would re-validate and
  re-report every rejection. Refs are `{ id, version? }`, the identity upstream indexes by;
  when the latest version of an id is hidden the id is not offered and no older version takes
  its place. Refs live on the facade, so they outlive a new template set.
- **Surface guards.** A host that holds any of the three surfaces narrows it with the two
  published guards, `isModelerSurface` and `isEditableSurface` (root and `/mode`), never with
  its own `"member" in handle` check. One guard per handle type keeps a capability from being
  checked through different members in different hosts. They import only types, so `/mode`
  stays free of surface code.
- **Pending input.** `hasPendingInput()` and `flushPendingInput()` are public on both editable
  handles: the IDE webview's flush, the Orca plugin's save and a recreating mode switch use
  them to apply a typed value before they export.
- **Services.** `getService` has a typed overload for seven semver-covered services (`canvas`,
  `commandStack`, `elementRegistry`, `eventBus`, `modeling`, `overlays`, `selection`); other
  names are an unstable escape hatch. A raw instance would duplicate the API and expose more
  internals.

### Surfaces and modes

| Entry | Construction and contract |
| --- | --- |
| Root `createModeler` | Camunda 7/8 editor; live Design/Implement mode, default Implement |
| `/design` `createDesigner` | Editable engine-neutral bpmn-js Modeler with neutral panel, clipboard and optional navigation/definition search/lint |
| `/viewer` `createViewer` | NavigatedViewer with outline, optional readonly panel and optional navigation |
| `/mode` `createModeSession` | Surface-independent orchestration using consumer-supplied factories |

Designer and viewer handles are signature-compatible subsets of the modeler handle. The viewer
omits `modeling` and `commandStack` (resolving them throws) and its capability types expose
navigation only, because definition search edits the model. Neither surface imports the other.

**Live modes.** For an engine-tagged diagram, Design/Implement is a live `setMode` on the same
engine modeler, so its moddle, behaviors, command stack and DI graph stay intact: engine data
survives replace and copy-paste, and undo history survives. Routing that document through the
engine-neutral designer would lose extension data, runtime DI module replacement is unsupported,
and two synchronized documents would be a merge problem. The panel's mode filter owns the mode:
a change updates the filter, `data-bpmn-mode` and the in-page lint configuration, then fires
`onModeChanged`, once per actual change. Design hides engine-template popup and chooser chrome
but not token simulation; minimap, token simulation, focus and the fit button are engine-neutral
chrome on every surface.

**`/design` purity.** `/design` stays free of Camunda moddles and behaviors, element templates,
transaction boundaries and engine settings. `favouriteBpmnElements` is a designer option with a
live setter that the modeler handle carries too, so a host updates either editable surface the
same way. The viewer has no engine, clipboard, lint or `locale` option; readonly is enforced by
the absence of editing services, not by an allowlist. Viewer and designer entries import no CSS
(consumers load `viewer.css` or `design.css`), preserving scoped themes without pulling the root
editor stylesheet through the shared CSS build.

**Engine stacks.** The root modeler constructs `bpmn-js/lib/Modeler` itself and each engine stack
is data (upstream plugin modules, the engine's moddle extension, panel option defaults, popup-menu
annotation overrides). The stacks started from camunda-bpmn-js 5.36.0's composition and keep its
order, but the package no longer depends on it: its Modeler classes added popup-menu providers
across releases that the custom append menu then had to disable, and its caret ranges overlap
most of our exact pins, so Yarn Berry consumers got a second bpmn-js and diagram-js nested under
it. Upstream options and features we do not use stay unwired (`disableAdjustOrigin`/`disableGrid`,
the upstream template chooser, the create/append group providers that would regroup the flat
entries our append menu reads, C8 external resources).

**Popup-menu annotations.** The descriptions and search keywords camunda-bpmn-js used to supply are
ours ([`popupMenuAnnotations/`](../../packages/bpmn-modeler/src/popupMenuAnnotations/)): an
engine-neutral base set (`/design` loads it as is) plus per-engine overrides only where semantics
differ (service-task wording), attached by one provider; keywords are spelled as i18n dictionary
keys because the translator looks keys up verbatim. A
[coverage test](../../packages/bpmn-modeler/src/popupMenuAnnotations/popupMenuAnnotations.coverage.browser.spec.ts)
requires every bpmn-js replace action and create option to have a description on all three
surfaces and every description and keyword a translation in every locale, so a bpmn-js bump that
adds an element fails until it is described. Copying upstream's implementation would have carried
C8-only wording into about 650 lines for what diagram-js entries already support.

**Loading.** The stack loads through a dynamic import inside the already asynchronous
construction, so the factory contract is unchanged; unknown engines are rejected before any import
and a handle destroyed while its stack loads allocates nothing. The IDE webview imports every
surface factory, the diff pane and `/lint` dynamically, so View and Design opens never parse the
Camunda stack, and starts the saved mode's chunk during the initial host round-trip.

### Document identity and creation

Opening or loading an untagged diagram never stamps an execution platform:
engine-neutral documents are valid and editable in Design. Package engine detection
reads the document marker; the host's `BpmnDocument.detectEngine` also keeps its
Camunda/Zeebe namespace fallback. Strict platform detection is reserved for operations
that require an engine, such as deployment, and the host's change-engine-version action
informs and no-ops on an untagged model.

View/Design/Implement is per-editor state, not XML metadata. The initial mode resolves
from saved editor state, then the host's `miragon.bpmnModeler.defaultMode` (default
Implement), then the available engine/factory default; an untagged model falls back to
Design and cannot enter Implement. Opening a document must not rewrite it to satisfy a
viewing preference.

Explicit creation differs: engine-bound `newDiagram()` uses a package-owned template
with `modeler:executionPlatform`, `modeler:executionPlatformVersion` (`engineVersion`
verbatim, or the latest known for the engine) and `isExecutable="true"`. The version
registry lives in `modeler-types`. The template adds no exporter metadata, history TTL
or engine namespace declarations; those are host scaffold policy. Designer creation
stays neutral, and the host's new-file picker offers C7, C8 and neutral scaffolds
through `BpmnDocument.forNewModel` (neutral means `isExecutable="false"` without
engine metadata). Creating for a selected engine must produce XML that detects as that
engine after reopening.

### Mode session and lifecycle

`/mode` publishes the shared session and an optional mode strip. Consumers inject
View/Design/Implement factories and the entry imports no modeling stack. `servingSurfaces`, a
`Record<SurfaceMode, …>`, names the factory that builds each mode (on a tagged model Design runs on
the Implement modeler); available factories and the engine determine available modes. The strip is
a chip on the canvas next to the token-simulation toggle, not a permanent row above the panel: modes
switch rarely and a canvas control stays reachable while the panel is collapsed. Portable mode types,
what each mode offers (`surfaceModeSupports`) and transition planning live in `modeler-types`.

**Transitions.** Tagged Design/Implement switches toggle live. A recreate transition applies the old
surface's pending panel input, captures view state, exports XML, delivers the old surface's pending
`onContentSaved` (the destroy would drop it and the new surface's import fires no change that saves
it again), awaits `beforeDestroy` (the host flush), destroys the old surface, builds and loads the new
one and restores plane, viewport and selection. The old surface's save stays ahead of any save from
the new one, and a `ModeSession.destroy()` that waits for the switch resolves only after it.
Recreation loses instance undo and simulation state.

The session also offers what every host would otherwise rebuild on each new surface:
`onContentChanged(listener)` reports each command stack change of whichever editable surface is
live, subscribed again on every recreate and fallback, and `flushPendingInput()` applies the live
surface's pending panel input. Both are silent on the viewer and after `destroy()`.

**Re-import.** A re-import on the same instance, after a text editor, Git or an agent changed the
file, goes through `reloadDiagram(xml)`, which all three handles declare. `SurfaceView.keepAcross`
is the one home of the rule: it captures plane, viewbox and selection, loads, and applies them
again, also when the import throws after it reset the canvas. Before the first load it keeps
nothing, so the initial fit runs. The IDE webview and the Orca plugin call it instead of capturing
the view themselves. It keeps the selection; the `@miragon/modeler-api` adapter (#2008) leaves the
selection out, because restoring it commits an open label editor, so that adapter decides its own
re-import.

**Failure and teardown.** A session owns at most one live surface. A failed preparation keeps the old
surface; a failed construction or load disposes the candidate before trying a fallback; if that also
fails both errors are reported and no live surface is kept until the next request rebuilds. Busy
sessions drop concurrent switch requests. `ModeSession.destroy(): Promise<void>` is terminal and
idempotent: it awaits an in-flight transition, idle destruction tears down synchronously before the
first await, and later requests and theme changes no-op. Callers that need completed teardown must
await it.

**Surface lifecycle.** Surfaces compose lifecycle primitives instead of inheriting a base class
(`DisposableStore`, `MutableDisposable`, `subscribe` from `modeler-types`, so the restricted `/mode`
graph can reuse them; `createSurface` disposes partial construction on failure). Every surface arms
one shared initial-viewport policy on every import: it fits once the container has a size, and an
explicit `setViewport`/`applyViewState` or `centerOnElement` settles it, so the delayed fit never
overwrites restored state and hosts need no initial fit of their own. After `destroy()` every surface
throws `NoModelerError` from each member that reaches the diagram or its services, host pushes
included; `setTheme` is the one exception. Host pushes for an optional capability (lint, code-link
status, open script editors) no-op only when the surface was built without that capability, never
because it was destroyed, so a use-after-destroy bug stays visible and hosts whose pushes can race
teardown catch the error. The three facades delegate shared plumbing to an internal `SurfaceCore`
and extend one type-only `BpmnSurfaceHandle`; each still owns its store and teardown order.

**Content out.** Editable surfaces share debounced content-out (300 ms, 1000 ms max wait).
`onContentSaved({ xml })` accepts and awaits `void | Promise<void>`; export and persistence failures
are caught inside each debounced run and reported once through `onError` (or `console.error`), so
later edits still save. Destruction cancels pending work and suppresses disposal-race errors; only a
recreating mode switch delivers the pending save first. `onCommandStackChanged` reports each change
undebounced for the IDE webview's document sync. Both editable surfaces swap the panel's
`debounceInput` for the flushable one (`FlushableDebounceInputModule`, 600 ms), reached through the
public `hasPendingInput()`/`flushPendingInput()`. `flushContentSaved()` is the one capability that
stays internal: only the session needs it.

## Consequences and enforcement

The public facade, signatures and declared subpaths need compatibility discipline; IDE
protocol adaptation stays private. Optional surfaces add API and stylesheet contracts
and the readonly panel adds dependencies to `/viewer`. The properties-panel fork, layout
alpha, engine descriptors and popup-menu annotation data carry explicit maintenance
costs.

Enforced by [API conformance tests](../../packages/bpmn-modeler/src/publicApi.spec.ts),
[architecture tests](../../packages/bpmn-modeler/src/architecture.spec.ts),
[declaration checks](../../packages/bpmn-modeler/scripts/check-dts.mjs), the
[design](../../packages/bpmn-modeler/scripts/check-design-pure-entry.mjs),
[mode](../../packages/bpmn-modeler/scripts/check-mode-pure-entry.mjs) and
[plugins-free](../../packages/bpmn-modeler/scripts/check-plugins-free-entry.mjs) import
checks, the [plugin loader browser tests](../../packages/bpmn-modeler/src/plugins/loadPlugins.browser.spec.ts)
([BPMN plugins](bpmn-plugins.md)),
the [lifecycle](../../packages/bpmn-modeler/src/lifecycleContract.browser.spec.ts) and
[editable-surface](../../packages/bpmn-modeler/src/editableSurfaceContract.browser.spec.ts)
contract tests (all four surfaces; post-destroy lint pushes throw; what the command-stack
and format subscriptions deliver) and the
[session tests](../../packages/bpmn-modeler/src/modeSession/modeSession.spec.ts)
(transition failures and teardown). Test-environment limits are in
[Testing](testing.md) and upstream shape gates in
[Dependencies](dependencies.md#private-upstream-apis).
