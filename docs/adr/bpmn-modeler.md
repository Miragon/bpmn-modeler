# BPMN modeler

- Status: accepted
- Last reviewed: 2026-09-18

## Context

`@miragon/bpmn-modeler` is the shared browser composition for embedders and IDE
webviews. A separate embeddable implementation would duplicate the feature
stack and drift. The package needs a deliberate public API, surfaces suited to
different permissions and modeling tasks, and reliable lifecycle behavior.

Single-file bundlers inline reachable dynamic imports. Optional features and
engine-neutral surfaces therefore need separable module graphs; a runtime flag
alone cannot keep their dependencies out of a consumer's bundle. Common package
boundaries are defined in [Architecture and hosts](architecture-and-hosts.md#package-boundaries).

## Contents

- [Public API and capabilities](#public-api-and-capabilities)
- [Surfaces and modes](#surfaces-and-modes)
- [Document identity and creation](#document-identity-and-creation)
- [Properties panel](#properties-panel)
- [Themes and locale](#themes-and-locale)
- [Linting](#linting)
- [Diff](#diff)
- [Formatting and cleanup](#formatting-and-cleanup)
- [Mode session and lifecycle](#mode-session-and-lifecycle)
- [Consequences and enforcement](#consequences-and-enforcement)

## Decision

### Public API and capabilities

The asynchronous `createModeler(container, options)` factory, options, handle
and typed outbound callbacks are the supported facade. `engine` is a required
construction option; changing engines requires a new instance. Inputs such as
element templates are data, not filesystem paths. The properties panel is
configured with its parent container; `additionalModules` and
`moddleExtensions` allow deliberate customization.

Engine-intrinsic operations include load/export/new/SVG, viewport, selection,
templates and settings. Clipboard defaults to native behavior and accepts a
host bridge or explicit disabling. Theme and locale have built-in defaults.
Linting is explicitly opt-in through the [injection contract](#linting).

Navigation, code-link and scripting are capabilities enabled by supplying
ports. Without a port their UI is absent. Internal DI factories and forwarders
are composition details. Outbound notifications use individual `on*` callbacks,
not a generic event bus. A notification cannot replace a capability that must
resolve a target or answer a query; action ports can accept asynchronous host
implementations through `void | Promise<void>`.

The navigation port's optional `isReferenceAvailable(reference)` is synchronous
because context-pad construction is synchronous. Hosts with asynchronous
discovery maintain a cache and emit `onReferenceAvailabilityChanged`; the
modeler rebuilds an open pad and unsubscribes on destruction. Without those
hooks, syntactically valid references are available. The IDE adapter restricts
linked Forms until its workspace index provides resolvable IDs.

`getService` has a typed overload for seven semver-covered services: `canvas`,
`commandStack`, `elementRegistry`, `eventBus`, `modeling`, `overlays`, and
`selection`. Their map uses upstream documented types and can be narrowed with
`Pick`. Other names retain the generic, unstable escape hatch. A separate raw
instance or services object would duplicate this API and expose more internals.

### Surfaces and modes

| Entry | Construction and contract |
| --- | --- |
| Root `createModeler` | Camunda 7/8 editor; live Design/Implement mode, default Implement |
| `/design` `createDesigner` | Editable engine-neutral bpmn-js Modeler with neutral panel, clipboard and optional navigation/lint |
| `/viewer` `createViewer` | NavigatedViewer with outline, optional readonly panel and optional navigation |
| `/mode` `createModeSession` | Surface-independent orchestration using consumer-supplied factories |

Designer and viewer handles are signature-compatible subsets of the modeler
handle. The designer has all seven core services. The viewer omits `modeling`
and `commandStack`; attempts to resolve them throw, including when its panel
or navigation capability is enabled. Viewer navigation adds diagram-js's
context pad, not bpmn-js's editing provider. Designer and viewer capability
types expose navigation only, without importing one surface into the other.

For an engine-tagged diagram, Design/Implement is a live `setMode` on the same
engine modeler. Its moddle, behaviors, command stack and DI graph remain intact,
preserving engine data during replace/copy-paste and preserving undo history.
Routing that document through the engine-neutral designer would lose extension
data. Runtime DI module replacement is unsupported, and maintaining two
synchronized documents would introduce a merge problem.

The panel's mode filter owns the mode. Applying a change updates the filter,
`data-bpmn-mode`, the in-page lint configuration, then `onModeChanged`, once per
actual change. Design hides engine-template popup/chooser chrome. It does not
stop or hide token simulation.

Minimap, token simulation and keyboard/canvas focus are engine-neutral chrome
on every surface. The viewer uses the readonly simulation module. Simulation
survives a live toggle but not destruction/recreation of its instance.

`/design` stays free of Camunda moddles/behaviors, element templates and
transaction boundaries; it has no engine settings, engine conversion helpers,
or Camunda align-to-origin/grid/color-picker chrome. `favouriteBpmnElements` is
a direct designer option. Its optional lint module comes from the consumer.
The viewer has no engine, clipboard, lint option or `locale` option, but its
entry includes translated diff labels and optional panel dependencies. It has
no broad viewer-purity allowlist; readonly is enforced by the absence of editing
services.

Viewer and designer entries import no CSS. Consumers load `viewer.css` or
`design.css` separately, preserving scoped themes without pulling the root
editor stylesheet through the shared CSS build. Viewer panel imports bypass
the library barrel's CSS side effect. `/mode` likewise has its own `mode.css`.

### Document identity and creation

Opening or loading an untagged diagram never stamps an execution platform.
Engine-neutral documents are valid and editable in Design. Package engine
detection reads the document marker; the host's `BpmnDocument.detectEngine`
also retains its Camunda/Zeebe namespace fallback. Strict platform detection is
reserved for operations that require an engine, such as deployment. The host's
change-engine-version action informs and no-ops on an untagged model.

View/Design/Implement is per-editor state, not XML metadata. Resolve the initial
mode from saved editor state, then the host's `miragon.bpmnModeler.defaultMode`
seed, then the available engine/factory default. The host setting defaults to
Implement; an untagged model falls back to Design and cannot enter Implement.
Opening a document must not rewrite it to satisfy a viewing preference.

Explicit creation is different: engine-bound `newDiagram()` uses a
package-owned template with `modeler:executionPlatform`,
`modeler:executionPlatformVersion` and `isExecutable="true"`. The version is
`engineVersion` verbatim, or the latest known version for the engine. The
version registry lives in `modeler-types`, with the core re-exporting it.
The package template does not add exporter metadata, history TTL or engine
namespace declarations that belong to host scaffold policy.

Designer creation remains neutral. The host new-file picker offers C7, C8 and
neutral scaffolds through `BpmnDocument.forNewModel`; neutral means
`isExecutable="false"` without engine metadata. Creating for a selected engine
must produce XML that can be detected as that engine after reopening.

### Properties panel

An inlined `@miragon/bpmn-modeler-properties-panel` fork supplies the renderer,
neutral provider, mode filter and custom-group registry. The upstream renderer
and entries require editing services and do not consistently propagate disabled
state, so a disable-provider alone cannot make them viewer-safe. DI stubs would
leave enabled controls silently doing nothing; CSS disabling would also break
keyboard access and selection.

The fork preserves upstream provider/group contracts. It resolves the command
stack optionally and derives readonly from the absence of `modeling`. A final
group transform disables all entries, including nested list entries, and removes
add/remove actions, covering custom providers too. Neutral entries optionally
resolve editing services and pass disabled state to the primitives.

The mode filter runs at priority 10 after engine providers. Implement keeps
their groups; Design retains neutral and registered host-custom groups and
removes engine entries. Camunda providers replace timer and multi-instance
groups wholesale, so those groups are omitted in tagged Design; pure
engine-neutral Design retains them. Custom providers use the existing
registration contract and register their surviving group IDs separately.

The fork baseline is bpmn-js-properties-panel 5.65.0. Engine group IDs and
upstream assumptions require rechecking on dependency updates. Forked TSX uses
the properties panel's vendored Preact and production JSX runtime. Per-type
header icons are vendored as generated components reconstructed from the pinned
sourcemap; placeholder and template-driven icons remain omitted. Preserve fork
headers, `LICENSE-upstream`, package attribution and shipped
`THIRD_PARTY_NOTICES`.

Upstream support for optional editing services and disabled propagation could
remove most of the fork. The mode filter and custom-group registry can remain
ordinary providers. Private-shape enforcement belongs to
[Engineering practices](engineering-practices.md#private-upstream-apis).

### Themes and locale

Each instance's `ThemeController` sets `data-bpmn-theme="light" | "dark"` on
the canvas and panel roots. Theme always engages; `automatic` is the default.
Overlays mounted outside those roots copy the attribute onto their own root.
The host themes its page chrome through the private shared `hostTheme` adapter.
A host root theme must not be allowed to override differently themed instances.

Author dark overrides once, scoped under the attribute. The main stylesheet
combines them with the upstream light base; derive unscoped legacy light/dark
sheets by stripping that scope. Mirroring an existing `#theme-link` remains a
supported silent fallback. Removing it would break existing consumers; authoring
two independent theme sources would invite drift. The attribute/custom-property
approach also avoids depending on newer CSS color features across IDE browsers.

Locale uses the shared page-global i18n singleton, with the local extras overlay.
The designer and engine modeler register translation; the viewer has no locale
option or built-in TranslateModule, though diff labels use i18n and a host may
inject translation. Independent instance themes do not imply independent locales.

### Linting

The root and designer never import the lint stack internally, even dynamically.
Consumers import `/lint` and inject its structural `LintModule` interface:

| Option | Behavior |
| --- | --- |
| Omitted | Off; root modeler emits a one-time migration info message |
| `false` | Off, explicitly and silently |
| `{ module, config? }` | In-page linting |
| `{ module, results: "external" }` | Render host-pushed results, with `startInPageLinting` handback |

`module` is required for both enabled tiers because even external findings need
the renderer/config service. An internal fallback import would make lint bytes
reachable in single-file bundles again. Lint CSS remains in the relevant
stylesheets but hidden until configured.

Config accepts either one `BpmnlintConfig` or a `{ design?, implement? }` map.
Defaults use the modeling preset: Design omits Camunda deployability rules;
Implement includes the engine layer. A live mode change re-resolves in-page
linting. A host-provided workspace config applies unchanged in both modes;
the per-mode map is a package option and never a host wire payload. The viewer
remains lint-free. Unresolvable rules are reported through lint results instead
of failing the entire pass.

The webview owns lazy `/lint` loading and routes results to either editable
surface. The [lint-free entry check](../../packages/bpmn-modeler/scripts/check-lint-free-entry.mjs)
and source architecture tests guard the import boundary.

### Diff

`libs/bpmn-diff` owns `computeDiff(beforeXml, afterXml): Promise<DiffResult>` so
the core and browser package reuse one implementation without a library importing
a package. Public `/diff` exposes it without DOM, CSS, viewer or i18n dependencies.
The result is serializable IDs, counts and navigation order; its shape is a
semver contract, while ordering heuristics are not. Failures throw and hosts own
their error reporting. Diff vocabulary is defined in that library and re-exported
type-only where compatibility requires it.

Parse each revision separately with the C7 and C8 descriptors, remove the other
engine's extensions from each pair, then merge and deduplicate the comparisons.
Registering both descriptors together collides on `modelerTemplate` and can
silently skip XML. Unknown namespaced attributes get a textual comparison under
their nearest tracked BPMN owner; traverse containment, not references or parent
links, and preserve process-to-participant mapping. Skipped-content parser
warnings are errors. This preserves descriptor defaults for known attributes
and accepts textual semantics for custom ones, at a cost of four parses and
two comparisons. Descriptor JSON is inlined as lazy chunks; parser dependencies
remain external.

Browser rendering lives on `/viewer`: `DiffViewer`, `DiffLegend`,
`DiffNavigator`, `DiffPaneCoordinator`, and related types. Root re-exports
remain deprecated compatibility aliases. `DiffNavigator` owns stepping for both
in-page coordination and host-relayed panes. The coordinator synchronizes
in-page viewport/cursor state; the private host protocol handles separate
webviews. Legends accept presentation props rather than host-origin vocabulary.

The [Node import check](../../packages/bpmn-modeler/scripts/check-diff-node.mjs)
and [data-library tests](../../libs/bpmn-diff/src) guard the data/browser split.

### Formatting and cleanup

Wrap exactly pinned `bpmn-auto-layout` 2.0.0-alpha.2 behind a `LayoutEngine`
port returning geometry. The adapter accepts XML input but returns shape bounds
and waypoints, never replacement XML. The engine rebuilds DI from scratch;
applying only returned geometry preserves elements it omits and avoids resetting
the command stack through `importXML`.

Apply via `modeling.*` calls nested in one `layout.apply` handler's
`preExecute`, giving one undo entry. Suppress child-recursive moves, automatic
connection layout, attachment movement on resize and adaptive label positioning
that would otherwise modify the planned geometry a second time.

Own the refusal/outcome taxonomy: unsupported surfaces and empty diagrams are
refused, engine/export errors are `ENGINE_FAILED`, application exceptions are
`APPLY_FAILED`, and intervening edits/import/clear/destroy are `DIAGRAM_CHANGED`.
Capture the document revision before asynchronous export and verify it after
export and layout; relative deltas cannot safely apply to a changed diagram.
Concurrent format requests join the same run. Drilling into a subprocess is not
a refusal: the registry still contains the complete diagram.

`format()` resolves an outcome rather than rejecting; `layout.formatted` reports
it through one path for palette, keyboard and host triggers. Preflight, engine
and stale-result failures apply nothing. The implementation reports an applier
exception as `APPLY_FAILED`; it does not establish a separate rollback contract.

Cleanup is a separate, confirmed operation with an explicit failed outcome.
Recompute findings before applying them after confirmation. Determine
reachability and references from moddle descriptors, including collection
references, rather than a hand-maintained property list that could mark valid
elements for deletion. Formatting changes DI; cleanup deliberately changes the
model. Lane membership after formatting is test-enforced, though reference
ordering may create harmless XML diff noise.

Publish service and UI module factories separately, with a combined default,
so hosts can supply their own controls. There is no format-on-save or spacing
configuration: a full relayout must be explicit and the pinned engine exposes
no options. Formatting/cleanup remain outside `StableModelerSurface`.
Choosing the semantic alpha over the older grid engine enables pools, lanes,
artifacts and labels; a custom layout engine would cost substantial work, while
elkjs adds a large generic engine without BPMN semantics. The port contains the
alpha dependency and permits a later replacement or worker adapter. The current
adapter adds an XML parse and layout work on the webview's main thread; large
diagrams may make that cost visible.

The [real-model integration suite](../../libs/bpmn-layout/src/apply/integration.spec.ts)
checks semantic preservation and undo. Its headless DOM uses actual matrix
arithmetic and positive text metrics rather than inert layout stubs.

### Mode session and lifecycle

`/mode` publishes the shared session and optional mode strip. Consumers inject
View/Design/Implement factories; the entry imports no modeling stack. Available
factories and engine determine available modes. A single mode needs no buttons;
hosts can show the full strip with unavailable Implement disabled for neutral
documents. Portable mode types and transition planning live in `modeler-types`.
Mode-strip translation keys remain on the i18n overlay's source-only allowlist
because hosts can render the strip before a surface exists for harvesting.

Tagged Design/Implement switches toggle live. Recreate transitions capture view
state, export XML, await `beforeDestroy` (host flush), destroy the old surface,
construct/load the new one and restore plane, viewport and selection. Bind
recreated surfaces before loading carried XML; initial host binding retains
first-open fit behavior. Recreation loses instance undo and simulation state.

A session owns at most one live surface. Failed preparation retains the old
surface; failed construction/load disposes the candidate before trying a
fallback. If fallback also fails, report both errors and retain no live surface
until the next request rebuilds; `getHandle()` can then return the last destroyed
handle. Busy sessions drop concurrent switch requests.

`ModeSession.destroy(): Promise<void>` is terminal and idempotent. It awaits an
in-flight transaction and disposes the surface it owns, preventing resurrection
or double destruction. Idle destruction tears down synchronously before the
first await. Later requests/theme changes no-op and callbacks are suppressed.
Callers requiring completed teardown must await it; external interface
implementers must honor its promise-returning signature.

Surfaces compose lifecycle primitives instead of inheriting a base class:
published `DisposableStore`, `MutableDisposable` and `subscribe` support
idempotent LIFO cleanup; internal `createSurface` disposes partial construction
on failure. A shared initial-viewport policy prevents delayed fit from
overwriting restored state. These primitives live in `modeler-types` so the
restricted `/mode` graph and inlined feature libraries can reuse them.
Post-destroy DiffViewer operations throw `NoModelerError`.

Editable surfaces share debounced content-out (300 ms, 1000 ms max wait).
`onContentSaved({ xml })` accepts and awaits `void | Promise<void>`. Catch
export/persistence failures inside each debounced run and report once through
`onError`, or `console.error` if unset, rather than rejecting every queued
caller. Later edits still save. Destruction cancels pending work, settles its
callers and suppresses disposal-race errors. Raw `commandStack.changed` remains
available to consumers that need it.

## Consequences and enforcement

The public facade, signatures and declared subpaths require compatibility
discipline; IDE protocol adaptation stays private. Optional surfaces add API
and stylesheet contracts, and the readonly panel adds dependencies to `/viewer`.
The fork, layout alpha and engine descriptors carry explicit maintenance costs.

Use [API conformance tests](../../packages/bpmn-modeler/src/publicApi.spec.ts),
[architecture tests](../../packages/bpmn-modeler/src/architecture.spec.ts),
[declaration checks](../../packages/bpmn-modeler/scripts/check-dts.mjs), and
the [design](../../packages/bpmn-modeler/scripts/check-design-pure-entry.mjs)
and [mode](../../packages/bpmn-modeler/scripts/check-mode-pure-entry.mjs) import
checks. [Lifecycle browser tests](../../packages/bpmn-modeler/src/lifecycleContract.browser.spec.ts)
exercise all four surfaces;
[session tests](../../packages/bpmn-modeler/src/modeSession/modeSession.spec.ts)
cover transition failures and teardown. The test-environment limits and upstream
shape gates are recorded in [Engineering practices](engineering-practices.md).
