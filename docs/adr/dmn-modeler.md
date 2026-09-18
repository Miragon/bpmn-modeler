# DMN modeler

- Status: accepted
- Last reviewed: 2026-09-18

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
package's small `ThemeController` remains separate from BPMN's controller;
extracting another shared abstraction was not necessary for this contract.

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
