# BPMN modeler

- Status: accepted
- Last reviewed: 2026-11-10

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
- [Linked form previews](#linked-form-previews)
- [Surfaces and modes](#surfaces-and-modes)
- [Document identity and creation](#document-identity-and-creation)
- [Properties panel](#properties-panel)
- [Element template preview](#element-template-preview)
- [Themes and locale](#themes-and-locale)
- [Linting](#linting)
- [User-supplied plugins (proposed)](#user-supplied-plugins-proposed)
  - [Workspace rule packages](#workspace-rule-packages)
- [Transaction boundaries](#transaction-boundaries)
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

Navigation, code-link, scripting and definition search are capabilities
enabled by supplying ports. Without a port their UI is absent. Internal DI factories and forwarders
are composition details. Outbound notifications use individual `on*` callbacks,
not a generic event bus. A notification cannot replace a capability that must
resolve a target or answer a query; action ports can accept asynchronous host
implementations through `void | Promise<void>`.

The editable handles also take two subscriptions, `onCommandStackChanged` and
`onFormatted`, each returning its unsubscribe function. They are handle methods
rather than `on*` options because #1835 specifies them that way, matching the
existing handle method `viewport.onViewportChanged`. `onFormatted` delivers a
plain payload instead of the diagram-js event, `onCommandStackChanged` none at
all, and both ignore the listener's return value: a value returned to the event
bus stops the event before later listeners see it. Subscribing after `destroy()`
throws `NoModelerError`, as every other member does. Hosts therefore need no event names (`commandStack.changed`,
`layout.formatted`), which stay unstable internals.

The navigation port's optional `isReferenceAvailable(reference)` is synchronous
because context-pad construction is synchronous. Hosts with asynchronous
discovery maintain a cache and emit `onReferenceAvailabilityChanged`; the
modeler rebuilds an open pad and unsubscribes on destruction. Without those
hooks, syntactically valid references are available. The IDE adapter restricts
linked Forms until its workspace index provides resolvable IDs.

BPMN types `calledElement` as a QName, so the modeler resolves a prefixed
reference before it reaches the port: `child:Process_Target` becomes
`{ id: "Process_Target", namespace: <URI bound to child> }`. Process IDs never
contain a colon, so this holds in every mode. An unprefixed reference stays
literal rather than taking the default namespace, which would break references
in files that declare one; an unbound prefix keeps only its local part. The IDE
protocol carries the URI as the optional `referenceNamespace`, and the host only
accepts a model whose `targetNamespace` matches it.

The definition-search port is the first query port: `search({ kind, text })`
returns a `Promise` of messages, signals, errors or escalations from other
models. The entry ignores answers to superseded queries, so implementations
need not cancel. BPMN cannot reference another file's definitions, so picking
a result copies the definition into the current model, or reuses one with the
same name and code, in one undoable command. The package also exports
`extractModelDefinitions(xml)`, so host-less consumers can build their own index
with the same tag scanner the IDE hosts use. It is a scanner rather than a
moddle parse because hosts index whole workspaces.

`setHiddenElementTemplates(refs)` keeps templates out of new choices without
removing them. The filter sits at the four points that offer a template: the
chooser, the append, create and replace menus of create-append-anything, and
the default template upstream applies after every shape and connection create.
Loading is not filtered, and neither are `get`, `getLatest` and `getAll`: the
properties panel reads applied templates and their update check through them,
so an element that uses a hidden template keeps it. Its own replace menu still
lists that template while it is the latest version of its id: on C8, re-applying
it from there is the only way to pick another of its presets. The default is
narrowed by replacing `getDefault` on the `elementTemplates` instance, a narrow
reach into upstream that browser specs pin for both engines. It is a method of its own
rather than a filtered `setElementTemplates` call, because a new template set
re-validates every template and reports the rejections again. Refs are
`{ id, version? }`, the identity upstream indexes templates by, so the page
cannot tell two loaded copies of one ref apart; the host decides which refs to
hide. When the latest version of an id is hidden, the id is not offered, and no
older version takes its place. The panel's update prompt may still suggest a
hidden newer version. The refs live on the facade, so they outlive a new
template set and a re-init.

`getService` has a typed overload for seven semver-covered services: `canvas`,
`commandStack`, `elementRegistry`, `eventBus`, `modeling`, `overlays`, and
`selection`. Their map uses upstream documented types and can be narrowed with
`Pick`. Other names retain the generic, unstable escape hatch. A separate raw
instance or services object would duplicate this API and expose more internals.

### Linked form previews

**Context.** Task selection needs an adjacent automatic preview, lightweight
feedback for unresolved references, and dismissal followed by an icon to reopen
available forms. Embedders must not acquire the IDE protocol or form-js dependency.

**Decision.** Expose only the optional, protocol-free anchored `formPreview`
capability. The modeler owns selection/dismissal; the webview alone owns form-js
and accessible nonmodal chrome. Both hosts reuse core saved-file resolution and
read fresh saved bytes on open/refresh, never unsaved editor state. Unsupported
components are rejected rather than widening CSP; form actions are blocked.
The optional availability-known hook distinguishes a pending index from an empty
one; an unavailable preview request renders status only, without reading a file.

Optional policy hooks on `FormPreviewPort` let hosts disable automatic behavior
without removing the capability or manual preview. Omitted hooks preserve
backward compatibility. The shared default lives in publishable `modeler-types`,
so browser consumers do not depend on core or IDE protocol code. Persistence
follows [host settings ownership](architecture-and-hosts.md#host-replicated-state).
Automatic policy changes preserve explicit previews and deliberate dismissal;
closing a handle invalidates late asynchronous results. The webview retains the
latest policy across surface rebuilds, outside surface-specific settings.

**Consequences.** Place the preview directly right of the selected task and its
context pad, clamped to the canvas viewport. Stable task association takes priority
over avoiding obstruction: overlap with diagram elements is accepted rather than
searching alternate locations. Bounded dimensions and scrolling keep content and
close controls reachable in narrow viewports. Users can opt out of automatic
previews without losing manual preview or saved-form navigation.
Saved-byte resolution avoids coupling to open form editors at the cost of not
reflecting unsaved changes. The index cannot distinguish missing from malformed
JSON, so lightweight feedback names both without another scan. Explicit attempts
retain retryable feedback rather than inheriting automatic failure handling.
The optional port keeps form-js and IDE transport out of embedders. Enforcement
lives in the [service](../../libs/modeler-core/src/navigation/service/FormPreviewService.spec.ts),
[reducer](../../libs/model-navigation/src/formPreviewState.spec.ts),
[webview](../../apps/bpmn-webview/src/adapter/out/formPreview.spec.ts) and
[browser](../../packages/bpmn-modeler/src/formPreview.browser.spec.ts) tests.

### Surfaces and modes

| Entry | Construction and contract |
| --- | --- |
| Root `createModeler` | Camunda 7/8 editor; live Design/Implement mode, default Implement |
| `/design` `createDesigner` | Editable engine-neutral bpmn-js Modeler with neutral panel, clipboard and optional navigation/definition search/lint |
| `/viewer` `createViewer` | NavigatedViewer with outline, optional readonly panel and optional navigation |
| `/mode` `createModeSession` | Surface-independent orchestration using consumer-supplied factories |

Designer and viewer handles are signature-compatible subsets of the modeler
handle. The designer has all seven core services. The viewer omits `modeling`
and `commandStack`; attempts to resolve them throw, including when its panel
or navigation capability is enabled. Viewer navigation adds diagram-js's
context pad, not bpmn-js's editing provider. Designer capability types expose
the engine-neutral ports, navigation and definition search; viewer capability
types expose navigation only, because definition search edits the model. Neither
surface imports the other.

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

Minimap, token simulation, keyboard/canvas focus and the fit button are
engine-neutral chrome on every surface. The viewer uses the readonly simulation
module. Simulation survives a live toggle but not destruction/recreation of its
instance.

`/design` stays free of Camunda moddles/behaviors, element templates and
transaction boundaries; it has no engine settings, engine conversion helpers,
or Camunda align-to-origin/grid/color-picker chrome. `favouriteBpmnElements` is
a direct designer option with a live `setFavouriteBpmnElements` setter. The
modeler handle carries the same setter beside `setSettings`, sharing its
favourites path, so a host updates either editable surface the same way and the
modeler handle still narrows to the designer handle. The designer's optional
lint module comes from the consumer.
The viewer has no engine, clipboard, lint option or `locale` option, but its
entry includes translated diff labels and optional panel dependencies. It has
no broad viewer-purity allowlist; readonly is enforced by the absence of editing
services.

Viewer and designer entries import no CSS. Consumers load `viewer.css` or
`design.css` separately, preserving scoped themes without pulling the root
editor stylesheet through the shared CSS build. Viewer panel imports bypass
the library barrel's CSS side effect. `/mode` likewise has its own `mode.css`.

The root modeler constructs `bpmn-js/lib/Modeler` itself. Each engine stack is
data: upstream plugin modules, with the shared leading and trailing modules
spliced around them by one helper, the engine's moddle extension, the
properties-panel option defaults, and the engine's popup-menu annotation
overrides. The stacks started from camunda-bpmn-js 5.36.0's C7/C8 Modeler
composition and keep its order, but no longer track it: the package does not
depend on camunda-bpmn-js. Its Modeler classes added popup-menu providers across
releases that the custom append menu then had to disable, and its caret ranges
overlap most of our exact pins, so Yarn Berry consumers got a second bpmn-js and
diagram-js nested under it. Upstream options and features we do not use stay
unwired: `disableAdjustOrigin` / `disableGrid`, the upstream template chooser
(ours replaces it), the create/append group providers, which would regroup the
flat `bpmn-create`/`bpmn-append` entries the custom append menu reads, and C8
external resources (inert without a resources provider).

The popup-menu annotations camunda-bpmn-js used to supply are ours
([`popupMenuAnnotations/`](../../packages/bpmn-modeler/src/popupMenuAnnotations/)).
A pure module holds element descriptions and search keywords keyed by the bpmn-js
popup entry id, and the one mapping from `create-`/`append-`/`replace-with-`
entry ids onto that key. A single diagram-js provider attaches them to the
`bpmn-create`, `bpmn-append` and `bpmn-replace` entries and translates the
descriptions and keywords, keeping each English keyword beside its translation so
both languages match. Keywords are therefore spelled as i18n dictionary keys
("Form", "Message"), because the translator looks keys up verbatim. The data is
layered: an engine-neutral base set, which `/design` loads as is, plus
per-engine overrides only where semantics differ — the service-task wording,
"Job worker" on C8, "Java delegate" and "External task" on C7 — so Design, C7
and C8 get the same menus. The English descriptions reuse
camunda-bpmn-js's strings where they are engine-neutral, because the shared i18n
package is keyed by them; `THIRD_PARTY_NOTICES` attributes them. On C7 and C8
the replace menu moves element-template entries into a "Templates" tab beside
the default "BPMN" tab. Copying upstream's implementation would have carried its
C8-only wording and keywords into roughly 650 lines of code for what diagram-js
entries already support (`description`, `search`, `tab`); bundling it at build
time would still ship upstream internals without an API contract. A
[coverage test](../../packages/bpmn-modeler/src/popupMenuAnnotations/popupMenuAnnotations.coverage.browser.spec.ts)
requires every bpmn-js replace action and create option to resolve to a
description on all three surfaces, bar an explicit exception list, so a bpmn-js
bump that adds an element fails until it is described. The same test requires
every description and keyword to have a translation in every locale, from the
shared i18n package or the `bpmn-i18n-extras` overlay.

The stack loads through a dynamic import inside the modeler's already
asynchronous construction, so the factory contract is unchanged.
Unknown engines are rejected before any import, and a handle destroyed while
its stack loads allocates nothing. Code-splitting consumers get one chunk per
engine; single-file bundlers inline both. The per-engine saving is modest
because the properties panel, element templates, their validator and the
variable resolver are single-file upstream dists both engines share.

The IDE webview imports every surface factory, the diff pane and `/lint`
dynamically, so View and Design opens never parse the Camunda stack. It starts
the saved mode's surface chunk, and `/lint` for editable modes, during the
initial host round-trip, and loads `/lint` concurrently with the surface. It
disables CSS code splitting because host shells link a single `index.css`. Two
dependencies that run only on user action load on first use:
`bpmn-auto-layout` inside the layout engine, and canvg via a webview-only
redirect of `@bpmn-io/svg-to-image` to a lazy shim, since copy-as-image imports
it statically upstream. Locale catalogs stay eager until the external i18n
package can split them.

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

### Element template preview

Template authors need to see the properties panel a template produces without
applying it in a diagram, for C7 and C8 alike. `createTemplatePreview(panelParent,
options)` renders that panel and nothing else. It is exported from the package
root rather than a subpath, because it only composes `createModeler` and adds no
dependency to the module graph.

The preview keeps one modeler per engine on an offscreen canvas and replaces it
when the engine changes, after the panel's deferred effects have run. Each
`show(template, engine)` imports a fresh diagram, loads the template as the only
one, and creates an element with `elementTemplates.createElement`, so an
`elementType` (such as a message throw event) builds the right type. It clears
the engine-version gate the fresh diagram pins, so a template written for
another version still shows. Calls are queued, because each re-imports. A
template the validator rejects is reported as messages, and the panel restores
the last template that rendered rather than going blank. The language is
page-global like the modeler's; `setLocale` re-renders the shown template.

Upstream collapses a template's groups, which reads as an empty preview, so a
low-priority properties provider marks them `shouldOpen`. That is only a group's
default: the panel's layout state wins once the user toggles a group and
survives the re-import of each `show`, so an edit does not reopen what the user
collapsed. It deliberately overrides a C8 group's `openByDefault: false`, because
a preview that hides its own fields misses its purpose.

Templates for a process or a sequence flow are reported as not previewable, by
naming the type (`unsupportedType`) so that the page can say so in its language:
selecting such a templated element throws inside create-append-anything's
remove-template replace entry. That also affects the modeler itself and needs
an upstream or local fix before the preview can show them.

The IDE page that hosts the preview parses the template file itself, so a host
only pushes the raw text; see
[Architecture and hosts](architecture-and-hosts.md#host-integrations).

### Themes and locale

Each instance's `ThemeController` sets `data-bpmn-theme="light" | "dark"` on
the canvas and panel roots. Theme always engages; `automatic` is the default.
Overlays mounted outside those roots copy the attribute onto their own root.
The host themes its page chrome through the private shared `hostTheme` adapter.
A host root theme must not be allowed to override differently themed instances.
A destroyed instance ignores `setTheme` rather than throwing `NoModelerError`:
a mode session forwards theme changes to the outgoing surface while a recreate
is in flight, then applies its current theme to the surface it builds.

The theme modes have one home, `SurfaceThemeMode` in `modeler-types`, the mode
the controller takes. The public `ThemeMode`, DMN's `DmnThemeMode` and the
shared host adapter's `HostThemeMode` are aliases of it, so a new mode widens
all three at once, and the compiler names each place that must handle it: the
controller's `setMode`, the host adapter's `setMode` and the
`publicApi.spec.ts` pin in each package. The pins exist because the alias puts
a published type in an inlined private library: an edit there changes the npm
surface, so each spec pins its public name to the three values and such an edit
fails the package's typecheck.

Author dark overrides once, scoped under the attribute. The main stylesheet
combines them with the upstream light base; derive unscoped legacy light/dark
sheets by stripping that scope. The light base imports each plugin's own
stylesheet at the pinned version, never another package's prebuilt copy
(bpmn-js's `diagram-js.css`): those are frozen at that package's build and drift from the JS we run (#1670). An architecture
test rejects such imports. Mirroring an existing `#theme-link` remains a
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

Both tiers render through `bpmn-js-bpmnlint`, pinned to an exact version. The
package replaces its `lint()` and `update()` on the instance instead of forking
it: every relint trigger (import, element change, toggle, host push) goes
through one scheduler — a trailing quiet period as long as the last pass took
(0.3–5 s), then an idle callback — with at most one pass in flight, cancelled
on `diagram.clear`/destroy. Scaling the wait with the pass cost keeps a burst of
edits on a large model from paying one blocking pass per edit. Each pass redraws
only the overlays of elements whose issues changed. The update reuses the
vendor's private formatting and overlay helpers through the typed
`lintingInternals` adapter, pinned by the upstream-shape test, so a version bump
fails loudly. A `Linter` is still built per pass: bpmnlint rules keep per-run
state in their closures. Consequence: `onLintResults` arrives after the
debounce/idle delay rather than synchronously after an import or edit.

Before 11.15.0, bpmnlint's `no-overlapping-elements` and `no-bpmndi` scaled
quadratically with model size and dominated every lint pass on large models.
Since 11.15.0 both are near-linear; every host and npm consumers of
`@miragon/bpmn-modeler` get that through its pinned `bpmnlint` dependency. The
[equivalence spec](../../libs/modeler-core/src/modeler/bpmn/adapter/out/bpmnlint/coreRuleEquivalence.spec.ts)
pins their reports and order, so a bpmnlint bump that changes either rule's
output fails. 11.15.0 reports the same elements as 11.14.0, but
`no-overlapping-elements` lists them in element order instead of detection order.

Host linting (`NodeBpmnLinter`, in the VS Code extension host and the
IntelliJ bridge) runs workspace code only through `bpmnlint-plugin-*` rule
packages the user allowed, behind the gate described in
[Workspace rule packages](#workspace-rule-packages); a host that wires no
`rulePackages` ports lints with the bundled rules only. bpmnlint's own rules
and configs always come from the bundled bpmnlint: through the workspace,
bpmnlint's `NodeResolver` would run the workspace's `bpmnlint` install or, via
`requireLocal`, scripts two folders above the `.bpmnlintrc`. A string
`moddleExtensions` entry is resolved without running anything and loaded only
when it is a `.json` descriptor; every known one is. Accepted cost: a workspace
that pins another bpmnlint version gets the bundled version's built-in rules.

A host lint returns, besides the results and the unresolved names, the rule
packages the gate blocked and the modules it refused. When a blocked package
left a rule or config unresolved, the status bar shows the `blocked` state
(`BPMNlint: N rule packages not allowed`). It wins over `unresolved` and
carries no install hint: installing would not help, allowing would.

The webview owns lazy `/lint` loading and routes results to either editable
surface. The [lint-free entry check](../../packages/bpmn-modeler/scripts/check-lint-free-entry.mjs)
and source architecture tests guard the import boundary.

### User-supplied plugins (proposed)

Proposed for [#1626](https://github.com/Miragon/bpmn-modeler/issues/1626) and
shipped for VS Code by [#2240](https://github.com/Miragon/bpmn-modeler/issues/2240)
and for IntelliJ by [#2242](https://github.com/Miragon/bpmn-modeler/issues/2242);
released in VS Code 1.21.0 and IntelliJ 1.16.0. Orca ([#2244](https://github.com/Miragon/bpmn-modeler/issues/2244))
reuses the same core and package. Teams want to load bpmn-js plugins, many written for
the Camunda Modeler, without forking a host or building an app on the package.
The [user guide](../vscode/features/bpmn-plugins.md) carries what users must
know. Workspace bpmnlint rule packages share the approval list and the
question; [Workspace rule packages](#workspace-rule-packages) records how they
differ.

**Format.** A plugin is a classic script that pushes `{ type, plugin }` onto
`window.plugins`, the contract of `camunda-modeler-plugin-helpers`, plus an
optional stylesheet. Unmodified Camunda bundles that register bpmn-js modules
or moddle extensions therefore load ([#2241](https://github.com/Miragon/bpmn-modeler/issues/2241)
ran 12 real ones; the [user guide](../vscode/features/bpmn-plugins.md#camunda-modeler-plugins-we-tested)
has the table). The registration types map to engines as Camunda's product
lines do: `bpmn.modeler.*` applies to every engine, `bpmn.platform.modeler.*`
to C7 and `bpmn.cloud.modeler.*` to C8, for `additionalModules` and
`moddleExtension`. A registration of any other type (`lintRules.*`, `dmn.*`,
`client`) is ignored and logged. A bundle that imports the helpers'
`vendor/*` modules (properties panel extensions, React client extensions)
throws while it runs, before it registers anything, because the editor defines
none of Camunda's host globals; it is reported as a failed plugin. An untagged
model gets only the registrations made for every engine.

**Ownership.** Each layer owns one part, so every host and npm consumer takes
only what it needs:

| Layer | Owns | Does not own |
| --- | --- | --- |
| `@miragon/bpmn-modeler/plugins` | Loading scripts from URLs, mapping registrations to engines (`modulesFor(engine)`), building with a fallback | Discovery, trust, network, UI |
| `libs/modeler-types` | The load report texts (`pluginLoadReport`), pure | Where they are shown |
| `libs/modeler-core/src/bpmnPlugins` | Discovery, manifest reading, the approval rule, the `PluginCatalog`, the file-cache delivery and the `GetBpmnPluginsCommand` handler | Webview code, host widgets |
| Hosts | The ports below and a cache folder the webview may read | Any rule or text |

**Package.** `@miragon/bpmn-modeler/plugins` exports `loadPlugins(sources)`,
which runs one script at a time, attributes what it registers, restores
`window.plugins`, and reports a failing plugin without stopping the others.
The result's `modulesFor(engine)` returns the `additionalModules` and
`moddleExtensions` a surface passes in. `buildWithPluginsOrWithout` builds a
surface with those modules and, when the build throws or rejects, reports the
error to a callback and builds again without them; an engine that gets no
plugin modules is built once. The fallback lives in the package rather than
the IDE webview, so Orca's frame and npm consumers get "a broken plugin never
keeps a diagram from opening" too. The fallback covers construction only; a
plugin that throws later, in a listener or a render, is neither contained nor
named ([#2270](https://github.com/Miragon/bpmn-modeler/issues/2270)).
The loader takes URLs: a host-served URL (the IDE webviews), a `blob:` URL or a
plain URL. Orca's isolated frame admits neither `blob:` nor `data:` scripts,
only its own files and inline text, so its delivery needs inline text or a
policy change upstream ([#2244](https://github.com/Miragon/bpmn-modeler/issues/2244)).
The package decides no trust: plugin code runs
with the page's authority, and an npm consumer decides where plugins come from
and whether to load them. It is a subpath like `/lint`, so a consumer without
plugins never bundles the loader; the
[plugins-free entry check](../../packages/bpmn-modeler/scripts/check-plugins-free-entry.mjs)
keeps the root, `/design` and `/mode` from reaching it.

**IDE webview.** Modules are fixed at construction, so the BPMN webview needs
the plugins before it builds a surface. It posts `GetBpmnPluginsCommand` as
soon as the file reply shows the page is an editor, because a diff pane never
asks and the webview cannot tell the two apart earlier without adding the
command to the diff pane's handshake. It does not wait there: the Design and
Implement factories await the reply and the script loading together with their
surface module and lint options, so the round trip overlaps the module load.
The wait lasts at most `HOST_REPLY_TIMEOUT_MS`; when no answer comes, the
editor opens without plugins and logs that the host did not answer. It
loads the `/plugins` chunk only when the answer holds a plugin and shows the
`modeler-types` report: a log line per failed or ignored registration and one
notice. Plugins go into Design and Implement, never into View, whose
NavigatedViewer lacks the modeling services plugins build on. A tagged model
keeps one instance across Design and Implement, so its engine's plugins stay
loaded in Design. The answer stays its own message instead of joining
`BpmnFileQuery`: the VS Code smoke suite measures the time from opening a file
to its first surface, and one small cached plugin left it unchanged (median of
three, about 360 ms with and without).

**Discovery and approval (core).** `bpmnPlugins/` finds one plugin per
subfolder of each `<configFolder>/plugins/` between the document and its
workspace root. It reads `plugin.json`, or scans a Camunda `index.js` for
string literals without running it. Paths must stay inside the plugin folder,
by the kernel's `staysInsideFolder`, the rule the template marketplace applies
to repository paths too, and a folder name holding a separator or `..` is
skipped. A plugin runs only after the user approved this content: the
approval is a SHA-256 of the script and the style, each prefixed with its
length and a missing style marked apart from an empty one, so bytes moved from
one file to the other change the hash. It is kept by the host outside every
workspace (`PluginApprovalStorePort`; VS Code global state, an IntelliJ
application value), so a repository cannot approve itself and any change (a
pull, an update) asks again.

*Same content anywhere* (decided 2026-11-10). A row `{ pluginId, contentHash }`
names the place it was given at, but it counts for its content wherever that
content is found (`approvalStateOf`): a folder holding content the user
allowed in another folder, clone or git worktree counts as allowed, and the
core stores a row of its own there (`CarriedApprovalWriter`, see "Unit and row"
below). Worktree-per-task workflows asked again for every task's checkout of
code already allowed. A row here of other content still reads `changed`,
unless another row holds the current content. Both hashes were already
place-independent and of distinct shapes (a bare SHA-256 for a plugin,
`bpmnlint-closure-v1:` for a rule package), so existing rows carry over
without a migration and a plugin row never admits a rule package. Rejected:
approval per place (every worktree asks again) and rows of content alone
(the Add-ons view, Revoke and Forget need places). Accepted: the rule is
"same bytes", not "same repository", so an unrelated repository vendoring the
identical code is allowed too, and code that loads undeclared workspace files
at runtime behaves differently in another repository. Every write is a change, rows to allow and ids to
revoke (`CodeApprovalChange`), that the host merges into the list it stores
with `approvalsAfter` in one step: rows the change does not name keep their
place, an allowed row replaces its id's row in place, new ids append. A writer
therefore never drops a row it had not read, such as one another IDE project
or window stored. A change that names an id twice, or allows and revokes one,
is refused in both languages and stores nothing; no caller sends one, so it is
a bug, and failing closed is the safe answer. `codeApprovalChange.cases.json`
holds the rows for the TypeScript and the Kotlin merge. The port also gives
`readStored()`, the host's list rather than a mirror, and `onDidChange`, which
fires once whenever the store learns of a new list: its own change, a host push
or `readStored()`. VS Code learns of another window's write only on the focus
re-read, although `read()` may show it earlier. `WorkspacePluginLocator` keeps a memo per plugin folder and drops it on
a `WorkspacePort.createWatcher` event for that `<configFolder>/plugins`
folder, so an editor open does not reread and rehash every bundle (Camunda
bundles can be several MB). The feature disposes the watchers with itself.

`PluginCatalog` is host-neutral and returns values: `pluginsFor(documentPath)`
gives the approved plugins with their bytes, the pending ones and every one
withheld, `reviewPrompt(pending)` the prompt the domain builds, and
`applyAnswer(pending, answer)` allows the checked ones and records the
declines. A decline lasts for the catalog's lifetime (the extension host
session) or until the content changes. The catalog knows no
`EditorSessionStore` or `EditorHandle`, so Orca's worker can answer its frame
from it directly.

`CODE_STATES` (`approved`, `new`, `changed`, `declined`, `gone`) in
`kernel/domain/codeApproval.ts` is the one spelling of the state a piece of
workspace code is in, and `CODE_STATE_TEXT` the one text of each, which the
approval list and the log use; `ApprovalState` and the rule packages'
`BlockedState` are subsets of it. `needsContentHash` is the one rule for when
code must be hashed before its state is known (any row of its kind, which may
hold its content, or a decline of its id),
and `codeStateOf` the one dispatcher from what an owner found (found,
unhashed, unreadable, gone) to that state; `rulePackageVerdict` reads it.
The add-on catalog (below) reads them too: `reviewedAllowDecision` allows only
content that is still as it was reviewed, `PROCESS_RESTARTS` names, as a typed
host fact, how the user unloads code that already ran (reload the window,
restart the IDE), and `RulePackageCatalog` keeps the packages revoked this
session.

**Prompt flow.** Per the
[VS Code UX guidelines](../../.agents/skills/vscode-ux-guidelines/SKILL.md), a
list never opens unasked: the spike's QuickPick opened when an editor opened
and took the focus. The editor opens with the approved plugins at once, and
when plugins are pending the core offers a notification it builds in
`bpmnPlugins/domain/` ("N BPMN plugins in this workspace are not allowed
yet.") with one **Review…** action through the generic
[action notice port](architecture-and-hosts.md#host-integrations). Only
**Review…** opens the review, an `ApprovalReviewPort` each feature takes as
an optional port. Its default, `ListReview` in `kernel/adapter/out/`, opens
the `chooseMany` prompt. Dismissing the notification or the list, or leaving
a plugin unchecked, is the same answer: those plugin versions are declined
for this session, offered again in a later one, and offered again at once
when their content changes. A review answers a `ReviewAnswer`: the checked
ids, or `leftForView`, which a review that shows the pending code in a view
returns ([#2250](https://github.com/Miragon/bpmn-modeler/issues/2250)). The
question then settles at once, so the queue does not wait on the view; the
code keeps its state, is not declined for the gate, and no notice asks about
the same content again this session. `ViewReview` in `addOns/adapter/out/`
is that review: it leaves the code to the host's add-ons view through the
`AddOnViewRevealPort`, naming the rows (`addOnIdOf` of each pending artifact
id), only when `leavesToView` holds, that is when a folder is open and every
pending id lies inside one. All or nothing: the view lists only code inside
a workspace folder, so an item a link put outside every folder could be
allowed nowhere this session. Otherwise, or when the reveal answers `false`
or rejects, it answers with its fallback, `ListReview`, which stays for good.
The review request carries the folders the prompt was built for
(`ApprovalReviewRequest.workspaceFolders`), so the prompt and this decision
use one reading. Both hosts pass a `ViewReview` to both features: VS Code
over its Add-ons view, IntelliJ over `RpcAddOnViewReveal` and the Add-ons
tab of its BPMN Modeler tool window. **Review…** opens the view unless an
item lies outside every folder or the view cannot open. The feature's
`review` port is still optional; making it required and removing
`reviewOrChecklist` is a follow-up now that both hosts pass one. The catalogs keep these session answers
by content (`SESSION_ANSWERS`). The kernel's
`ApprovalQuestion` runs this flow for every approval kind and knows no
editor: one question is open at a time, and plugins found while it is open
are asked afterwards, as far as that answer left them pending. A VS Code
notice can stay unanswered in the notification centre, so dropping them would
leave a second workspace's plugins unasked for the session.
Modules are fixed once a modeler is built, so every change of the approval
list reloads the open BPMN editors it makes stale, whoever made it: the
notice, another IntelliJ bridge's push, or another VS Code window after the
focus re-read. `BpmnPluginsFeature` follows the store's `onDidChange`, and
`editorsToReload` names an editor that serves a plugin no longer allowed at
the content it loaded, or was withheld a plugin now allowed at the content it
was offered, declined ones included. The delivery records per editor the
plugins it served and withheld, drops the entry on a reload until the page
asks again, and a session participant drops it when the editor is disposed.
The question itself reloads nothing.

**Serving.** The delivery service answers `GetBpmnPluginsCommand` with
`postUnlessHidden`, as element templates do. It copies the approved bytes into
a content-addressed cache (`<globalStorage>/bpmn-plugins/<hash>/plugin.js` and
`plugin.css`) and maps them to URLs through `EditorHandle.webviewUrlOf`. Each
hash is copied once per session, editors asking at the same time share that
copy, and a failed copy is tried again on the next request. A copy found in
that memo is checked on disk first and written again when it is not whole,
because another process's prune may have removed it. The copy reads each
cached file back and rewrites it when its bytes differ from the approved ones
or cannot be read: a write cut short by a crash would otherwise be served as it
is. The webview never
reads a workspace folder, so a file swapped after the approval and an
unapproved file beside the script cannot reach it, and `localResourceRoots`
stays fixed at creation. The host passes the cache root as a platform path
(VS Code's `fsPath`, `C:\…` on Windows); the core normalizes it once with
`toWorkspacePath`, so the written path and the URL path agree. VS Code roots
the webview's cache folder at a `file:` URI of that path: desktop VS Code
hands out global storage as `vscode-userdata:`, and a webview serves a file
only below an allowed folder of the same scheme as its URL. A host that does
not wire the feature answers with no plugins. That answer has one home,
`answerWithoutPlugins` in `editorSession/`, built on `postUnlessHidden` like
the delivery's own answer.

**Pruning.** `BpmnPluginService.pruneCache` removes the cache folders named
like a content hash (`PLUGIN_CONTENT_HASH_PATTERN`, 64 lower-case hex digits)
that no stored approval
names (`cacheEntriesToPrune`). The keep set is every row the host stores, of
every workspace and project, read with `readStored()` rather than a mirror,
because the cache is shared. Files, other names and upper case stay, and a
rule package row's prefixed hash names no copy. A prune waits for the copies
in flight, and a copy waits for a running prune. VS Code prunes at
activation, and the bridge once `server.ts` has bound its streams, so the
harness specs see no extra frame. A plugin revoke from the add-on catalog
prunes in the process that revoked, and so does its "Remove unused plugin
copies" action. Pruning on
every approval change in every process was rejected: until then the next
start's prune covers the shared cache, after it the revoking process's prune
does, and N bridges pruning at once only adds noise.
Residual: a page that loads between another process's delete and this
process's memo check leaves the plugin out once, and the next open writes the
copy again. A grace marker would close that gap and is deferred.

**IntelliJ.** The bridge wires the same `BpmnPluginsFeature` as VS Code, so the
texts, the notification, the list and the reload rule are the core's. The host
supplies these parts:

- *Cache root.* One folder per machine,
  `<IDE system path>/miragon-bpmn-modeler/bpmn-plugins` (`BpmnPluginCache`).
  The cache is content-addressed, so every project and bridge shares it.
  The bridge's `NodeWorkspace.writeFile` writes a temporary sibling and
  renames it over the file, so a page never loads a file that another
  project's bridge is still writing. The launcher passes the root to the bridge as `MIRAGON_BPMN_PLUGIN_CACHE`, and the
  `WebviewServer` serves from the same value, so the two cannot disagree.
- *Route.* `RpcEditorHandle.webviewUrlOf` maps only
  `<root>/<64 lowercase hex>/plugin.js|plugin.css` (the core's
  `CACHED_PLUGIN_FILE_PATTERN`; Kotlin keeps its own copy) to the root-relative URL
  `/bpmn-plugins/<hash>/<file>` and throws for any other path. The page loads
  it from its own loopback origin, so the bridge needs no port. `WebviewRoute`
  matches the raw request path before decoding, so `%2F` or `%2e%2e` cannot
  form a separator, and anything else under `/bpmn-plugins/` is a 404, never a
  classpath lookup. The served file must be a regular file that is not a
  symbolic link, and its real path must stay inside the cache's real path. The
  CSP is unchanged: `script-src 'self'` and `style-src 'self'` already admit
  same-origin files. One cases file (`pluginAssetUrl.cases.json`) holds the
  mapped, unmapped and refused rows for the bridge spec and `WebviewRouteTest`.
- *Approval store.* An application service over `PropertiesComponent`
  (`PluginApprovalStore`), outside every project, shared by all projects of the
  IDE. Bridges run per project, so the host is the single writer: the bridge
  mirrors the list for the port's synchronous `read()`, seeded on every
  `session/register` (a separate seed would race the page's first plugin
  query) and replaced by `pluginApprovals/didChange`, which the host also
  sends after every spawn. A bridge writes with
  `pluginApprovals/change`, which carries only the rows to allow and the ids to
  revoke; the store reads, merges, writes and bumps its revision under one
  lock, pushes the list to every running bridge and then answers with it.
  `pluginApprovals/read` answers the stored list. Every list the host sends
  carries that revision and the mirror keeps the newest, since the bridge's
  per-editor and per-method queues can apply a register after a newer push
  (see [host-replicated state](architecture-and-hosts.md#host-replicated-state)).
  There is no `pluginApprovals/save` alias, which would keep the whole-list
  replace: plugin and bridge ship together, and a mismatched dev bridge's
  change fails with "No handler" rather than losing a row. The stored JSON is
  unchanged.
- *VS Code store.* `VsCodePluginApprovalStore` merges each change on one
  in-process promise chain, so two answers in one extension host keep both
  rows whether or not `Memento.update` sets its value before it resolves.
  VS Code announces no write another window makes to the global state, so the
  composition calls `readStored()` when the window gains focus.
- *Notice.* `actionNotice/show` becomes a balloon with one action per label;
  see [host integrations](architecture-and-hosts.md#host-integrations).
- *Reload.* The page asks for plugins only while it boots, so the soft reload
  that re-renders the diagram cannot load new ones. `RpcEditorHandle.reload`
  sends `editor/reload`; the host writes the page's unsynced edit into the
  `Document`, sends the session's `session/register` again and reloads the
  page. `WarmBrowser` installs the sink on every load of a bound browser,
  reloads included.
- *Shim.* The shim makes the page's own wiring single-use.
  `acquireVsCodeApi()` hands out a frozen API once and throws on a second
  call, as VS Code does; every page calls it once. `__modelerSetSink` deletes
  itself on its first call, and the JVM's sink script captures the
  `JBCefJSQuery` function once instead of looking up its global for every
  message, so a later script cannot swap the sink. Plugins arrive only in a
  reply to a message that waits in the outbox until the sink is installed, so
  both doors are spent before a plugin runs. This stops accidental or casual
  reuse; it is no boundary against an approved plugin. CEF's message router
  keeps the query function on `window` in every page context, so a plugin can
  call it and post to the JVM and, through it, to the bridge. It can also read
  the host's messages, which arrive as `window.postMessage`, and patch the
  built-ins the shim calls per message (`JSON.stringify`) to read the page's.
  An approved plugin has the page's full authority, as in VS Code; approval is
  the control.

**What an approved plugin can do.** It gets the modeler's injector, so it can
edit the diagram (edits sync to the file) and call every DI service, including
those holding host ports (navigation, clipboard, script editors). The BPMN
webview's `img-src https:`, needed for element-template icons, lets it send
data out through image URLs. Approval is the control; a tighter CSP cannot
close this, and the user guide says so.

**Not shared.** The editor exposes none of its bpmn-js, diagram-js, moddle,
preact or properties-panel instances, and never will expose bpmn-js,
diagram-js, moddle, React or Camunda app-shell components. In
[#2241](https://github.com/Miragon/bpmn-modeler/issues/2241) every bpmn-js
plugin that works got what it needs through injection, including plugins that
bundle diagram-js 3 and bpmn-js 3 helpers (`RuleProvider`,
`CommandInterceptor`, `is()`) and run against our instances; the Camunda
Modeler exposes none of these either. Of the other failures, none was an
instance problem (private bpmn-js 0.22 APIs, the Camunda app shell, a module we
bundle already). Instance identity matters only for properties panel extensions:
helpers-built ones read `window.vendor.propertiesPanel`, and a plugin with its
own copy of the panel stack breaks the whole panel (a second preact), with no
report naming it. They stay unsupported for now. A partial
`window.vendor.propertiesPanel` built from the Implement panel's own instances
made the unmodified process-io plugin work, but a full one would make `@bpmn-io/properties-panel`, `bpmn-js-properties-panel` and
its preact a plugin API with a version policy; it is left to its own decision
([#2265](https://github.com/Miragon/bpmn-modeler/issues/2265)),
with one exported instance set, an error boundary around plugin groups and a
contract test as preconditions.

**Listing, allowing and revoking.** The `addOns` context of the core is the
host-neutral read model of the Add-ons view
([#2263](https://github.com/Miragon/bpmn-modeler/issues/2263); the views are
[#2250](https://github.com/Miragon/bpmn-modeler/issues/2250)). It owns no
rule of what it lists: the plugin and rule package features each meet a
structural port of `addOns/port/` with an inventory (`PluginInventory`,
`RulePackageInventory`) that finds, places, hashes and answers for their code
as their notices do, says what it can do once allowed, what follows an
allow or a revoke and which revoked code stays loaded, and runs what
follows a revoke. The element templates meet one with `TemplateInventory`,
which reads each template file by the loader's rule (`templatesOfFileText`,
`templateEngineOf`), and the marketplaces with `MarketplaceInventory`
over the host's `MarketplaceCommands`, which `createMarketplaceCommands`
builds together. The host compositions wire one into the other ([package boundaries](architecture-and-hosts.md#package-boundaries)).
Both hosts build an `AddOnsFeature` and bind one view to it: VS Code its
Add-ons view, IntelliJ the Add-ons tab of its BPMN Modeler tool window,
attached hidden when the bridge starts; IntelliJ's watchers follow the folders
known whenever the views change or the catalog refreshes, so they follow the
project root from the first `addOns/open` on
([host integrations](architecture-and-hosts.md#host-integrations)).
`AddOnsFeature.attachPanel(post, visible)` serves the add-ons view protocol
of `libs/shared` (`addOnsView.ts`) for one page through `AddOnViewMessages`
in `addOns/adapter/in/`, so a host only passes a `post` and the page's
commands; `panelRoutes` answer the surface coverage before any page attaches.
A page asks for the last model when it loads, as a push can land before it
listens. A reveal names its target: the rows a **Review…** left to the view
(`AddOnsFeature.reveal(addOnIds)`), or every add-on that needs review
(`AddOnsFeature.revealNeedsReview()`, for **Review Add-ons**). The protocol's
`AddOnRevealPayload` is a union on `kind` (`rows`, `needsReview`), written out
field for field in the core's `AddOnReveal`. The latest reveal of either kind
wins and is delivered at most once to each attached view while it is visible,
so a view shown or attached later still lands on it; it may arrive before any
model, and the page holds a rows reveal until a model lists one of its rows
and a needs-review reveal until any model arrives. A panel posts a reveal
again to the page that asks once it loads, until a page that listens has it,
and again after the panel was hidden, as a host may load a hidden page anew; a
page loaded later gets no old reveal. Reveal ids start from the clock, as
revisions do, so a page that outlives a core process still applies the next
reveal. The core knows no tabs: the page maps `needsReview` to the Workspace
tab with only the Needs review chip, every header open, its selection kept
when it needs review, else the first add-on that does. **Review Add-ons** is
host-first, the host shows its view and then asks the core, because the
IntelliJ tab must open at once while a cold bridge still starts; **Review…**
stays core-first through `AddOnViewRevealPort`, because there the core decides
whether a view can show the rows. The page keeps only a tab the user chose
(`chosenScope`); until then the first model that lists something opens
Marketplaces when the Workspace tab lists nothing and a marketplace is listed.
A tab selects on its own only a row the list shows, never one a closed header
hides ([the page](architecture-and-hosts.md#package-boundaries)).

- *Scope.* It lists the open workspace only: the root config folder's
  `plugins/` and `element-templates/` of every workspace folder, the nested
  config folders an editor or a listing already looked in (for templates, the
  templates folders an open editor loaded), each folder's `node_modules` and the
  `node_modules` of each lint config read so far inside one, the packages the gate
  reported, and every stored row inside a folder that discovery missed, read
  directly, so a row whose folder is gone shows as gone. A row outside every
  folder is not listed, though the prune still keeps it. `addOnScope` in
  `addOns/domain/` decides what to read and which rule packages to hash;
  the reader only fetches. Add-ons group by the
  innermost workspace folder, then by source (the root config folder, nested
  config folders by path, package folders), then by name. A nested config
  folder's plugins and templates apply only to the diagrams below it, and the
  source says so; a config folder's plugins and templates share its source,
  plugins first. The bridge lists the folders the host registered.
- *Templates.* One row per template, `template:<source>|<file>#<index>[:<id>][@<version>]`, with
  its version and engine (`templateEngineOf`: its own, else its file's, as
  the builder reads it); a file that cannot be read is one row,
  by its file name, that says why, enabled and without a switch.
- *Template switches.* On a host that keeps them (the optional
  `TemplatePreferenceStorePort`; VS Code and the IntelliJ bridge do), a
  template with an id offers Disable or Enable, and a config folder that
  lists one, or a marketplace whose entry parses, offers "Disable templates"
  or "Enable templates" for all of them; a source turned off says "Templates
  disabled", and its templates show disabled with no switch of their own,
  which they keep for when the source is on again. A switch is a preference,
  not trust: it keeps a template out of new choices (the core sends the
  hidden refs with `ElementTemplatesQuery` and, after a switch change,
  `HiddenElementTemplatesQuery`; the page applies them with
  `setHiddenElementTemplates`, see "Public API"), and an element that uses
  one keeps it. The rules live in `kernel/domain/templatePreferences.ts`:
  - A switch is `{ source, templateId? }`, the template id within its source,
    every version and file of it. The source key survives what it must: a
    config folder is `configFolder:<innermost workspace folder's name>/<path
    below it>` (a moved repository or a second root keeps it), a marketplace
    `marketplace:<provider>:<host>/<repository>` without the ref
    (`marketplacePreferenceKeyOf`), so a ref edit, a re-fetch and a new cache
    generation keep it. Two roots with the same name and config path, and
    one repository registered at two refs, share their switches.
  - Each source's switches live in one scope, which the core decides
    (`templateSourceScopeOf`): a config folder's in `project`, a
    marketplace's in `allProjects` once any entry of its repository is
    registered for all projects, else in `project`. `isTemplateOffered`
    reads that scope only. A union of both scopes was rejected: a row left in
    `allProjects` after a User registration was removed would hide the
    marketplace in every project that registers it per project. A row left in
    the other scope is never read, and wakes up if the source moves back; a
    registration that moves scope starts with no switches. A marketplace
    registered only for this project whose repository keeps its switches in
    all projects says so on its row (`marketplaceListingScopeText`).
  - A ref is hidden only when every loaded copy of it comes from a source
    that does not offer it (`hiddenElementTemplateRefs` in
    `modeler/bpmn/domain/`), as the page tells copies apart only by id and
    version. A template without a string id is always offered. Versions of
    one id are not merged across sources: when the copy switched off is the
    latest version, its id is not offered, though another source still on
    serves an older version, as no older version takes a hidden latest one's
    place on the page. That older copy was not offered before the switch
    either, since upstream offers only the latest version, so its row keeps
    its state. Offering it instead would mean a substitute rule on the page
    for one case.
  - A change names the switches to disable and to enable in one scope and is
    merged by the store (`templatePreferencesAfter`, rows in
    `templatePreferenceChange.cases.json`), so a writer never drops a switch
    it had not read. The settings snapshot was rejected as the store: VS Code
    workspace settings live in the repository, and a whole-list write races
    across IntelliJ projects.
  - Each switch action is refused unless the latest build offered it, on the
    switch that build showed (`templateSwitchTargetOf`,
    `sourceSwitchTargetOf`); clicked twice before a rebuild, the second write
    changes nothing. A write that fails answers `failed` and logs why.
  - `BpmnElementTemplatesService` computes the hidden refs when it sends the
    templates, from the store's synchronous `read()`, and records what it
    sent; a store change sends only `HiddenElementTemplatesQuery` to each
    editor whose refs changed, so nothing is read, validated or reported
    again. It records them before the post, so a change during the post
    still reaches the editor; a post the editor refuses or that fails is
    forgotten, so the next change sends the refs again. A webview that is
    hidden or reloads asks for its templates again and gets the current refs.
  - Both hosts' Add-ons views offer the switches, and both user guides
    describe them.
- *Marketplaces.* A group after the folders lists each registered
  marketplace entry as a source, in the order the hosts fetch them, keyed by the entry,
  as two spellings of one repository share a cache slot: its label, the
  scopes that hold it in the words of the removal choice (and where its
  switches apply when that differs), its cached
  templates (`cachedTemplatePathsByRegistration`, the cache's own layout) and
  why it has none: an entry the registry cannot parse, nothing fetched yet,
  or a cache that cannot be read. Editors load the same templates, those of
  the registered entries, grouped by registered slot with the source their
  switches live in (`registeredTemplateSources`, read by
  `MarketplaceTemplateSources` from the host's registrations; when those
  cannot be read, one group without switches), and read them
  again when the marketplaces setting changes, so the slot of an entry
  removed by hand serves nothing though it stays cached until the next prune.
  Registrations that cannot be read, such
  as a host's reply that fails, leave the group without sources and say why;
  the folders are still listed. Each group carries its kind (`GROUP_KINDS`:
  `folder` or `marketplaces`), so a view tells that source-less group from a
  folder's without parsing an id. A catalog without a folder group carries
  `emptyText` (`emptyTextOf`): "Open a folder…" when no folder is open, else
  the text that no folder brings an add-on, whether marketplaces are listed or
  not, so a view that shows the marketplaces apart still says why the
  workspace part is empty. The catalog offers "Add marketplace…" and
  "Update marketplaces", and each source "Remove". All three run the
  host's `MarketplaceCommands`, the same instance its commands run
  (`createMarketplaceCommands` builds the inventory over it), so a flow
  started from either queues behind the other on its one-at-a-time queue and
  asks its own questions; the result is `reportedByFlow`. A removal names the
  entry the latest build showed for the source, never a payload, and asks
  `marketplaceRemovalConfirm` before the queued unregister, prune and reload.
  `MarketplaceCommands` fires `onDidChange` at the end of every flow that ran,
  failed ones included, and the catalog lists again on it.
- *Read model.* `catalogModelOf` in `addOns/domain/` builds every text, the
  state (`codeStateOf`, the same reading as the notices), and the actions a
  row offers from one table keyed by what the owner read and that state:
  allowed content offers Revoke, other hashed content "Allow this content",
  content not hashed yet "Review…", a gone row "Forget". While no rule package
  row exists, a rule package no decline or answer asks about is not hashed,
  as for a lint: its row offers "Review…", which hashes it, and then the
  allow, so allowing one takes two steps. Once any rule package row exists,
  every listed package is hashed, as any row may hold its content, and
  "Review…" no longer shows. The reader passes only the owner's rows to that
  decision. A row offering Revoke whose content other folders' rows hold says
  how many, and that Revoke takes it back there too. One a notice left to the view is hashed (`isHashWanted` reads every
  session answer), as the gate hashed it to ask, so the row offers "Allow this
  content" at once. A view shows its own state labels (`CODE_STATE_LABEL`:
  Allowed, Not allowed yet, Changed, review needed, Declined this session,
  Folder gone); the checklist and the log keep `CODE_STATE_TEXT`, which reads
  inside a sentence. A listing that throws is logged and still reaches the
  views: `failedCatalogOf` keeps the model shown before, under its own
  revision so an allow against it holds, with a `problem`, or without one
  sends a new revision that lists nothing and says why. A view's request is
  untrusted: `addOnRequestOf` keeps only a known kind with the fields it
  names, and anything else is refused as not offered. The config's own package hashes without its models, so the
  inventory hashes a folder outside `node_modules` as one only once a lint
  read its config or the gate reported it, and as a package once a
  `node_modules` entry links to it, unless it holds a lint config read so
  far, which the gate refuses with the same reason; any other such folder
  cannot be allowed until a lint reads its config. Ids are only looked up in what the core
  recorded, never parsed.
- *Allow by the reviewed hash.* Each build has a revision, counted from the
  clock so a view kept across a respawn never names one the new process
  used, and `ShownRevisions` keeps what the last sixteen showed and which
  actions each row offered, never sent. An allow names the revision and is
  refused unless that revision offered it; the content comes from what that
  revision showed, never from a payload, the owner reads it again past any
  memo, and `reviewedAllowDecision` refuses it when it changed, is gone or
  cannot be read. A revoke or a review is refused unless the latest revision
  offered it, and a disposed view's requests are refused.
- *Revoke.* Revoke takes back content, not a row: an approval of the content
  would otherwise carry it straight back to the revoked folder. Each row
  decides when it is built what Revoke withdraws (`ShownCode.withdrawal`):
  found code its current hash, an unreadable row the hash its row holds,
  and a gone folder only its row ("Forget"), so the content stays allowed
  where other rows hold it. `revokeChangeOf` revokes this id and every id
  whose row holds the content (`revokingContent`), read from `readStored()`;
  a sweep after the change (`revokeSweepOf`) revokes once more any row of the
  content stored while it ran, such as another place's carried row, and the
  result says how many other folders the revoke reached. Before the change,
  the revoke records `leftForView` for every listed found place of the
  content of the row's kind (`leftForViewByRevoke`), in this process only,
  so no notice here asks about it or a sibling folder at once. Other windows
  and projects reload or relint and ask again for their copies: the user
  withdrew trust. A content revoke drops every row of a revoked id, so a
  legacy duplicate row of other content goes too, in the safe direction.
  The owner hears every revoked id (`afterRevoke`), so a rule package carried
  without a row yet still says its code stays loaded. The reload or relint follows the change event, as for a notice. The
  plugin owner then prunes its cache, and only logs a prune that fails, as
  the revoke stands; a rule package row then says its code stays loaded
  until the user reloads the window or restarts the IDE. "Remove unused
  plugin copies" answers a prune that fails as `failed`, with the core's
  text, and logs why.
- *Builds.* Only while a view is visible, one at a time with a dirty flag, each
  from `readStored()` of the approvals and the template switches, so an
  unseeded IntelliJ mirror never makes every row look new; in VS Code a view shown again shows what this window's global
  state holds (see the multi-window residual under "One question at a
  time"). After each build the catalog has each owner store a row for every
  listed found add-on allowed only through another place's row
  (`foundArtifactsOf`, `CodeAddOnSource.recordCarried`), so opening the view
  writes rows for code allowed elsewhere even if it never ran; the write
  lists once more, which writes nothing. The build already reads such code
  as allowed, before its row lands, so it never offers Allow and never counts
  toward Needs review or a needs-review reveal. A change of the
  approvals or the template switches, of an owner, below a config folder (one watcher per workspace
  folder while a view is attached), of the templates folders the open editors
  loaded, a marketplace flow's end, or a change of the config folder or
  marketplaces setting lists again; `node_modules` is not watched, and a refresh or a view shown again
  reads it. Its actions run on a queue of their own, so a notice left open
  never holds back the view.

Alternatives: our own module format only (loses the Camunda ecosystem);
running `index.js` in the extension host (runs unapproved code with Node
authority); serving from the workspace folder (approval and load race, and
siblings of the script become loadable); Workspace Trust alone (granted once
per folder, off in the standalone); discovery and approval in the package
(would force one trust model on npm consumers and pull filesystem access into
a browser package); the fallback in the IDE webview (Orca and npm consumers
would each copy it); opening the approval list when an editor opens (steals
focus and asks before the user looked at the diagram); exposing bpmn-js and
diagram-js to plugins (no tested plugin needed it, and it would make their
versions a plugin API); a `window.vendor` with only the properties panel
components and no preact entries (still couples us to that preact, and breaks
the plugins compiled against its JSX runtime or hooks).

#### Workspace rule packages

Host linting loads `bpmnlint-plugin-*` packages from the workspace
([#2247](https://github.com/Miragon/bpmn-modeler/issues/2247)). Unlike a
bpmn-js plugin, a rule package runs in the extension host or the bridge with
the user's rights. Workspace Trust does not cover the IntelliJ bridge, and the
standalone turns it off, so a rule package, like a bpmn-js plugin, runs only
once the user allowed this content, in this folder or another (see "Same
content anywhere" above). In VS Code, the approval
comes on top of Workspace Trust. A host opts in with the optional
`rulePackages` group of `BpmnEditorFeature` (`BpmnRulePackagePorts`: the
approval store, an `InstalledPackagesPort`, the action notifier and the shared
`QuestionQueue`). VS Code and the IntelliJ bridge wire it with the store the
plugins use, each with its own `NodeInstalledPackages`; one contract suite in
the core's `testing/` pins both. Without the group, `NodeBpmnLinter` builds no
workspace resolver at all.

**Unit and row.** One approval covers one installed package root: the
realpath of the `node_modules/<name>` or `node_modules/@scope/<name>` folder a
require resolved into, taken at the last `node_modules`, so a nested copy is a
unit of its own. A pnpm `.pnpm` path and the target of a `file:` link are
realpaths like any other. The config's own package, whose `package.json`
names the requested plugin so that bpmnlint requires `.`, is the config
folder; it needs approval like any other root, because the repository picks
the name. Any other root is refused, logged and never offered: the folder an
absolute rule reference points into, or a `file:` link whose target holds the
config folder, would make one approval cover the repository. The row is the
existing `{ pluginId, contentHash }` in the host's one approval list, beside
the bpmn-js plugins. The content hash carries the prefix
`bpmnlint-closure-v1:`, which marks the row's kind for the Add-ons view
([#2263](https://github.com/Miragon/bpmn-modeler/issues/2263)) and names the
digest algorithm, so changing the algorithm asks again. The row round-trips
through VS Code's global state, `RpcPluginApprovalStore` and the Kotlin
`PluginApproval` unchanged, so neither the protocol nor the IntelliJ plugin
changed, and carrying approvals across places changed neither either.

The row stays per place while the approval is per content. When code runs
only through another place's row of its content, the owner stores a row for
its own place through `CarriedApprovalWriter`, one instance per owner catalog:
`carriedApprovals` decides from the mirror and returns at once when every
place has its row (the hot path, no host call); otherwise it decides again
from `readStored()`, writes `allowing` the places, and checks after its own
write (`orphanedCarries`) that another row still holds each content, revoking
any carried row a revoke left alone in between. It logs one line per stored
row naming both places (`ApprovableCodeTexts.carriedOver`) and shows no
notification. The writer runs one write at a time and does not queue a
content at a place twice, and a write that fails is logged once and not tried
again this session; the code runs
anyway, as the rule already allows it. The plugin catalog records the plugins
it discovers, `RulePackageFollowUp` the packages a lint admitted
(`LintRun.admitted`, which the gate reports per approved root, never per
closure member) and the add-on catalog every listed found add-on. A carried
row at a new id relints at most one round: the lint it causes admits
packages that have rows. Checking one copy in the approval list allows every
pending copy of its content. `rulePackageApproval.ts` owns the root, the verdict and the notice
and list texts; `rulePackageLog.ts` owns the output channel lines.

**Closure hash.** The approval covers the package and what it declares it runs
with: `dependencies`, `optionalDependencies` and `peerDependencies`,
recursively, each one found by Node's ancestor `node_modules` lookup from the
declaring member's realpath. The lookup is done by hand, as
`require.resolve("<name>/package.json")` fails on a package whose `exports`
hide its manifest; a dependency that is not installed is skipped, one installed
as a file Node takes before the folder or as a folder with only an index file
refuses the package (no name and version to make it a member), and members are
deduplicated by realpath. A member's digest is a SHA-256 over every regular
file's relative path and SHA-256 of its bytes, in a fixed order, with no
extension filter: Node runs a file of any unknown extension as a script. It
leaves out the member's own `node_modules` (separate members) and `.git`. The
config's own package also leaves out `*.bpmn`, `*.dmn`, `*.form` and
`.bpmnlintrc` files, so editing a model or the config being linted asks
nothing; a folder of such a name stays in. A linked folder, a link to a file
outside the member, a special file, a file or manifest that cannot be read, or
a closure above 5,000 files and folders or 50 MB (about eight times the largest
closure measured) refuses the package with its reason. The closure digest
hashes the root and each member by `name@version` and member digest, never by
folder, so hoisting or deduplicating keeps it. `PackageClosureFingerprinter`,
one per host composition, keeps a memo of each member's stamps (device, inode,
size and modification and change times of every file and folder, and of every
folder the dependency lookup looked in) and rehashes only the files whose
stamps changed. At the start of every lint, the linter's setup checks the
stamps of the closures it admitted (`isUnchanged`, stats only) and is rebuilt
on a mismatch. The check sits at the lint's start, not at the gate, because a
cached setup answers later lints from its `resolved` map without calling the
gate. Nothing watches `node_modules`: VS Code's watcher excludes it by default,
and the stat pass costs about 1 ms per lint for the largest closure measured.

**Gate.** `RulePackageGate` wraps the scoped require that bpmnlint's
`NodeResolver` loads packages with. Each call resolves the request, admits
built-in modules and `.json` data without approval, maps the realpath to its
root and lets the require run only when any rule package row holds the
current closure digest, or the root is a member of a closure already admitted
in this setup. While no rule package row exists, a root with no decline is
blocked as `new` without hashing (`needsContentHash`); once one exists, every
root is hashed, synchronously inside `require`, since it cannot await the
store. `PackageClosureFingerprinter` memoizes, so each worktree pays one full
hash per root per process (the largest closure measured takes about 10 ms, the
limit about 100 ms). A closure that is too large is then refused at the gate
instead of being blocked as `new` first.
Otherwise the gate records the package as blocked (`new`, `changed` or
`declined`) and throws `MODULE_NOT_FOUND`, which the resolvers' catches turn
into a miss: the bundled rule or a no-op. A file inside an approvable root that
its hash leaves out, such as a model file of the config's own package, is
refused, because the approval does not cover it. The gate is synchronous,
since `require` cannot wait, and uses no module loader hooks: the bridge runs
on Bun, which does not fire them. The setup's fingerprint holds the
config and the sorted rule package rows, so an allow, a revoke or an IntelliJ
`pluginApprovals/didChange` with a newer list builds a new setup, and no bundled fallback cached
before the allow shadows the allowed package. When a member is admitted under
another closure hash than the one it was last loaded under, the gate evicts
its `require.cache` entries, so the newly allowed bytes run.

**Asking only when needed.** `CompositeResolver` brackets each synchronous
request with the gate (`beginRequest`, `blockedSinceBegin`). A blocked package
is *needed* when a request ended unresolved because of it, and *shadowed* when
the bundle served the request instead. Only needed packages are asked about; a
shadowed one is logged once per config version and kept in the catalog's seen
registry for the Add-ons view. Otherwise the common Camunda config, which
lints on the host because of its string `moddleExtensions`, would ask about
`bpmnlint-plugin-camunda-compat` even where the bundle serves every entry the
config uses, and train users to allow everything. After `hostLintFinished`,
`RulePackageFollowUp`, which `BpmnLintConfigService` hands the lint run, logs
it and asks without awaiting the answer, so results never wait on the user;
one question per package stays queued until it is answered. Relints follow
the approval store, not the question: `RulePackageCatalog` announces each
change of the rule package rows, whoever made it (`followedApprovalChange`),
and `RulePackageFollowUp` lints again `editorsToRelint`. An allow relints
every open editor whose last host lint was blocked on some package, as a row
at one place admits the same content at every other; a withdrawn approval
relints every editor linted on the host (`lintsOnHost`, which counts a first
host lint in flight), so the withdrawal reaches the loaded code wherever it
ran, and relints are cheap. `LintRun.admitted` feeds only the carry write. A revoke withdraws an approval, and so
does a row that now holds another hash, which also counts as an allow. Closing an
editor forgets it, and `BpmnLintConfigService.dispose`, which
`BpmnEditorFeature.dispose` calls, stops following. `RulePackageCatalog`
hashes only the packages it asks about, or the one the user opens with
"Review…" in the add-on catalog, and never one left to the view, which it
tells apart by id before any hash (the add-on catalog hashes that one for
its row); it keeps declines for its lifetime unless
the content changes, and exposes them read-only to the gate, which then reports
a package as `declined` rather than `new`. The notice and the list have their
own ids (`bpmnlintPackageApprovalNotice`, `bpmnlintPackageApproval`), and the
list says that a rule package runs as a program with the user's rights.

**One question at a time.** Each host composition builds one `QuestionQueue`
and passes it to `BpmnPluginsFeature` and `BpmnEditorFeature`, so the
kernel's `ApprovalQuestion` keeps one question open across both kinds. The
queue serialises questions for the user, not writes: each answer is a change
the host merges, so two answers, from one bridge or from two IntelliJ projects
that each show a notice at once, keep each other's rows
([#2275](https://github.com/Miragon/bpmn-modeler/issues/2275)). One residual is
unverified: whether two VS Code windows share the global state live. Each
window's store merges into the list its own `Memento` holds; if another
window's write has not reached that `Memento` when this window writes, the
whole value this window writes can drop it. The focus re-read narrows the gap
but does not close it; one key per approval row would. Carried rows are
written without the user acting, which makes this residual more likely: a
window with a stale global state can write rows back after a revoke in
another window. Each owner's carry writer runs one write at a time, so in one
process a later carry decides from a list that already holds an earlier
carry's revoke of its orphaned row; two concurrent writes would each take the
other's fresh row as a source and keep revoked content allowed. In IntelliJ,
whose host serialises merges, the core's checks close the revoke race in every
order but one: two other projects carrying the same content within one round
trip of a revoke can each take the other's carried row as its source and keep
the content allowed. A host-side
conditional carry would close it but not the VS Code residual, so the
protocol stays as it is.

**Weaker guarantee than a plugin's.** A bpmn-js plugin runs from a
content-addressed copy of the approved bytes, so a file swapped after the
approval cannot run. A rule package is hashed and run in place: between the
stamp check at the lint's start (or the hash at admission) and the `require`,
a process that can write the workspace's `node_modules` can swap a file, and
the swapped code runs; the next lint's stamp check then blocks the package as
changed. Accepted residuals:

- Phantom dependencies (undeclared, found through hoisting) and requires a
  package makes later, from inside its own code, are Node's and not gated.
- Code already loaded stays loaded until the host restarts, so removing an
  approval takes full effect only then. The revoke lints the host-linted
  editors again, so the gate refuses the package from that lint on, and the
  catalog keeps the packages revoked this session, so the add-on catalog says
  so. A row allowed again at another content is not kept there: the user
  allowed both contents.
- Admission depends on order within a setup: a member resolved before its
  approved closure root was admitted is blocked, and its bundled fallback
  stays cached until the setup is rebuilt.
- Since an approval counts for its content anywhere, the config's own package
  carries over only when the repository's files, apart from models and the
  config, are identical, and its model files, which the hash leaves out, now
  differ across repositories too.
- Rows grow by one per worktree per add-on; rows of deleted worktrees outside
  the open folders are never listed, so nobody forgets them.
- The plugin manifest's name is not in the plugin hash, so identical bytes
  under another name carry over; the bytes served are the approved ones.

**IntelliJ ordering.** The compiled bridge binary lacks
`--compile-autoload-package-json`, so a package whose entry comes from `main`
or `exports` does not resolve in it, and most rule packages with dependencies
fall back to the bundle or are skipped. Adding the flag widens what the bridge
runs from the workspace, so it lands only after the gate
([#2273](https://github.com/Miragon/bpmn-modeler/issues/2273)).

The [gate specs](../../libs/modeler-core/src/modeler/bpmn/adapter/out/bpmnlint/RulePackageGate.spec.ts),
the [linter specs](../../libs/modeler-core/src/modeler/bpmn/adapter/out/bpmnlint/NodeBpmnLinter.spec.ts)
on a temporary folder, the
[fingerprinter specs](../../libs/modeler-core/src/modeler/bpmn/service/PackageClosureFingerprinter.spec.ts)
and the [installed packages contract](../../libs/modeler-core/src/testing/installedPackagesContract.ts)
pin these rules.

Alternatives: Workspace Trust alone (not in the IntelliJ bridge, off in the
standalone, granted once per folder); asking about every blocked package
(asks about packages the bundle serves); running a content-addressed copy of
the closure, as for bpmn-js plugins, recorded as the follow-up if the in-place
window must close. Rejected for now because it changes what works today:
absolute rule references would resolve from the copy, phantom dependencies
would fail closed with no way out for the user, and an asynchronous copy
inside resolution would break the synchronous per-request bracketing that
asking only when needed relies on.

### Transaction boundaries

C7 surfaces render `camunda-transaction-boundaries` as HTML overlays, on by
default through `showTransactionBoundaries`. Upstream 1.1.2 does not make
`show()` idempotent. Its `elements.changed` handler runs `hide()` + `show()`,
so every edit removes and re-adds the overlay of every boundary in the diagram.
That handler is an anonymous closure, so no wrapper can replace it. Debouncing
would still rebuild every overlay once per edit. An incremental update from
`event.elements` misses the former endpoints of deleted or reconnected flows.

The facade calls `show()`/`hide()` from `setSettings()` only when
`showTransactionBoundaries` is present and differs from the service's `active`
state. It shows the boundaries after every import (`loadDiagram()` and
`newDiagram()`), because `diagram.clear` drops the overlays. This reaches npm
consumers too: settings that arrive more than once no longer duplicate the
overlays.

A Yarn patch in the root `resolutions` replaces the rebuild with a diffed sync.
On every change it recomputes all marks in plain JS and touches overlays only
for shapes whose marks or plane changed. Overlays re-checks plane visibility on
add, `root.set` and viewbox changes, but not when a shape changes plane, so a
plane change re-adds its overlays. Classification, placement and HTML stay as
upstream ships them. The
[equivalence spec](../../packages/bpmn-modeler/src/transactionBoundaries.browser.spec.ts)
checks the marks after a chain of edits, undos and redos against a full render.
The patch covers only hosts built here (VS Code, IntelliJ, standalone).
`camunda-transaction-boundaries` is external in `@miragon/bpmn-modeler`, so npm
consumers keep the per-edit rebuild until upstream ships a fix. The
patched-version constraint in `yarn.config.cjs` fails a bump until the patch is
dropped or regenerated. The edit-burst pin in the
[large-model counter spec](../../packages/bpmn-modeler/src/largeModelCounters.browser.spec.ts)
fails if the patch stops applying. Drop the patch once upstream ships the fix.

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
it through one path for palette, keyboard and host triggers, and the editable
handles publish it as `onFormatted`. Preflight, engine
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
View/Design/Implement factories; the entry imports no modeling stack.
`servingSurfaces`, a `Record<SurfaceMode, …>`, names the factory that builds
each mode: on a tagged model Design runs on the Implement modeler. Available
factories and engine determine available modes. A single mode needs no control;
hosts can offer all modes with unavailable Implement disabled for neutral
documents. The strip is a chip on the canvas next to the token-simulation
toggle that opens a mode menu, not a permanent row above the properties panel:
modes are switched rarely, so the control stays small, and living on the canvas
keeps it a single control that stays reachable while the panel is collapsed. Portable mode types, what each mode offers (`surfaceModeSupports`: engine properties, element templates, engine lint rules) and transition planning live in `modeler-types`.
Mode-strip translation keys remain on the i18n overlay's source-only allowlist
because hosts can render the strip before a surface exists for harvesting.

Tagged Design/Implement switches toggle live, so panel input still waiting in
its debounce lands on the same surface. Recreate transitions apply the old
surface's pending properties-panel input, capture view state, export XML,
deliver the old surface's pending `onContentSaved` (internal
`flushContentSaved()`, `PendingSaveHandle`), await `beforeDestroy` (host
flush), destroy the old surface, construct/load the new one and restore plane,
viewport and selection. The save is delivered here because the destroy would
drop it and the new surface's import fires no change that saves the edit again.
Awaiting it keeps the old surface's save ahead of any save from the new one,
and a `ModeSession.destroy()` that waits for the switch resolves only after it.
A session destroyed before the save starts drops it. Bind recreated surfaces
before loading carried XML. The surface fits a fresh open
itself; the host only restores its persisted plane and viewport, on first open
and after a fallback, which carries no snapshot. Recreation loses instance undo
and simulation state.

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
on failure. Every surface (modeler, designer, viewer, diff panes) arms one
shared initial-viewport policy on every import: it fits once the container has
a size and keeps the cached canvas box in sync on resize. An explicit
`setViewport`/`applyViewState`, or a `ViewportManager.centerOnElement` focus,
settles it, so the delayed fit never overwrites restored state; hosts need no
initial fit of their own. Lifecycle primitives live in `modeler-types` so the
restricted `/mode` graph and inlined feature libraries can reuse them.
After `destroy()`, every surface (modeler, designer, viewer, DiffViewer) throws
`NoModelerError` from each member that reaches the diagram or its services,
host pushes included; `setTheme` is the one exception and becomes a no-op.
Host pushes for an optional capability (lint, code-link status, open script
editors) no-op only when the surface was built without that capability, never
because it was destroyed: a use-after-destroy bug stays visible, and hosts
whose pushes can race teardown catch the error.

The modeler, designer and viewer facades delegate shared plumbing (bpmn-js
instance, managers, view state, initial fit, focus, theme) to an internal
`SurfaceCore`; the two editable facades add the `editableSurface` helpers. Each
facade still owns its store, and with it its LIFO teardown order. The three
handle interfaces extend one type-only `BpmnSurfaceHandle` that declares and
documents the members they share (document I/O, view state, theme, `destroy`).
The theme controller lives in `modeler-types` and takes the attribute name, so
the DMN package uses the same one.

Editable surfaces share debounced content-out (300 ms, 1000 ms max wait).
`onContentSaved({ xml })` accepts and awaits `void | Promise<void>`. Catch
export/persistence failures inside each debounced run and report once through
`onError`, or `console.error` if unset, rather than rejecting every queued
caller. Later edits still save. Destruction cancels pending work, settles its
callers and suppresses disposal-race errors. Only a recreating mode switch,
which the embedder did not ask for as a destroy, delivers the pending save
first. `onCommandStackChanged` reports each change undebounced to consumers
that need it, such as the IDE webview's own document sync.

Both editable surfaces replace the properties panel's `debounceInput` service
with `libs/properties-panel`'s `FlushableDebounceInputModule`, which builds the
flushable service from `modeler-types` (the DMN modeler and the Form webview
use the same one). It keeps the library's 600 ms delay and tracks the input
still waiting in it; a flush also runs input a flushed call debounces again,
such as a number field inside a FEEL field. The modeler and designer handles
reach it through the internal `hasPendingInput()` and `flushPendingInput()`
(`PendingInputHandle`), which the IDE webview's flush and a recreating mode
switch use to apply a typed value before they export. They are not public API
yet.

## Consequences and enforcement

The public facade, signatures and declared subpaths require compatibility
discipline; IDE protocol adaptation stays private. Optional surfaces add API
and stylesheet contracts, and the readonly panel adds dependencies to `/viewer`.
The fork, layout alpha, engine descriptors and popup-menu annotation data carry
explicit maintenance costs.

Use [API conformance tests](../../packages/bpmn-modeler/src/publicApi.spec.ts),
[architecture tests](../../packages/bpmn-modeler/src/architecture.spec.ts),
[declaration checks](../../packages/bpmn-modeler/scripts/check-dts.mjs), and
the [design](../../packages/bpmn-modeler/scripts/check-design-pure-entry.mjs),
[mode](../../packages/bpmn-modeler/scripts/check-mode-pure-entry.mjs) and
[plugins-free](../../packages/bpmn-modeler/scripts/check-plugins-free-entry.mjs)
import checks. The
[plugin loader browser tests](../../packages/bpmn-modeler/src/plugins/loadPlugins.browser.spec.ts)
run real scripts through `loadPlugins` and a real bpmn-js modeler.
[Lifecycle browser tests](../../packages/bpmn-modeler/src/lifecycleContract.browser.spec.ts)
exercise all four surfaces, and the
[editable-surface contract](../../packages/bpmn-modeler/src/editableSurfaceContract.browser.spec.ts)
pins that post-destroy lint pushes throw and what the command-stack and format
subscriptions deliver;
[session tests](../../packages/bpmn-modeler/src/modeSession/modeSession.spec.ts)
cover transition failures and teardown. The
[template preview browser tests](../../packages/bpmn-modeler/src/templatePreview/templatePreview.browser.spec.ts)
pin both engines, rejected templates and the engine switch. The test-environment limits and upstream
shape gates are recorded in [Engineering practices](engineering-practices.md).
