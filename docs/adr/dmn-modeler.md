# DMN modeler

- Status: accepted
- Last reviewed: 2026-11-11

## Context

The embeddable DMN editor and IDE webview need the same actively maintained
modeling stack. A private Query/Command application cannot serve as a browser
API, and the dmn-js stack has different dependencies and release needs from
BPMN. Embedding also requires themes that do not affect neighboring instances
and a clear contract for changing language.

## Contents

- [Package and API](#package-and-api)
- [Themes](#themes)
- [Locale](#locale)
- [Diff](#diff)
- [Alternatives and consequences](#alternatives-and-consequences)

## Decision

### Package and API

`@miragon/dmn-modeler` lives in `packages/dmn-modeler`. Its asynchronous
`createModeler` factory, `DmnModelerOptions` and `DmnModelerHandle` are the public
contract. The thin `apps/dmn-webview` bootstrap owns private host messaging,
settings and document adaptation. Common dependency direction and public/private
boundaries are defined in [Architecture and hosts](architecture-and-hosts.md#package-boundaries).

Externalize dmn-js, diagram-js, the DMN properties panel, Camunda moddle,
simulation and upstream primitives as declared dependencies. Inline only the
private `modeler-types` and `bpmn-i18n-extras` libraries. A separate package
keeps dmn-js installation weight out of BPMN-only consumers and allows its own
release cadence; publishing the webview or folding DMN into the BPMN package
would defeat those goals.

The [architecture tests](../../packages/dmn-modeler/src/architecture.spec.ts)
enforce package boundaries and theme isolation.
[Declaration checks](../../packages/dmn-modeler/scripts/check-dts.mjs) reject
leaked private protocol symbols and dmn-js imports in the public declarations;
[external dependency checks](../../packages/dmn-modeler/scripts/check-externals.mjs)
guard declared runtime dependencies. Version alignment and the bundled consumer
smoke test follow [Release and publishing](release-and-publishing.md).

The handle follows the BPMN surfaces' lifecycle contract, so an embedder sees
the same behavior from both packages. Teardown composes the shared
`DisposableStore` and `MutableDisposable` from `modeler-types`. `destroy()` is
idempotent; afterwards every member throws `NoModelerError` (async members
reject with it), which the package exports, except `setTheme`, which becomes a
no-op.

The DRD properties panel's `debounceInput` service is the flushable one from
`modeler-types`, with the panel library's 600 ms delay, registered after the
panel module so it replaces the library's. The decision-table,
literal-expression and boxed-expression views share a second instance with
dmn-js's 300 ms delay, registered after the facade's other modules of each
view, so annotations, names, descriptions and simple-mode popups are flushed
too. The modeler holds both instances instead of reading them from the active
viewer, so it sees the input of every view. The handle reaches them through the
internal `hasPendingInput()` and `flushPendingInput()`
(`DmnPendingInputHandle`), which answer `false` and do nothing once destroyed.
The IDE webview's flush uses them to apply a typed value before it exports, as
it does for the [BPMN surfaces](bpmn-modeler.md#mode-session-and-lifecycle).
They are not public API yet. The decision table also sends one UI-only call
through the service: after a sheet scroll it shows the simple-mode button
again 300 ms later. A save of an unedited table in that window answers
`flushed` with dmn-js's serialization instead of `clean`, which the host
writes only when it differs from the file. Not covered yet: dmn-js clears the
view it leaves, so a value still waiting when the user switches views throws
when it is applied, by a flush as by the dmn-js timer. The value reaches the
model but schedules no sync, because the modeler listens only to the open
view's command stack. A flush still applies the other waiting input and then
rethrows, so the save gets an `unavailable` reply and goes ahead best-effort;
the value reaches the document with the next sync the page posts.

### Themes

Each instance controls `data-dmn-theme="light" | "dark"` on its container and
properties-panel parent. `theme` and `setTheme()` are active API; the default
`automatic` follows `prefers-color-scheme`. A distinct attribute from BPMN keeps
both packages' styles independent on mixed pages.

One authored scoped dark stylesheet joins the upstream light base in
`themes.css`, imported by the library entry and emitted as
`@miragon/dmn-modeler/styles.css`. Derive the unscoped legacy light/dark sheets
from that source by stripping the scope during their build. The controller
still mirrors a legacy `#theme-link` when present and silently ignores its
absence. A separate themes-only build of the main stylesheet is unnecessary.

Pass the canvas container as `feelPopupContainer` so the DRD panel's FEEL popup
stays inside the theme scope. The private shared `hostTheme` adapter maps IDE
body classes to the package-specific attribute and themes page chrome. The
theme controller is the one BPMN uses, shared through `modeler-types` with the
attribute name as a parameter, so a theme fix lands in both packages.
`DmnThemeMode` is an alias of the controller's `SurfaceThemeMode`, as BPMN's
`ThemeMode` is, and `publicApi.spec.ts` pins it to its three values
([BPMN modeler](bpmn-modeler.md#themes-and-locale)).

### Locale

Locale uses the same page-global translator as BPMN. Register `TranslateModule`
on all four dmn-js views: DRD, decision table, literal expression and boxed
expression. The manager rebuilds per-view module arrays, so placing the module
only in a common option does not work.

Apply `options.locale` before the first diagram load. `setLocale()` compares
resolved locales (unknown codes fall back to English) and no-ops if unchanged.
Otherwise it switches the shared translator and reopens the active view to
refresh rendered labels, preserving the DRD viewbox. The host pushes
`LanguageQuery` initially after settings and whenever its language setting
changes.

Translation harvesting covers dmn-js through the shared recorder and the local
i18n overlay. The overlay supplies missing modeler strings; it does not replace
the shared translation package.

### Diff

`libs/dmn-diff` owns `computeDmnDiff(beforeXml, afterXml): Promise<DmnDiffResult>`
and `dmnSideView(result, side)`, safe in Node and the browser and without DOM,
like [`libs/bpmn-diff`](bpmn-modeler.md#diff), whose `DiffSide` and `DiffCounts`
it reuses. It compares by id: DRG elements, artifacts, requirements (the DRD
uses a requirement's id as its connection's), input and output clauses, rules
and their cells. An element's signature holds its properties with tracked
children reduced to their ids, references to `#id`, and the layout-only
`biodi:*` attributes left out; a table's change marks its decision changed in
the DRD. Each version matches its cells to its columns by position, and cells
are compared per shared column id. A longest common subsequence over the rule
ids both versions share finds moved rules, since order decides a FIRST or
PRIORITY table. Changes are stepped through in reading order of the DI (top to
bottom, then left to right), a removed element at its place in the old version;
an edge whose only change is its layout is counted but not stepped to, as in
the BPMN diff. Parser warnings about unparsable content are errors.

The core's `DmnDiffService` computes the diff once both panes are ready and
sends each pane its side's view; it shares `DiffPaneRelay` with the BPMN diff
for the viewport and the cursor and adds the open view and the table's scroll.
The scroll is anchored on the topmost rule both versions share, plus an offset,
so inserted or removed rows do not shift the partner.

The panes render through `createDiffViewer`, internal to
`packages/dmn-modeler` and not public API: dmn-js's `Viewer`, the DRD with pan
and zoom, marked as in the BPMN diff. Table highlights are one scoped
stylesheet per pane whose attribute selectors (`data-row-id`, `data-col-id`,
`data-element-id`) survive every re-render of the table; output headers carry
no column id, so they are selected by position. The colours are the BPMN
diff's, and `diffPalette.spec.ts` keeps both stylesheets equal. VS Code opens
the panes for Git diffs (`priority.diffEditor`) and for its Compare commands
with "(DMN)" in their titles; the page learns that it is a diff pane from its
HTML ([Architecture and hosts](architecture-and-hosts.md)).

## Alternatives and consequences

- A per-instance translator would require separate translation bindings for
  each view. Page-global locale accepts that instances cannot have independent
  languages; per-instance themes remain independent.
- Reopening the active view is cheaper than export/re-import but still resets
  that view's undo history and emits `onViewChanged`. It does not trigger a
  document edit through `commandStack.changed`.
- Externalizing the upstream stack requires consumers to resolve its browser
  modules through a bundler. It is not a promise of bare Node ESM execution.
- Both the IDE webview and npm consumers use one composition, so features land
  once while the public facade remains a compatibility commitment.
- bpmn-js-differ, which the BPMN diff uses, knows BPMN only: its change handler
  walks BPMN types, and its moved indices have no DMN meaning. The id-based
  comparison costs its own code and tests in `libs/dmn-diff`.
- Classes on table cells, as the DRD markers are, would vanish whenever dmn-js
  renders the table again. The scoped stylesheet costs a positional selector for
  output headers, which a browser spec checks against real dmn-js rendering.
- A diff flag in the file query, as BPMN's viewer mode is, would arrive after
  the DMN bootstrap created its modeler. The HTML flag needs the host's HTML to
  name the pane.
- A copied rule gets a new id and shows as removed and added, as in the BPMN
  diff. IntelliJ has no DMN editor and Orca no diff, so only the VS Code
  extension opens the DMN diff.
