# 0012 — Container-scoped theming via a per-instance `data-bpmn-theme` attribute

- Status: accepted (#1406)
- Date: 2026-09-01
- Category: bpmn-webview

Step 4 of the modeler-roadmap epic (#1409). Per-instance theming is the
foundation the upcoming viewer (#1405) and design mode (#1196) sit on.

## Context

`@miragon/bpmn-modeler` themed the page by mutating a **global**
`<link id="theme-link">` — a regex swap of `lightTheme.css` ↔ `darkTheme.css`
in its href. This shape had three problems:

- **A page singleton contradicting a per-instance API.** `theme` /
  `setTheme` are documented per-instance, but one `#theme-link` can only hold
  one theme, so two modelers on a page could never differ.
- **Broken for single-file hosts.** With no external files (data-URI or inlined
  hrefs) the swap silently no-ops, and an absent `#theme-link` logged a
  `console.error` — the exact failure the demo shell papered over with a no-op
  data-URI shim.
- **Dead code in-repo.** No host passed `options.theme`; hosts ran a *duplicate*
  swapper in `libs/modeler-types` off the VS Code `<body>` classes.

## Decision

**A `data-bpmn-theme="light" | "dark"` attribute is the authoritative
mechanism.** A per-instance `ThemeController` toggles it on the instance's scope
roots (canvas container + `propertiesPanel.parent`); the dark stylesheet's rules
are all scoped under `[data-bpmn-theme="dark"]`, so theming one instance never
leaks onto another. `createModeler` always engages theming
(`options.theme ?? "automatic"`), so an instance carries the attribute from the
first frame.

- **One authored CSS source, two shapes.** The dark overrides are authored
  *scoped* under `[data-bpmn-theme="dark"]`. `themes.css` (folded into
  `dist/bpmn-modeler.css` via `src/index.ts`) merges the unscoped upstream light
  base with those scoped overrides — so loading `styles.css` is all a consumer
  needs, no extra `<link>`. The legacy split `lightTheme.css` / `darkTheme.css`
  are derived by a PostCSS plugin (`postcss-strip-theme-scope.mjs`) that strips
  the scope from the same source, keeping a single source of truth.
- **The `#theme-link` swap stays as a permanent legacy fallback.** It is still
  mirrored when present, but is now a **silent** no-op when absent (no
  `console.error`) — the attribute mechanism stands on its own.
- **Overlays that leave the themed subtree copy the attribute.** The append-menu
  (mounts on `document.body`) and element-template-chooser (mounts on the canvas
  parent) overlays copy `data-bpmn-theme` from
  `closest("[data-bpmn-theme]")` onto their own root at creation.
- **Page chrome is the host's job.** The `html`/`body` background, panel
  resizers, and `.properties-panel-parent` border key off the root attribute a
  **host adapter** (`apps/bpmn-webview/hostTheme.ts`) sets on
  `document.documentElement` — not the package. That adapter also themes the
  viewer/diff branch, which has no modeler instance until #1405.
- **DMN is unchanged.** dmn-js theme CSS does not ship inside the package, so the
  DMN webview keeps the `libs/modeler-types` `#theme-link` adapter verbatim.

## Alternatives considered

- **`color-scheme` / `light-dark()` CSS.** The cleanest long-term shape, but
  deferred: it needs Chromium ≥123, and the IntelliJ host's JCEF is not yet
  there. The `--dt-*` custom-property + `[data-bpmn-theme]` approach works on
  every host today and can migrate later.
- **Two hand-authored sheets (scoped + legacy split).** Rejected — it doubles
  the ~750 lines of dark overrides and invites drift. Deriving the legacy split
  by stripping the scope keeps one source.
- **Deleting the `#theme-link` swap outright.** Rejected — it would break
  out-of-repo consumers that link the split sheets. Kept as a permanent,
  un-deprecated fallback.

## Consequences

- Theming now always engages: consumers who pinned a dark `#theme-link` and
  omitted `theme` relied on the old default being a no-op — they now get
  `"automatic"`. Passing `theme: "light"` / `"dark"` pins a fixed kind.
- A page that sets `data-bpmn-theme` on a **root** element *and* mixes
  per-instance themes would leak the root value; no in-repo host does this.
