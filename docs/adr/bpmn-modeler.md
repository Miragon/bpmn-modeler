# BPMN modeler

- Status: accepted
- Last reviewed: 2026-11-12

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
  - [Allowance per repository and add-on](#allowance-per-repository-and-add-on)
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

A host that holds any of the three surfaces narrows it with the two published
guards, `isModelerSurface` and `isEditableSurface`, from the root and `/mode`,
never with its own `"member" in handle` check. The capabilities follow the two
handle types: only the modeler toggles Design↔Implement and carries the engine
members; both editable handles carry the edit event, a new diagram, format and
clean-up, lint results and the panel's pending input. One guard per handle type
keeps a capability from being checked through different members in different
hosts. Both are generic, so a host's own subtype of a handle (the IDE webview
holds the `BpmnModeler` class) stays narrowed to it. They live in `/mode`'s own
folder and import only types, so `/mode` stays free of surface code.

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
carries no install hint: installing would not help, allowing would. A run in a
workspace the user did not trust says so, and its skipped rules show the
`untrusted` state, which carries no install hint either (see "Host trust below
it" under the allowance).

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
know. Workspace bpmnlint rule packages share the approval list, the
[allowance](#allowance-per-repository-and-add-on) and the question;
[Workspace rule packages](#workspace-rule-packages) records how they differ.

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
| `libs/modeler-core/src/bpmnPlugins` | Discovery, manifest reading, the reload rule, the `PluginCatalog`, the file-cache delivery and the `GetBpmnPluginsCommand` handler | Webview code, host widgets |
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
skipped. A plugin runs once its
[allowance](#allowance-per-repository-and-add-on) holds: the add-on at its
origin, whatever content it has there now. The allowance is kept by the host
outside every workspace (`PluginApprovalStorePort`; VS Code global state, an
IntelliJ application value), so a repository cannot allow itself. The content
hash, a SHA-256 of the script and the style, each prefixed with its length and
a missing style marked apart from an empty one, names only the cache copy that
serves the plugin (see "Serving"); no allowance reads it.

*Store.* Every write is a change, rows to allow and ids to
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
re-read, although `read()` may show it earlier.

*Locator memo.* `WorkspacePluginLocator` keeps a memo per plugin folder and
drops it on a `WorkspacePort.createWatcher` event for that
`<configFolder>/plugins` folder, so an editor open does not reread and rehash
every bundle (Camunda bundles can be several MB). Each reading carries the
plugin's allowance, computed by `AllowanceLocator` when the folder is read, so
the allowance is located again whenever the folder is. The plugin's id stays
the folder as `WorkspacePort` spells it, which is what a 1.21.0 row names; the
allowance comes from that folder's realpath. The feature disposes the
watchers with itself.

`PluginCatalog` is host-neutral and returns values: `pluginsFor(documentPath)`
gives the allowed plugins with their bytes, the pending ones and every one
withheld, `reviewPrompt(pending)` the prompt the domain builds, and
`applyAnswer(pending, answer)` allows the checked ones and records the
declines. A decline is keyed by the allowance key, so it answers every place
of the allowance, and lasts for the catalog's lifetime (the extension host
session); a content change no longer reopens it. The catalog knows no
`EditorSessionStore` or `EditorHandle`, so Orca's worker can answer its frame
from it directly.

`AllowanceState` (`allowed`, `new`, `declined`) in `kernel/domain/allowance.ts`
is the one spelling of the state a piece of workspace code is in;
`isAllowed` is the one rule of whether a row allows it and `pendingAllowances`
the one list of what to ask about, one entry per allowance key with the first
place first, so two worktrees or a hoisted and a nested copy count and list
once. `kernel/domain/listedCode.ts` holds what an owner found for the view
(`ListedPresence`: found, unreadable with its allowance, or gone).
`PROCESS_RESTARTS` in `approvableCodeTexts.ts` names, as a typed host fact, how the
user unloads code that already ran (reload the window, restart the IDE), and
`RulePackageCatalog` keeps the packages revoked this session. The view
protocol names a code add-on's state as `CodeState` (`approved`, `new`,
`declined`) in `addOns/domain/addOnIds.ts`, the three an allowance state maps to.

**Prompt flow.** Per the
[VS Code UX guidelines](../../.agents/skills/vscode-ux-guidelines/SKILL.md), a
list never opens unasked: the spike's QuickPick opened when an editor opened
and took the focus. The editor opens with the allowed plugins at once, and
when plugins are pending the core offers a notification it builds in
`bpmnPlugins/domain/` ("N BPMN plugins in this workspace are not allowed
yet.") with one **Review…** action through the generic
[action notice port](architecture-and-hosts.md#host-integrations). Only
**Review…** opens the review, an `ApprovalReviewPort` each feature takes as
an optional port. Its default, `ListReview` in `kernel/adapter/out/`, opens
the `chooseMany` prompt. Dismissing the notification or the list, or leaving
a plugin unchecked, is the same answer: those allowances are declined
for this session and offered again in a later one; a content change does not
reopen them. A review answers a `ReviewAnswer`: the checked
ids, or `leftForView`, which a review that shows the pending code in a view
returns ([#2250](https://github.com/Miragon/bpmn-modeler/issues/2250)). The
question then settles at once, so the queue does not wait on the view; the
code keeps its state, is not declined for the gate, and no notice asks about
the same allowance again this session. `ViewReview` in `addOns/adapter/out/`
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
by allowance key (`SESSION_ANSWERS` in `kernel/domain/approvalAnswer.ts`,
with `ReviewAnswer`). A catalog that would ask first waits
for the start-up migration of content rows (`ContentRowMigration.whenSettled`,
capped at `CONTENT_ROW_MIGRATION_WAIT_MS`, 10 s), so a second worktree the
migration is about to cover is not asked about; when nothing is pending it
does not wait. The kernel's
`ApprovalQuestion` runs this flow for every approval kind and knows no
editor: one question is open at a time, and plugins found while it is open
are asked afterwards, as far as that answer left them pending. A VS Code
notice can stay unanswered in the notification centre, so dropping them would
leave a second workspace's plugins unasked for the session.
Modules are fixed once a modeler is built, so every change of the approval
list reloads the open BPMN editors it makes stale, whoever made it: the
notice, another IntelliJ bridge's push, or another VS Code window after the
focus re-read. `BpmnPluginsFeature` follows the store's `onDidChange`, and
`editorsToReload` names an editor that serves a plugin no longer allowed, or
was withheld a plugin now allowed, declined ones included. It reads the
allowance state only: a plugin edit reloads nothing, as the next request
copies the new bytes under their new hash, and the migration (allow the
allowance, revoke the content row) reloads nothing, as every place stays
allowed. The delivery records per editor the
plugins it served and withheld, drops the entry on a reload until the page
asks again, and a session participant drops it when the editor is disposed.
The question itself reloads nothing.

**Serving.** The delivery service answers `GetBpmnPluginsCommand` with
`postUnlessHidden`, as element templates do. It copies the allowed plugin's bytes into
a content-addressed cache (`<globalStorage>/bpmn-plugins/<hash>/plugin.js` and
`plugin.css`) and maps them to URLs through `EditorHandle.webviewUrlOf`. Each
hash is copied once per session, editors asking at the same time share that
copy, and a failed copy is tried again on the next request. A copy found in
that memo is checked on disk first and written again when it is not whole,
because another process's prune may have removed it. The copy reads each
cached file back and rewrites it when its bytes differ from the ones read
or cannot be read: a write cut short by a crash would otherwise be served as it
is. Each copy folder also holds a `last-used` marker, the epoch milliseconds
as decimal text, which the copy writes first, so no whole copy lacks one.
Serving a copy writes its marker again at most once a day per hash and
process, so opening editors does not write on every open; a marker write that
fails is logged and the plugin is still served. The marker holds only a time,
so a page may read it: the IntelliJ server serves only
`CACHED_PLUGIN_FILE_PATTERN` (`plugin.js` and `plugin.css`), but VS Code's
`localResourceRoots` covers the whole cache. The webview never
reads a workspace folder, so a file swapped after the copy and a file
beside the script that no manifest names cannot reach it, and `localResourceRoots`
stays fixed at creation. The host passes the cache root as a platform path
(VS Code's `fsPath`, `C:\…` on Windows); the core normalizes it once with
`toWorkspacePath`, so the written path and the URL path agree. VS Code roots
the webview's cache folder at a `file:` URI of that path: desktop VS Code
hands out global storage as `vscode-userdata:`, and a webview serves a file
only below an allowed folder of the same scheme as its URL. A host that does
not wire the feature answers with no plugins. That answer has one home,
`answerWithoutPlugins` in `editorSession/`, built on `postUnlessHidden` like
the delivery's own answer.

**Pruning.** The cache prunes by last use and reads no approval row, as no
allowance row names a hash.
Only folders named like a content hash (`PLUGIN_CONTENT_HASH_PATTERN`, 64
lower-case hex digits, `cachedCopyNames`) are copies; files, other names and
upper case stay. `copiesToPrune` (`pluginCacheLastUse.ts`) keeps every copy an
editor of this process is served (`contentServedByEditors`) and removes the
others whose marker is missing, unreadable or at least the idle limit old. A
marker up to a day ahead counts as used now, since another process can write
one after this one read the clock or run on a clock a little ahead; one further
ahead counts as unreadable, so a marker from a clock that ran far ahead does
not keep its copy for years, and serving writes the marker again once the
clock went back. `PluginCache.pruneIdleCopies` runs at
start-up with an idle limit of 30 days: VS Code at activation, and the bridge
once `server.ts` has bound its streams, which sends no frame. The Add-ons
action "Remove unused plugin copies" runs `pruneUnusedCopies`, whose idle
limit is zero, so it removes every copy no editor of this process is served;
another process that still needs one writes it again on its next request, as
its memo checks the copy on disk. A revoke prunes nothing: a copy is served
only for an allowed plugin, so a revoked plugin's copy ages out. A prune
waits for the copies and marker writes in flight, and neither starts while a
prune runs; a marker write skips a copy this process's prune removed, so a
marker alone never makes an empty folder look used. `PluginCache` takes its
clock as `now` (default `Date.now`), and the domain takes the time as a number.
Pruning on every approval change was rejected: until then the next start's
prune covers the shared cache, and N bridges pruning at once only adds noise.
Residual: a page that loads between another process's delete and this
process's memo check leaves the plugin out once, and the next open writes the
copy again; a marker written in that gap leaves a folder with only a marker,
which the next request completes or the idle limit removes. VS Code writes a
file in place, so a prune in another window can read a marker being rewritten
as empty and remove a copy an editor there was just served; that editor lacks
the plugin until it asks again, which writes the copy again. An atomic write in
`VsCodeWorkspace` would close it but changes every write of that adapter.

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
  reuse; it is no boundary against an allowed plugin. CEF's message router
  keeps the query function on `window` in every page context, so a plugin can
  call it and post to the JVM and, through it, to the bridge. It can also read
  the host's messages, which arrive as `window.postMessage`, and patch the
  built-ins the shim calls per message (`JSON.stringify`) to read the page's.
  An allowed plugin has the page's full authority, as in VS Code; the allowance
  is the control.

**What an allowed plugin can do.** It gets the modeler's injector, so it can
edit the diagram (edits sync to the file) and call every DI service, including
those holding host ports (navigation, clipboard, script editors). The BPMN
webview's `img-src https:`, needed for element-template icons, lets it send
data out through image URLs. The allowance is the control; a tighter CSP cannot
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
`RulePackageInventory`) that finds and places their code, locates its
allowance and answers for it as their notices do, says what it can do once allowed, what follows an
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
`AddOnsFeature.attachPanel(post, visible, { shows })` serves the add-ons view
protocol of `libs/shared` (`addOnsView.ts`) for one page through
`AddOnViewMessages` in `addOns/adapter/in/`, so a host only passes a `post`
and the page's commands; with `shows` the page is a detail tab's, which shows
that add-on (`show()` moves it to another) and takes no reveal, so a reveal
reaches only lists. `OpenAddOnDetailCommand` from a list calls the host's
optional `AddOnDetailPort` with the add-on's id and its tab title, for an add-on
the last model lists; a host without the port never serves a page that posts
it. `panelRoutes` answer the surface coverage before any page attaches.
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
reveal. The core knows no sections: the page maps `needsReview` to the whole
list, its search and filter cleared, its selection kept when it waits for a
review, else the first add-on of Needs attention that does, and says how many
wait to a screen reader. **Review Add-ons** is
host-first, the host shows its view and then asks the core, because the
IntelliJ tab must open at once while a cold bridge still starts; **Review…**
stays core-first through `AddOnViewRevealPort`, because there the core decides
whether a view can show the rows. The list selects on its own only a row it
shows, never one a closed header hides
([the page](architecture-and-hosts.md#package-boundaries)).

- *Scope.* It lists the open workspace only: the root config folder's
  `plugins/` and `element-templates/` of every workspace folder, the nested
  config folders an editor or a listing already looked in (for templates, the
  templates folders an open editor loaded), each folder's `node_modules` and the
  `node_modules` of each lint config read so far inside one, and the packages
  the gate reported. Rows are not listed: an allowance names an add-on, not a
  folder, and one whose add-on this folder lacks has no row to show (see
  "Read model" under the allowance). `addOnScope` in `addOns/domain/` decides
  what to read; the reader only fetches, and hashes nothing. Add-ons group by the
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
  state (`allowanceStateOf`, the same reading as the notices: allowed, new or
  declined this session, shown through `VIEW_STATE` as the protocol's
  `approved`, `new` and `declined`), and the actions a row offers from one
  table keyed by what the owner read and that state (`CODE_ACTIONS`):

  | Presence | allowed | new | declined |
  | --- | --- | --- | --- |
  | found | Revoke | Allow | Allow |
  | unreadable | Revoke | none (the problem says why) | none |

  A gone presence is not listed. Every row that offers Allow carries the
  review: what the code can do (`allowWarningText`, which says how far the
  allowance reaches for the row's origin) and the facts Folder, Version (a
  rule package) and Allowed in (`allowedInText`: every worktree of the
  repository folder, with the host when it is not local, or this folder
  only). A rule package is named `name@version` (`rulePackageLabelOf`) and has
  no detail; a plugin's detail is its folder below the config folder. A view
  shows its own state labels (`CODE_STATE_LABEL`: Allowed, Not allowed yet,
  Declined this session). The view id stays per place
  (`addOnIdOf(kind, place)`), so revisions and reveals do not change; the
  allowance rides in `ShownCode` only, and two worktrees' rows of one add-on
  change state together. A listing that throws is logged and still reaches the
  views: `failedCatalogOf` keeps the model shown before, under its own
  revision so an allow against it holds, with a `problem`, or without one
  sends a new revision that lists nothing and says why. A view's request is
  untrusted: `addOnRequestOf` keeps only a known kind with the fields it
  names, and anything else, a retired `inspect` among it, is refused as not
  offered. Rule package ids
  come only from the workspace folders' `node_modules` and from what the gate
  reported in this process, so the config's own package is listed once a lint
  reported it, or while a `node_modules` entry links to it. Residual: after a
  restart an allowed config's own package is missing from the view, and
  cannot be revoked there, until a lint reports it. Ids are only looked up in
  what the core recorded, never parsed.
- *Allow by the shown allowance.* Each build has a revision, counted from the
  clock so a view kept across a respawn never names one the new process
  used, and `ShownRevisions` keeps what the last sixteen showed and which
  actions each row offered, never sent. An allow names the revision and is
  refused unless that revision offered it; the allowance comes from what that
  revision showed, never from a payload. The owner reads the place again
  (`current(id)`), and `allowDecisionOf` refuses the allow when the place is
  gone or cannot be read, and as `staleView` when it now resolves to another
  allowance key (the folder moved into or out of a repository, or its `.git`
  changed); otherwise it allows the shown allowance in one step
  (`allowingAllowances`). A revoke is refused unless the latest revision
  offered it, and a disposed view's requests are refused.
- *Revoke.* Revoke takes back the allowance the row showed. It first waits
  for the start-up migration (`whenSettled`, capped), as the migration could
  otherwise write back the allowance it takes. It then records `leftForView`
  for the allowance key in this process, before the change whose reload or
  relint would ask at once, so no notice here asks about any place of it.
  From `readStored()` it revokes, in one change (`revokingAllowance`), the key
  and, only where the host is local, every content row of the kind at the
  shown place or located to the same key (`ContentRowMigration.locate`), each
  id once. There is no sweep after the change and no owner callback: the
  stores record the change before it resolves, and `RulePackageCatalog`
  records each revoked id in its change listener. Other windows and projects
  reload or relint and ask again: the user withdrew trust. The reload or
  relint follows the change event, as for a notice. The plugin owner leaves
  its cache alone, as a revoked plugin's copy ages out (see "Pruning"); a rule
  package row then says its code stays loaded until the user reloads the
  window or restarts the IDE. "Remove unused plugin copies" answers a prune
  that fails as `failed`, with the core's text, and logs why.
- *Builds.* Only while a view is visible, one at a time with a dirty flag, each
  from `readStored()` of the approvals and the template switches, so an
  unseeded IntelliJ mirror never makes every row look new; in VS Code a view shown again shows what this window's global
  state holds (see the multi-window residual under "One question at a
  time"). A build writes nothing. A change of the
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

#### Allowance per repository and add-on

Decided 2026-11-11 ([#2345](https://github.com/Miragon/bpmn-modeler/issues/2345)).
Plugins, rule packages and the Add-ons view decide by it: whether code runs,
what the notices ask about, what the view lists and what Allow and Revoke
write.

**Context.** Until VS Code 1.21.0 a rule package ran with no question beyond
Workspace Trust. 1.21.0 asks per folder and content, so every git worktree
asks again, and one worktree per agent task makes that a question per task.
Carrying an approval to byte-identical content elsewhere removed the question
only for identical bytes: a branch with another dependency version, a package
an agent edited and a pull that updates a package still asked. Its rows stayed
per folder, with three costs: allowing new content at a folder dropped the old
content, so switching back to a branch asked again; rows grew by one per
worktree per add-on; and rows written without the user caused revoke races.
The question about changed content also came right after the user's own pull
or install, about files nobody reviews, so it was answered with Allow. The
defence against a bad update is the lockfile, the registry's integrity check
and the review of the update, none of them the modeler's.

**Decision.** An allowance names an add-on at its origin, not its content:
`{ kind, host, origin, addOn }`. It holds for whatever content the add-on has
there, now and later, and the question says so (`ALLOWANCE_COVERS_TEXT`).

- *Origin of workspace code* is the repository that holds it: the realpath of
  the git directory that all worktrees of one clone share (git's common
  directory). Code in no repository has its own folder as origin, which is the
  1.21.0 unit without the hash.
- *Host* is the remote the code was found on, `LOCAL_HOST` (empty) locally.
  VS Code keeps its global state on the client, so one list can hold rows of
  several remote machines or dev containers, and two of them can hold a
  repository at the same path. The VS Code host part is `originHostOf`
  (`apps/vscode-plugin/src/shared/domain/`): empty when `env.remoteName` is
  undefined, else the authority of the first `vscode-remote` workspace folder
  (`ssh-remote+box`, `dev-container+<hex>`, `wsl+Ubuntu`), which tells two
  machines or containers apart and survives a container rebuild, else
  `remoteName`. It is computed once at activation, as a window changes its
  authority or first folder only through an extension host restart; a wrong
  guess fails towards asking. The IntelliJ bridge runs on the machine that
  holds the project, so its host is always empty.
- *Add-on* is the code's place in the repository, spelled so that an update
  keeps it. A plugin: its folder path below the worktree root. An installed
  rule package: the path below the worktree root up to the first
  `node_modules`, and the package's name. The realpath itself would not do:
  pnpm's `.pnpm/<name>@<version>` segment makes every update a new path. A
  hoisted copy and a nested copy of one name therefore share an allowance. A
  linked package and the config's own package: the folder path. Code in no
  repository has an empty add-on, as its origin already names it.
- *Origin of installed code* (marketplace plugins,
  [#2243](https://github.com/Miragon/bpmn-modeler/issues/2243) and
  [#2317](https://github.com/Miragon/bpmn-modeler/issues/2317)) is the
  marketplace link, and the install step picks the commit. Enabling is the
  allowance. Nothing is per folder, as with that epic's cache keyed by commit.

A worktree of an allowed repository therefore asks nothing, whatever its
branch holds. A new add-on, another repository and a second clone ask once.
Two worktrees of one repository in one window share one key: the notice and
the list count the add-on once, one answer writes one row, a decline or
`leftForView` answers both places, and the other worktree's editors reload or
relint.

**Finding the repository.** A wrong answer makes one allowance cover foreign
code, so the rule fails towards "no repository". From the add-on's realpath,
the nearest folder upward that holds a `.git` entry is the worktree root.

- A `.git` that is a directory and not a link is the common directory.
- A `.git` file is a linked worktree only when both hold: the folder its
  `gitdir:` line names is a direct child of `<common directory>/worktrees/`,
  where the common directory is what that folder's `commondir` file names; and
  that folder's `gitdir` file names this `.git` file back. The first check
  stops a `.git` file that points at an administrative folder of its own
  making, the second one that points at another worktree's.
- Anything else is no repository, and the add-on's folder is the origin: a
  `.git` that is a link, a submodule, `--separate-git-dir`, another version
  control system.

The remote URL is never read, as any repository can claim any URL. Git is not
run: the domain decides from file facts a port reads. The realpath comes
first, so a plugin folder reached through a link takes its target's origin
and place, and a repository never covers foreign code through a link; the
plugin's id stays the link path, which a 1.21.0 row names. A path that Node
cannot read (a virtual workspace folder) is a folder origin at the path as
given, which covers no code elsewhere.

**Rows.** The domain type is the allowance; one mapper turns it into the
hosts' stored `{ pluginId, contentHash }`. `pluginId` holds the key of kind,
host, origin and add-on, and `contentHash` the marker `allowance-v1:<kind>`,
which names the rule the row was given under. The VS Code global state, the
bridge protocol, the Kotlin store and the merge (`approvalsAfter`,
`codeApprovalChange.cases.json`) stay as they are, and an older build reads
such a row as matching nothing. Every allow goes through
`allowingAllowances`. Rows no longer grow per worktree: at most one per
add-on per repository.

- *Content rows.* A row pinned to content, as 1.21.0 stored it (`pluginId` a
  folder, `contentHash` a hash), still allows the add-on found at that folder,
  whatever its hash, so nobody is asked again while it waits to be rewritten.
  A content row counts, is migrated and is revoked only where the host is
  local (local VS Code windows and IntelliJ): it names no host, and in a
  remote window it may have been given on another machine at the same path.
  This holds even if VS Code's global state turns out not to be shared
  across remotes. The cost is one question per add-on per remote for a
  1.21.0 user of remote windows.
- *Migration.* `ContentRowMigration` rewrites, in one change, every local
  content row whose folder it can locate as the allowance of the add-on there
  (`contentRowMigrationOf`), and revokes the rows it rewrote. It runs once per
  host process: at VS Code activation, right after the plugin cache prune and
  before any editor is registered, and in the bridge once `server.ts` has
  bound its streams, after the prune, since it sends `pluginApprovals/read`
  and possibly `pluginApprovals/change`. It decides from `readStored()` and
  writes without awaiting anything in between, logs one line, and logs a
  failure and settles anyway; the next start tries again. A row whose folder
  it does not find stays: the list may serve several machines, and a folder
  gone here may exist on another. Every VS Code window and IntelliJ bridge
  runs it, and it is idempotent: a stored key is not allowed again, revoking
  a gone id does nothing, and the IntelliJ host serialises the bridges'
  changes. These are the only rows written without the user.
- *Waits.* Three callers wait for the run, each capped at
  `CONTENT_ROW_MIGRATION_WAIT_MS` (10 s) through `whenSettled`:
  `PluginCatalog.pluginsFor`, only when something is pending;
  `RulePackageFollowUp` before it asks; and Revoke in the view. The lint
  itself never waits: a lint during the run may be blocked, and the run's
  change relints it. The cap exists because `pluginApprovals/change` is a
  synced write without a deadline. When it passes, waiters go on, and the
  legacy rule still allows each content row's own place.
- *Revoke.* `revokingAllowance(code, stored, located)` revokes the key and,
  only where the host is local, every content row of the kind at the shown
  place or located to the same key (`ContentRowMigration.locate`), each id
  once, since a change that names an id twice is refused.

**Where the rule lives.** `kernel/domain/`: `repositoryIdentity.ts` reads the
git files' facts into a `CodeOrigin`; `approvalRowKind.ts` is the one reading
of a row's kind and format, which every feature uses to pick its rows
([#2285](https://github.com/Miragon/bpmn-modeler/issues/2285));
`allowance.ts` builds the allowance, its key and row, its state (allowed, new
or declined this session), the pending list (`pendingAllowances`), the
outcome of a review and the changes; `contentRowMigration.ts` rewrites rows
pinned to content; `listedCode.ts` holds what an owner found for the view;
`workspacePath.ts` holds `fileSystemPathOf`, which strips the slash before a
drive letter (`/c:/x` to `c:/x`), so both hosts' `NodeInstalledPackages` and
`NodeBpmnLinter` read the `/c:/…` ids `VsCodeWorkspace` spells on Windows,
and `withLowerCaseDrive`, which the allowance key and the linked worktree
check use: VS Code lowercases the drive letter, git and Node's
`realpathSync` keep the case they were given, so a linked worktree whose git
files spell `C:` still resolves to the repository VS Code spells `c:`.
`kernel/service/`: `RepositoryLocator` gathers the facts through the
synchronous `RepositoryFilesPort` (`realPath`, `entryKindOf` without
following a link, `readTextFile`), which `InstalledPackagesPort` extends, so
both hosts' `NodeInstalledPackages` serve it; `AllowanceLocator` is the one
place an allowance is computed from disk (realpath, then origin, then host),
without a memo, as each caller keeps its own (the plugin reading per folder,
the gate per setup, the view per build); `ContentRowMigration` runs the
migration and locates content rows for Revoke.
`describeRepositoryFilesContract` pins the adapters and the in-memory fake,
and a spec runs the locator on worktrees that git itself wrote. Each host
process builds one `NodeInstalledPackages`, one `AllowanceLocator` and one
`ContentRowMigration` (see [Architecture and hosts](architecture-and-hosts.md#host-integrations)).

**No hash for a rule package.** The closure hash, its fingerprinter, size
limits and refusals, the states `changed` and `gone`, the carried rows and the
content revoke with its sweep are gone. What can be allowed stays
(`ruleModuleRootOf`: an installed package root or the config's own package).
The gate admits a root whose allowance holds. Each root bpmnlint requests
needs its own: a dependency that is itself a rule package no longer rides on
the package that declares it, so a config that extends `plugin:a`, which
extends `plugin:b`, asks about both the first time. A lint setup records the
stamp of each admitted root's `package.json` and of the unresolved lookup
path's `package.json` (`rootStampPathsOf`; `stat` follows the link, so a
retargeted pnpm link stamps differently), and is rebuilt when one changes. On
admission in the new setup, a root loaded before under another manifest stamp
has every `require.cache` entry within its eviction scope deleted
(`evictionScopeOf`: the `node_modules` the root is installed in, or the root
itself for the config's own package and a linked package, which keep their
own `node_modules` inside). A hoisted dependency lives beside the root, not
inside it, so evicting only the root would run the new root against the
cached old dependency; the cost is reloading sibling packages once per
update. An update that rewrites the root's `package.json` therefore loads
without a reload; an edit that leaves every stamped `package.json` alone
loads after one. A pnpm update links `node_modules/<name>` to a new
`.pnpm` folder, but Node and Bun keep a resolution and a link's target for
the whole process, so a fresh scoped require still answers with the old
folder, gone or not; the gate moves such an answer to the current folder (see
"Gate"). Only such an update that leaves no file where the entry or a
rule lay, because it moved one, needs a reload. The gate, the question, the
log and the Add-ons view name a rule package as `name@version`
(`rulePackageLabelOf`), so an update shows without a question.

**A plugin keeps its hash for serving only.** The content-addressed copy and
the cache stay, so the page still never reads a workspace folder.
`editorsToReload` reads the allowance state only. No row names a hash any
more, so the cache prunes by last use (see "Pruning" under User-supplied
plugins), the rule #2317 needs for its shared cache too.

**Read model.** A found add-on is allowed, not allowed yet or declined this
session, and offers Allow or Revoke; an unreadable one offers Revoke while
its allowance holds, else nothing. "Review…" as a hashing step, "Allow this
content" and "Forget" are gone, and an allow does not wait on a hash: it
names the allowance the revision showed and is refused when the place is
gone, cannot be read or now resolves to another allowance. Revoke removes the
allowance, so every worktree of the repository asks again. The notices and
the view list what is pending once per allowance key (`pendingAllowances`;
the rule package queue dedupes by key too). An allowance whose add-on this
worktree does not hold is not listed: an add-on that only one branch has is
missing from the others, and a Revoke there would take it from the worktree
that has it.

**Host trust below it.** The allowance stays the host-neutral gate, because
host trust has gaps: the standalone turns it off, VS Code treats an empty
window as trusted, and Orca has no workspace. Host trust comes first: in a
workspace the user did not trust, no plugin is served and no workspace rule
package runs, whatever its allowance, nothing asks to allow one, and the
Add-ons view offers no Allow for a code add-on and says why in the row's
problem (`UNTRUSTED_WORKSPACE_TEXT`); Revoke stays. The rule has one home,
`kernel/domain/workspaceTrust.ts`: `runsInWorkspace`, which the plugin
catalog and `editorsToReload` apply, and `offersAllowInWorkspace`, which
`askedInWorkspace` (the plugin and rule package catalogs) and the add-on
catalog's actions and problem apply. An untrusted linter builds no rule
package gate, so it asks the workspace for nothing and lints with the bundled
rules alone; the gate it builds when trusted applies the allowance. A rule of a
workspace package is skipped, and the run says it was untrusted, so the status
bar shows the `untrusted` state (`BPMNlint: N rules skipped`, with a tooltip
that the workspace's rule packages wait for the user's trust) instead of the
install hint of `unresolved`. The core reads the trust
through `WorkspaceTrustPort` (`kernel/port/hostPorts.ts`), which the
plugins, rule packages and add-ons features take as an optional
`workspaceTrust`; a host that wires none is trusted (`TRUSTED_WORKSPACE`),
which suits Orca and npm consumers, as they run no workspace code. A change
of the trust reloads the editors whose plugins it changes, lints every
host-linted editor again and rebuilds the view, without a restart. An editor
that requested its plugins while the workspace was untrusted was asked
nothing, so a grant asks about the plugins the open editors withhold, as the
relint does for rule packages; an editor the grant reloads asks on its own
request.

In VS Code the extension declares no support for untrusted workspaces, so it
does not run in Restricted Mode; `VsCodeWorkspaceTrust` answers
`workspace.isTrusted` and follows `onDidGrantWorkspaceTrust`, as VS Code
reloads the window when the user withdraws trust. The standalone turns
Workspace Trust off, where `isTrusted` is true. The IntelliJ plugin reads
`Project.isTrusted()` and follows `TrustedProjectsListener.TOPIC`; both are
experimental API in the 2024.2 floor, and `isTrusted()` is deprecated but
present in 2026.1, where `verifyPlugin` reports both as compatible. The bridge
mirrors it, untrusted until the host says
otherwise (see [Architecture and hosts](architecture-and-hosts.md#host-replicated-state)).
IntelliJ counts a project it never asked about as not trusted, as
`isTrusted()` answers only a trusted state, so such a project runs no
workspace code until the user trusts it or adds its folder under Trusted
Locations. A Trusted Locations change announces nothing, so it reaches the
bridge with the next editor, the next spawn or **Refresh** of the Add-ons
tab.

Accepted:

- Whoever can change the files of an allowed repository (a pull, an install,
  an agent in a worktree) changes code that runs with the user's rights, as
  for every tool that runs under host trust, and an untrusted branch in a
  worktree of an allowed repository the user trusts runs its version. "Any
  change asks again", which the 1.21.0 user guide promised, ends, and the
  release notes say so.
- A rule package that ran before the user withdrew trust stays loaded in the
  process until it restarts; it runs no rule after the relint.
- A rule package runs in place and unhashed, so the swap window under "Weaker
  guarantee than a plugin's" is no longer a residual but the rule.
- An archive unpacked into an allowed repository without a `.git` of its own
  belongs to that repository. Its add-ons ask unless they sit at an allowed
  add-on's place.
- A repository cloned at a deleted one's path inherits its allowances, and a
  stale content row at an exact path is honoured and migrated. The origin
  carries no stamp against this; VS Code Workspace Trust is keyed by path too.
- A 1.21.0 content row whose folder now holds other content allows it and is
  migrated as the allowance there.
- The migration revokes the content rows it rewrites, so a downgrade to
  1.21.0 reads the allowance rows as nothing and asks again; the release
  notes say so.
- A second clone asks once. A submodule, a `--separate-git-dir` checkout and
  other version control systems ask per folder, and without git a pnpm update
  asks again, as the package's folder changes. On Windows the key folds only
  the drive letter's case: a folder that two hosts or git spell in another
  case beyond the drive gives another key and asks once more.
- Rows of deleted repositories stay; no view lists them. An allowance of an
  add-on removed from the repository cannot be revoked from the view.
- A hoisted and a nested copy of one rule package share an allowance.
- Revoke does not reach everywhere at once: across IntelliJ bridges at the
  first start after the update, another bridge's migration can write the
  allowance back within one round trip between its read and its change; a
  second VS Code window that migrated from an older snapshot can do the same;
  and when the 10 s cap passes on a hung host, a waiter goes on before the
  migration landed.
- A notice answered after another project or window allowed the add-on shows
  a stale list; the answer is harmless, as allowed wins.
- The VS Code multi-window residual stays for the user's own writes.

Alternatives: per folder and content (1.21.0: every worktree asks); same
content anywhere (the context above); repository and content (asks in every
case same content anywhere asks in, and in a second clone); repository and
declared version (the same click-through, with the package's rules skipped
until it is answered; worth it only as a documented control, and it can
become an opt-in setting on this model); host trust alone (the gaps above);
the remote URL or an id file in the repository as its identity (a repository
would allow itself); a stamp of the repository in the origin against path
reuse (a re-clone or a moved checkout would ask again).

#### Workspace rule packages

Host linting loads `bpmnlint-plugin-*` packages from the workspace
([#2247](https://github.com/Miragon/bpmn-modeler/issues/2247)). Unlike a
bpmn-js plugin, a rule package runs in the extension host or the bridge with
the user's rights. The standalone turns Workspace Trust off, so a rule
package, like a bpmn-js plugin, runs only once its
[allowance](#allowance-per-repository-and-add-on) holds, and only in a
workspace the host trusts (VS Code's Workspace Trust, IntelliJ's trusted
projects). A host opts in with the
optional `rulePackages` group of `BpmnEditorFeature` (`BpmnRulePackagePorts`:
the approval store, an `InstalledPackagesPort`, the `AllowanceLocator`, the
content row migration, the action notifier, the shared `QuestionQueue` and
the optional `workspaceTrust`).
VS Code and the IntelliJ bridge wire it with the store, the
`NodeInstalledPackages` and the locator the plugins use; one contract suite in
the core's `testing/` pins both adapters. Without the group,
`NodeBpmnLinter` builds no workspace resolver at all.

**Unit and row.** The gate decides per installed package root: the realpath
of the `node_modules/<name>` or `node_modules/@scope/<name>` folder a require
resolved into, taken at the last `node_modules`, so a nested copy is its own
root for ids, stamps and eviction, though it shares the allowance with the
hoisted copy. A pnpm `.pnpm` path and the target of a `file:` link are
realpaths like any other. The config's own package, whose `package.json`
names the requested plugin so that bpmnlint requires `.`, is the config
folder; it needs an allowance like any other root, because the repository
picks the name. Any other root is refused, logged and never offered: the
folder an absolute rule reference points into, or a `file:` link whose target
holds the config folder, would make one allowance cover the repository. The
root's allowance names its place (see "Add-on" above), and its row is the
existing `{ pluginId, contentHash }` with `contentHash`
`allowance-v1:rulePackage`, in the host's one approval list beside the
bpmn-js plugins. A 1.21.0 row, `bpmnlint-closure-v1:<hash>` at a root, still
allows that root until it is rewritten. The row round-trips through VS Code's
global state, `RpcPluginApprovalStore` and the Kotlin `PluginApproval`
unchanged, so neither the protocol nor the IntelliJ plugin changed.
`rulePackageApproval.ts` owns the root, the move to the current folder, the
blocked package, the stamps, the eviction scope and the notice and list
texts; `rulePackageLog.ts` owns the
output channel lines; `installedPackage.ts` reads manifests, dependency
candidates and path stamps.

**Manifest stamp.** A lint setup records, per admitted root, the stamp
(device, inode, size and modification and change times) of the root's
`package.json` and, when the root was reached through a package name, of the
unresolved lookup path's `package.json` (`rootStampPathsOf`). `stat` follows
the link, so a pnpm update that retargets the link stamps differently even
when the old `.pnpm` folder survives. At the start of every lint, the
linter's setup checks those stamps (`isUnchanged`, stats only) and is rebuilt
on a mismatch. The check sits at the lint's start, not at the gate, because a
cached setup answers later lints from its `resolved` map without calling the
gate. Nothing watches `node_modules`: VS Code's watcher excludes it by
default, and the check costs one or two stats per admitted root per lint.

**Gate.** `RulePackageGate` wraps the scoped require that bpmnlint's
`NodeResolver` loads packages with. Each call resolves the request, admits
built-in modules and `.json` data without an allowance, maps the realpath to
its root and lets the require run only when the root's allowance holds:
`allowanceStateOf` against the setup's rows and the declines of this session.
It takes the allowances through a structural interface (what it needs of
`AllowanceLocator`, as an adapter imports no service) and memoises each
root's allowance per gate, so per setup. Otherwise the gate records the
package as blocked (`new` or `declined`), with its name, version and
allowance, so the catalog can ask without reading anything, and throws
`MODULE_NOT_FOUND`, which the resolvers' catches turn into a miss: the
bundled rule or a no-op. A file whose path below the root has a `.git`
segment is refused, as no allowance covers it; a model file of the config's
own package runs under its allowance like every other file at its place. The
gate is synchronous, since `require` cannot wait, and uses no module loader
hooks: the bridge runs on Bun, which does not fire them. The setup's key holds
the config and the sorted rule package rows (`rulePackageApprovalsKey`, which
reads both row formats), so an allow, a revoke, the migration or an IntelliJ
`pluginApprovals/didChange` with a newer list builds a new setup, and no
bundled fallback cached before the allow shadows the allowed package. When a
root is admitted under another manifest stamp than the one it was last
loaded under (`loadedManifestStamps`, kept across setups by
`NodeBpmnLinter`), the gate evicts every `require.cache` entry within
`evictionScopeOf(root)`, so the updated bytes, and those of its hoisted
dependencies, run.

*Current folder.* Node's resolution cache (`Module._pathCache` and the
loader's realpath and `package.json` caches) and Bun's are per process and
see no retargeted link. The gate touches neither, as Bun has no such
internals. It looks the requested name up itself (`dependencyCandidates` from
the config folder, with the port's uncached `realPath`) and takes Node's
answer only inside the folder that lookup path leads to now
(`currentResolutionOf`). When the lookup path is a link, an answer in another
root of the same package, such as the old `.pnpm` folder, moves to the same
path below the current folder: for a bare request, for an absolute path into
the old folder and for the gate's own `resolve`, so NodeResolver's
`dirname(require.resolve(pkg))` names the current folder for a rule its
`rules` map names by a local path. The same package is the requested name or
the name the current store folder carries, as pnpm stores an alias under the
package's own name. An answer outside every `node_modules`, left by a `file:`
link the name no longer leads to, has no root to move from, so a bare request
is looked up again in the current folder. So is a request Node fails with
`ENOENT` or `MODULE_NOT_FOUND`, as its cached target misses a file only the
new folder holds; an `exports` refusal stands. Such a lookup
(`currentFolderRequestOf`) joins the subpath to the current folder, or, when
the current `package.json` has `exports`, resolves the package's own name
from inside that folder (`requireFrom`), so Node applies the new `exports`
instead of those it cached for the link; an answer outside the current folder
is dropped. Admission, the allowance, the stamps and eviction then apply to
the current folder, which keeps the add-on place `node_modules/<name>`, so the
update runs under the same allowance. When the current folder has no file at
that path, because the update moved the entry or a rule file, the gate
refuses the module (`movedByUpdate`) and the log asks for a window reload or
an IDE restart; it never runs the old path. A move drops the old root's
`require.cache` entries, which nothing requires again, so updates do not pile
up versions in the process; only the root, as its dependencies are links into
store folders the new version may share. A lookup path that is a folder of
its own has no earlier target, so a nested copy in `node_modules` stays its
own root. An npm update in place keeps the folder, so the gate keeps Node's
answer there. A folder npm installs in place of a `file:` link keeps the
link's path, which Node's realpath cache still maps to the linked folder, so
its files are refused (`movedByUpdate`) until a reload.

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
one question per allowance key stays queued until it is answered
(`rulePackagesToAsk`, first per key), and it is asked once the start-up
migration settled. Nothing is hashed, and the lint run reports only results,
unresolved names, blocked packages and refused modules. Relints follow
the approval store, not the question: `RulePackageCatalog` announces each
change of the rule package rows, whoever made it, as a `CodeApprovalChange`,
records every revoked id, and `RulePackageFollowUp` lints again
`editorsToRelint(change)`. An allow relints every open editor whose last host
lint was blocked on some package; a revoke relints every editor linted on the
host (`lintsOnHost`, which counts a first host lint in flight), so the
withdrawal reaches the loaded code wherever it ran; each editor once, and
relints are cheap. The migration therefore relints the host-linted editors
once. Closing an editor forgets it, and `BpmnLintConfigService.dispose`, which
`BpmnEditorFeature.dispose` calls, stops following. `RulePackageCatalog`
keeps declines by allowance key for its lifetime, never asks about a package
left to the view, and exposes the declines read-only to the gate, which then
reports a package as `declined` rather than `new`. The notice and the list
have their own ids (`bpmnlintPackageApprovalNotice`,
`bpmnlintPackageApproval`), and the list says that a rule package runs as a
program with the user's rights; an item is `name@version`, and the config's
own package says it is the package the `.bpmnlintrc` sits in.

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
but does not close it; one key per approval row would. The only rows written
without the user are the migration's, once per process at start, and Revoke
waits for this process's run, so the remaining races are the ones listed
under the allowance's Accepted list: another IntelliJ bridge's first run
after the update within one round trip, a second VS Code window that
migrated from an older snapshot, and the cap passing on a hung host.

**Weaker guarantee than a plugin's.** A bpmn-js plugin runs from a
content-addressed copy of the bytes read for the request, so a file swapped
after the copy cannot run. A rule package runs in place and unhashed: that is
the rule, not a residual. Accepted:

- Phantom dependencies (undeclared, found through hoisting) and requires a
  package makes later, from inside its own code, are Node's and not gated;
  they run under the package's allowance.
- An edit that leaves every stamped `package.json` alone, and a dependency
  outside the root's eviction scope, load only after a window reload or an
  IDE restart.
- Each root bpmnlint requests needs its own allowance, so a dependency that
  is itself a rule package asks too.
- Code already loaded stays loaded until the host restarts, so removing an
  allowance takes full effect only then. The revoke lints the host-linted
  editors again, so the gate refuses the package from that lint on, and the
  catalog keeps the packages revoked this session, so the add-on catalog says
  so.
- Admission depends on order within a setup: a package resolved before the
  root that would admit it is blocked, and its bundled fallback stays cached
  until the setup is rebuilt.

**IntelliJ ordering.** The compiled bridge binary lacks
`--compile-autoload-package-json`, so a package whose entry comes from `main`
or `exports` does not resolve in it, and most rule packages with dependencies
fall back to the bundle or are skipped. Adding the flag widens what the bridge
runs from the workspace, so it lands only after the gate
([#2273](https://github.com/Miragon/bpmn-modeler/issues/2273)).

The [gate specs](../../libs/modeler-core/src/modeler/bpmn/adapter/out/bpmnlint/RulePackageGate.spec.ts),
the [linter specs](../../libs/modeler-core/src/modeler/bpmn/adapter/out/bpmnlint/NodeBpmnLinter.spec.ts)
on a temporary folder with a git worktree layout, the
[installed packages contract](../../libs/modeler-core/src/testing/installedPackagesContract.ts)
and the Bun smoke (`apps/modeler-bridge/scripts/rule-package-gate-smoke.ts`)
pin these rules.

Alternatives: host trust alone (off in the standalone, granted once per
folder or project); asking about every blocked package
(asks about packages the bundle serves); running a content-addressed copy of
the package and its dependencies, as for bpmn-js plugins, recorded as the
follow-up if the in-place window must close. Rejected for now because it
changes what works today: absolute rule references would resolve from the
copy, phantom dependencies would fail closed with no way out for the user,
and an asynchronous copy inside resolution would break the synchronous
per-request bracketing that asking only when needed relies on.

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
their error reporting. `DiffSide` and `DiffCounts` are defined in that library and
re-exported type-only where compatibility requires it.

`navigationOrder` is the order a stepper walks. It leaves out a connection whose
only change is layout: an element drawn by a `bpmndi:BPMNEdge` (sequence or
message flow, association, data association) that is in `layoutChanged` but not
in `added`, `removed` or `changed`. Such a connection moves with its shapes, so
it stays in `layoutChanged` and `counts` and is highlighted, but it is no stop of
its own. The rule has one home, `layoutOnlyEdgeIds` in `drawnEdges.ts`, which
takes the four id lists and an edge predicate. `computeDiff` asks it with the
edges in the parsed DI of both versions, so every consumer of `/diff` and the
core's `BpmnDiffService` get the same order; the [DMN diff](dmn-modeler.md#diff)
asks it with the requirements and associations of both versions. A consumer
that read `navigationOrder` as every changed id sees fewer stops.

Both diffs share one vocabulary in `libs/modeler-types/src/diffVocabulary.ts`:
`DiffCategory` (`keyof DiffCounts`, defined beside `DiffCounts` in the data
library, which also keys the upstream differ's categories by it, and
re-exported), `DIFF_CATEGORIES` in legend order, the
canvas markers `DIFF_MARKERS` and `DIFF_SELECTED_MARKER`, and the legends' i18n
keys `DIFF_LEGEND_TEXTS` (the toolbar label "Changes" included) and
`DIFF_CATEGORY_LABELS`. `DIFF_CATEGORIES` is typed
with its home type, not `as const`, because the declaration roll-up fails on a
public type derived from a const list; a spec pins it to `DiffCategory`. The
stepping rules (`canStep`, `stepCursor`, `nearestPresent`) live beside it in
`diffStepper.ts`.

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
in-page coordination and host-relayed panes and walks `navigationOrder` as
given: `setChanges(navigationOrder)`. The older `setChanges(view,
navigationOrder)` stays as a deprecated overload; it still leaves out the view's
layout-only connections, asking `layoutOnlyEdgeIds` with
`DiffViewer.isConnection`, so a navigation order from an older `computeDiff` or
built by the consumer steps as before. The
coordinator synchronizes in-page viewport/cursor state; the private host
protocol handles separate webviews. Legends accept presentation props rather
than host-origin vocabulary. Prev and Next are enabled only when there is a step,
by `canStep(steps)`: `DiffNavigator.canStep` and `DiffPaneCoordinator.canStep`
pass it to the optional `DiffLegendContext.canStep`. A consumer without a
stepper may omit it; the legend then enables the buttons whenever a count is
above zero, which overstates a diff of connections that only moved. The legend matches the DMN
pane's: a `role="toolbar"` labelled "Changes", each count as swatch, label and
bold `.diff-legend__count`, and an icon-only swap button (⇄) named by its
`title` and `aria-label`. Its `diff-legend__*` classes and colours are
unchanged. The public `DiffMarkerClass` keeps its literals, pinned to
`DIFF_MARKERS` by a spec, and `DiffViewer.applyHighlights` takes any marker
`string`.

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
`flushContentSaved()`, `PendingSaveHandle`, the one capability that stays
internal: only the session needs it), await `beforeDestroy` (host
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

The session also offers what every host would otherwise rebuild on
`onSurfaceCreated`. `onContentChanged(listener)` reports each command stack
change of whichever editable surface is live, subscribed again on every
recreate and fallback, and returns its unsubscribe function; the name matches
the `@miragon/modeler-api` contract the BPMN adapter (#2008) implements.
`flushPendingInput()` applies the live surface's pending panel input, which a
host that saves needs as much as a switch does. Both are silent on the viewer
and after `destroy()`.

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
reach it through the public `hasPendingInput()` and `flushPendingInput()`
(`PendingInputHandle`, which both handle interfaces extend), which the IDE
webview's flush, the Orca plugin's save and a recreating mode switch use to
apply a typed value before they export.

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
