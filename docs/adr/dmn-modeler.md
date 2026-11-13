# DMN modeler

- Status: accepted
- Last reviewed: 2026-11-13

## Context

The embeddable DMN editor and the IDE webview need the same actively maintained
modeling stack. A private Query/Command application cannot serve as a browser API,
and the dmn-js stack has different dependencies and release needs from BPMN.
Embedding also needs themes that do not affect neighboring instances and a clear
contract for changing language.

## Decision

### Package and API

`@miragon/dmn-modeler` lives in `packages/dmn-modeler`. Its asynchronous
`createModeler` factory, `DmnModelerOptions` and `DmnModelerHandle` are the public
contract; the thin `apps/dmn-webview` bootstrap owns private host messaging, settings
and document adaptation. Dependency direction and the public/private boundary are in
[package boundaries](architecture-and-hosts.md#package-boundaries). The DMN diff is in
[Diff](diff.md#dmn-diff).

Externalize dmn-js, diagram-js, the DMN properties panel, Camunda moddle, simulation
and upstream primitives as declared dependencies; inline only the private
`modeler-types`, `bpmn-diff` and `bpmn-i18n-extras` libraries (`bpmn-diff` for the
`DiffCounts` and `DiffCategory` types the diff marks expose). A separate package keeps dmn-js
installation weight out of BPMN-only consumers and allows its own release cadence;
publishing the webview or folding DMN into the BPMN package would defeat both. Both
the IDE webview and npm consumers use one composition, so features land once while
the public facade stays a compatibility commitment. Consumers must resolve the
externalized stack's browser modules through a bundler; bare Node ESM execution is not
promised.

The handle follows the BPMN surfaces' [lifecycle contract](bpmn-modeler.md#mode-session-and-lifecycle):
teardown composes the shared `DisposableStore` and `MutableDisposable`, `destroy()` is
idempotent, and afterwards every member throws `NoModelerError` (async members reject
with it) except `setTheme`, which no-ops.

**Re-import.** An outside write re-imports through `loadDiagram`. dmn-js's `importXML`
opens the view whose element id the new document still holds, and otherwise the first
view, so the handle adds no restore of its own. `reimport.browser.spec.ts` pins this
against real dmn-js, so an upgrade that drops it fails there. The IDE webview and the
Orca plugin rely on it instead of restoring the view themselves.

**Pending input.** The DRD properties panel's `debounceInput` is the flushable one from
`modeler-types` (the panel library's 600 ms delay), and the decision-table,
literal-expression and boxed-expression views share a second instance (dmn-js's 300 ms
delay), so annotations, names, descriptions and simple-mode popups are flushed too. The
modeler holds both instances rather than reading them from the active viewer, and the
handle reaches them through the public `hasPendingInput()` and `flushPendingInput()`,
which the IDE webview's flush and the Orca plugin's save use before they export. Not covered: dmn-js clears the view it leaves, so a value still waiting when
the user switches views throws when applied, reaches the model but schedules no sync
(the modeler listens only to the open view's command stack), and the save gets an
`unavailable` reply and proceeds best-effort.

Enforcement: [architecture tests](../../packages/dmn-modeler/src/architecture.spec.ts)
(boundaries and theme isolation), [declaration checks](../../packages/dmn-modeler/scripts/check-dts.mjs)
(no private protocol symbols, dmn-js imports or declarations of the internal diff
viewer in public declarations) and
[external dependency checks](../../packages/dmn-modeler/scripts/check-externals.mjs).
Version alignment and the bundled consumer smoke test follow
[Release and publishing](release-and-publishing.md).

### Themes

Each instance controls `data-dmn-theme="light" | "dark"` on its container and
properties-panel parent; `theme` and `setTheme()` are active API and the default
`automatic` follows `prefers-color-scheme`. A distinct attribute from BPMN keeps both
packages' styles independent on mixed pages. One authored scoped dark stylesheet joins
the upstream light base in `themes.css` (emitted as `@miragon/dmn-modeler/styles.css`);
the unscoped legacy light/dark sheets are derived from it by stripping the scope. The
controller still mirrors a legacy `#theme-link` when present. The canvas container is
the `feelPopupContainer`, so the FEEL popup stays inside the theme scope.

The theme controller is the one BPMN uses, shared through `modeler-types` with the
attribute name as a parameter, so a theme fix lands in both packages; `DmnThemeMode`
aliases `SurfaceThemeMode` and `publicApi.spec.ts` pins it
([BPMN modeler](bpmn-modeler-features.md#themes-and-locale)).

### Locale

Locale uses the same page-global translator as BPMN. Register `TranslateModule` on all
four dmn-js views (DRD, decision table, literal expression, boxed expression): the
manager rebuilds per-view module arrays, so a common option does not work. Apply
`options.locale` before the first diagram load. `setLocale()` compares resolved
locales (unknown codes fall back to English), no-ops if unchanged, and otherwise
switches the translator and reopens the active view to refresh labels, preserving the
DRD viewbox. The host pushes `LanguageQuery` after settings and on every language
change. Translation harvesting covers dmn-js through the shared recorder and the local
i18n overlay, which supplies missing modeler strings without replacing the shared
translation package.

## Alternatives and consequences

- Inlining `bpmn-diff` for two types ties the package's release line to every change
  under `libs/bpmn-diff`, though the bundle carries none of its code. Moving the types
  to `modeler-types` would end that. It is not done yet: the `modeler-types` barrel
  carries DOM helpers, and `bpmn-diff` and `dmn-diff` compile without the DOM library to
  prove they need no DOM, so the move needs a DOM-free entry of `modeler-types` first.

- A per-instance translator would need separate bindings for each view; page-global
  locale accepts that instances cannot have independent languages while themes stay
  independent.
- Reopening the active view is cheaper than export/re-import but resets that view's
  undo history and emits `onViewChanged`; it triggers no document edit through
  `commandStack.changed`.
