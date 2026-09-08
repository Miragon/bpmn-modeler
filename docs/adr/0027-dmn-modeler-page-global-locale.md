# 0027 — Page-global DMN locale via a built-in `TranslateModule` and view re-open

- Status: accepted (#1464)
- Date: 2026-09-08
- Category: dmn-webview

> Amends [ADR 0024](0024-extract-publishable-dmn-modeler-package.md),
> [ADR 0026](0026-dmn-container-scoped-theming.md).

## Context

[ADR 0024](0024-extract-publishable-dmn-modeler-package.md) extracted the
host-free DMN modeler into `@miragon/dmn-modeler` but left the `locale` option
**reserved and inert**: the dmn-js views never consulted the shared translator,
so a DMN editor rendered in English regardless of
`miragon.bpmnModeler.language`, while BPMN was already translated.
[ADR 0026](0026-dmn-container-scoped-theming.md) activated `theme` / `setTheme`
the same way but explicitly left `locale` for this issue.

Everything upstream already existed: `@miragon/bpmn-modeler-i18n` merges
`dmn-js.js` into every locale's dictionary, and the package already calls
`i18n.extend(i18nExtras)`. What was missing was pure wiring. CLAUDE.md requires
an ADR when a change activates public API (`locale`, a new `setLocale`) and
reverses an explicit prior decision (0024's / 0026's deferral).

## Decision

Mirror the BPMN page-global locale model onto DMN.

- **`TranslateModule` as an opinionated built-in on every view.** dmn-js is a
  multi-view Manager that rebuilds each view's `additionalModules` from the
  per-view option arrays only — a `common.additionalModules` entry is dropped —
  so `TranslateModule` is registered on all four views (`drd`, `decisionTable`,
  `literalExpression`, `boxedExpression`). It binds the same page-global `i18n`
  singleton the BPMN modeler uses, so a `setLanguage` reaches already-created
  viewers immediately; only already-rendered labels need a refresh.
- **`locale` option + `setLocale()` on the handle.** `createModeler` applies
  `options.locale` before the caller's first `loadDiagram`, so the initial import
  renders translated. `setLocale()` switches the shared translator, then
  **re-opens the active view** (`manager.open(activeView)`) so its rendered labels
  re-translate. It compares resolved locales (an unknown code falls back to
  `"en"`) and no-ops when unchanged, so the host re-pushing the language on every
  reload never triggers a spurious re-import. The DRD viewbox is captured and
  restored across the re-open.
- **Host push mirrors BPMN.** `DmnSettingsBroadcaster` gains a `setLanguage`
  that posts `LanguageQuery`, and re-pushes it when
  `miragon.bpmnModeler.language` changes; the `GetDmnModelerSettingCommand`
  handler posts settings-then-language. The DMN webview `bootstrap.ts` routes
  `LanguageQuery` to `handle.setLocale()`.

## Alternatives considered

**A per-instance translator (per-instance locale).** Rejected: `TranslateModule`
and the `i18n` singleton are page-global by construction; a per-instance locale
would require forking `TranslateModule` to bind a fresh translator per view. Not
worth it — no host needs two DMN editors in different languages on one page, and
BPMN already accepted the page-global limitation.

**Export + re-import to re-translate.** Rejected: `manager.open(activeView)`
already re-runs `viewer.open` (clear + import DRD / decision table) and re-fires
`views.changed`, so it re-translates every rendered label without a full
serialize/parse round-trip. Both paths reset the view's undo history equally, so
the lighter one wins.

## Consequences

- A DMN editor opened with `miragon.bpmnModeler.language = de` renders the
  palette, context pad, decision-table context menu and hit-policy labels in
  German; the language QuickPick re-renders an open editor live.
- A locale switch re-opens the active view: it resets that view's undo history
  (like a re-import) and re-fires `onViewChanged`. diagram-js's `clear` emits no
  `commandStack.changed`, so the switch produces no spurious document sync — the
  document stays clean.
- `locale` is **page-global** (the `i18n` instance is a singleton); there is no
  per-instance DMN locale, matching BPMN.
- The translate-harvest tooling now covers dmn-js: the recorder moved to
  `libs/shared/src/lib/harvestRecorder.ts` (shared by both webviews), a new
  `harvest-drain-dmn.js` drives the DMN views, and `harvested-dmn.json` feeds the
  overlay/coverage guards alongside `harvested.json`. The harvest surfaced two
  dmn-js numeric type names (`integer`, `double`) the shared `dmn-js.js`
  dictionary never shipped; they were added to the local overlay for all 12
  locales (verbatim, mirroring how the shared library keeps `long`).
- The standalone demo DMN page stays light-only and English (#1465 will wire its
  locale), unchanged by this step.
