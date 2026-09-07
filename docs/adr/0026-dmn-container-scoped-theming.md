# 0026 — Container-scoped DMN theming via a per-instance `data-dmn-theme` attribute

- Status: accepted (#1462)
- Date: 2026-09-07
- Category: dmn-webview

> Amends [ADR 0012](0012-container-scoped-theming.md),
> [ADR 0019](0019-webview-panel-chrome-in-shared.md),
> [ADR 0024](0024-extract-publishable-dmn-modeler-package.md).

## Context

[ADR 0024](0024-extract-publishable-dmn-modeler-package.md) extracted the
host-free DMN modeler into `@miragon/dmn-modeler` but deliberately deferred
per-instance theming (its "decisions deliberately not taken here" list, → this
issue). Theming stayed **page-global**: an un-scoped `darkTheme.css` swapped into
a `#theme-link` by a DMN-only adapter in `libs/shared/src/lib/theme.ts`, driven
off VS Code `<body>` classes.

That shape has exactly the defects
[ADR 0012](0012-container-scoped-theming.md) fixed for BPMN: `theme` / `setTheme`
on the handle are inert, two instances on one page cannot differ, single-file
hosts break, and the demo needs a data-URI `#theme-link` shim just to silence a
`console.error`. CLAUDE.md also requires an ADR when a change reverses an
explicit prior decision (0024's deferral) and when it activates public API
(`setTheme`, `theme`).

## Decision

Mirror ADR 0012 onto DMN.

- **Per-instance attribute `data-dmn-theme`** (not a reuse of `data-bpmn-theme`).
  Two attribute names let one page hold a BPMN and a DMN instance in different
  themes and keep each package's CSS self-contained. A per-instance
  `ThemeController` (a copy of the BPMN one, as the issue specifies — not a
  shared lib) toggles the attribute on the modeler's container + panel parent.
- **One authored source, stripped legacy split.** The dark rules are authored
  scoped under `[data-dmn-theme="dark"]` in `src/styles/dark-theme/*.css`.
  `styles/themes.css` (light base + scoped dark) is imported by `src/index.ts`,
  so the lib build folds the theme into `dist/dmn-modeler.css`
  (`@miragon/dmn-modeler/styles.css`). The legacy `lightTheme.css` /
  `darkTheme.css` split is derived from the same source by
  `scripts/postcss-strip-theme-scope.mjs`, which strips the scope so the split
  sheets stay un-scoped and page-global as before.
- **`#theme-link` as a silent fallback.** The controller keeps mirroring the
  resolved kind onto a `#theme-link` when a consumer still links one; a missing
  link is a no-op, not an error.
- **The host adapter is shared, not DMN-only.** The old `libs/shared/theme.ts`
  is deleted; the VS Code `<body>`-class adapter moves to
  `libs/shared/src/lib/hostTheme.ts` and is generalised to take the scope
  attribute name, so both webviews use it (`data-bpmn-theme` / `data-dmn-theme`).
- **`feelPopupContainer: container`** is passed in the DRD `propertiesPanel`
  config so the FEEL popup mounts inside the theme scope (it defaults to
  `document.body`, outside it).

`vite.styles.config.mts` is deleted: ADR 0024 emitted `dmn-modeler.css` from a
CSS-only rollup only because `index.ts` was CSS-free and `lightTheme.css` was
byte-identical to it. Once `index.ts` imports `themes.css`, the lib build emits
`dist/dmn-modeler.css` itself and the two theme entries diverge, so one themes
rollup keeps both.

## Alternatives considered

**Reuse `data-bpmn-theme` for DMN.** Rejected: a single attribute name couples
the two packages' CSS and forbids a page from theming a BPMN and a DMN instance
differently. Two names cost nothing and keep each package self-contained.

**Share the `ThemeController` via `@miragon/bpmn-modeler-types`.** Rejected for
this step per the issue: the controller is a small, stable file and a copy keeps
the DMN package's dependency surface honest. Extracting a shared theme primitive
is a possible later consolidation, not a prerequisite here.

## Consequences

- The staged `dist/webview-staging/dmn-webview/index.css` now includes the
  dmn-js component CSS (folded in via the package's `styles.css` import); the
  webview shells no longer link a `#theme-link`, and the separate
  `lightTheme` / `darkTheme` webview build entries are dropped.
- Theming always engages: the instance gets `data-dmn-theme` from the first
  frame, `"automatic"` follows `prefers-color-scheme` live, and `setTheme` /
  `theme` are now live public API. `locale` remains reserved (#1464).
- `dist/darkTheme.css` is no longer byte-identical to the pre-change build: the
  stripped output carries `:root`-prefixed component selectors (higher
  specificity than the old bare selectors — it only strengthens the override).
  The un-scoped legacy contract is preserved in effect.
- Dark DMN in the standalone demo remains out of scope (#1465): the demo host
  forces `colorTheme: "light"`.
