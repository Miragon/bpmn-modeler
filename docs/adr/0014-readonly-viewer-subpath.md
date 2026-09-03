# 0014 — Readonly viewer via the `@miragon/bpmn-modeler/viewer` subpath

- Status: accepted (#1405)
- Date: 2026-09-02
- Category: bpmn-webview

Roadmap step 6 of the bpm-iq embeddability epic (#1409), building directly on the
subpath-injection precedent [ADR 0013](0013-injectable-lint-stack.md) set for
`/lint`, the `Pick`-able core-service contract of
[ADR 0011](0011-stable-core-service-contract.md), and the container-scoped
theming of [ADR 0012](0012-container-scoped-theming.md).

## Context

The package exposed only `createModeler` — a full editor. Hosts that need a
readonly surface (view-only permissions, embedded previews) had nothing: hiding
the palette leaves editing live (keyboard, context pad), and the full modeler
drags camunda-bpmn-js, preact/properties-panel, CodeMirror, token simulation,
and lint into the graph regardless.

The same forcing function as #1407 applies: single-file hosts embed the modeler
through `vite-plugin-singlefile`, which inlines everything *reachable*. So a
readonly surface cannot be a runtime flag on the editor — the editor stack would
still be reachable and therefore inlined. Leanness has to hold at the
**module-graph** level, which means a separate entry the bundler can keep apart.

The prior ADRs had prepared exactly this: `CoreModelerServices` is deliberately
`Pick`-able (0011), `ThemeController` is generic over plain scope roots (0012),
and 0013 established the subpath + purity-gate pattern.

**Verified premises** (they differ from the issue sketch):

- bpmn-js 18's base `Viewer` already ships `SelectionModule` (with
  `interaction-events` hover/click). The only piece missing for *visible*
  selection/hover is `bpmn-js/lib/features/outline`, which is Modeler-only
  upstream — so the viewer adds exactly that one module.
- `ViewportManager` / `SelectionManager` are `ServiceAccessor`-based and reuse
  as-is (`fitViewport`'s `.djs-palette` lookup degrades to the default inset).
- The jsdom blocker recorded in 0011 (camunda-bpmn-js's minimap CJS interop) is
  absent from the viewer graph, so a runtime spec is feasible.

## Decision

Ship a **new subpath `@miragon/bpmn-modeler/viewer`** exporting an async
`createViewer(container, options?)` that resolves a `BpmnViewerHandle`.

- **NavigatedViewer + outline only.** The viewer wraps
  `bpmn-js/lib/NavigatedViewer` (mouse + keyboard pan/zoom, no editing) and adds
  `bpmn-js/lib/features/outline` as its single default module. No camunda
  moddle, properties panel, lint, clipboard, token simulation, or i18n.
- **`Pick`'d services (0011).** `CoreViewerServices = Pick<CoreModelerServices,
  "canvas" | "elementRegistry" | "eventBus" | "overlays" | "selection">` — the
  readonly subset. `modeling` / `commandStack` are never registered, so
  resolving one throws. The absence of an editing surface is expressed in the
  type *and* provable at runtime.
- **Subset-compatible handle.** Every `BpmnViewerHandle` member is
  signature-identical to its `BpmnModelerHandle` counterpart (asserted in
  `publicApi.spec.ts`: `(m: BpmnModelerHandle): BpmnViewerHandle => m`), so a
  host can narrow a modeler handle to a viewer handle without adapters.
- **Scope-preserving `viewer.css` via a third CSS build.** The viewer's
  `index.ts` imports no CSS — `cssCodeSplit: false` on the lib build would
  otherwise fold any reachable sheet into the shared `dist/bpmn-modeler.css`,
  dragging the editor chrome's CSS back in. Its sheet ships separately as
  `@miragon/bpmn-modeler/viewer.css`, built by a clone of
  `vite.themes.config.mts` **without** `stripThemeScope` (the viewer sheet keeps
  its `[data-bpmn-theme="dark"]` scoping so per-instance theming works).
- **Theming always engages (0012).** `createViewer` calls `setTheme(theme ??
  "automatic")`, constructing a `ThemeController` over the single container root.

### `locale` omitted in v1

The issue sketch included `locale` on `ViewerOptions`. It is **deliberately
omitted**: the viewer has no translatable UI, and honoring `locale` would pull
the i18n dictionaries (`@miragon/bpmn-modeler-i18n` + the extras overlay) into
the lean graph, defeating the whole point. This is additive later — a future
`locale` is a non-breaking option add — so nothing is foreclosed. (Maintainer
decision, recorded here per the deviation from the issue text.)

### Mechanised gates

- **`scripts/check-viewer-pure-entry.mjs`** (new, wired into `build`): walks the
  static import graph from `dist/viewer.js` and fails if any bare specifier names
  the editor stack (camunda-bpmn-js, bpmn-js-properties-panel, preact,
  codemirror, bpmnlint, token-simulation, create-append-anything,
  transaction-boundaries, minisearch, `@miragon/bpmn-modeler-i18n`). The heavy
  stacks are Vite `external`s, so they survive as bare imports the gate can see.
- **`src/architecture.spec.ts`**: every value-import in `src/viewer/**` and the
  reused helpers (`viewport.ts`, `selection.ts`, `theme.ts`,
  `elementGeometry.ts`) must be relative, `bpmn-js/*`, `diagram-js/*`, or
  `@miragon/bpmn-modeler-types`. `import type` stays fine.
- **`scripts/check-dts.mjs`**, the CI dist-artefact list, and
  `scripts/smoke-consumer.mjs` gain the `viewer.js` / `viewer.d.ts` /
  `viewer.css` entries and the `./viewer` / `./viewer.css` subpaths.

## Consequences

- **Additive, non-breaking.** No host (vscode/intellij) change — #1405 is purely
  additive per the epic's hard constraint.
- **The `DiffViewer` refactor onto the viewer internals is an explicit
  follow-up** (a separate issue): `DiffViewer` today wraps its own
  `NavigatedViewer`, and the viewer now generalises that. This also discharges
  0012's "until #1405 gives it an instance" note — the viewer *is* that instance.
- **First runtime-testable factory.** `createViewer.spec.ts` stands up a real
  bpmn-js viewer in jsdom for the readonly proof and lifecycle; the
  render-dependent cases (`loadDiagram` and live-registry reads) stay `it.skip`
  because jsdom lays nothing out and bpmn-js's viewbox transform dereferences an
  SVG `transform.baseVal` jsdom does not implement — they are covered manually
  via the demo page (`apps/demo-webapp/bpmn/viewer.html`).
- Establishes that the subpath-injection pattern (0013) generalises beyond
  injection to whole alternative surfaces; #1196 (`/design`) is next.

## Amendment (#1439, 2026-09-03)

Roadmap step 1 of the diff-migration epic (#1438) moves the browser-only diff
**rendering** primitives — `DiffViewer`, `DiffMarkerClass`, `DiffLegend`,
`DiffNavigator`, `DiffPaneCoordinator` — from the root entry onto `/viewer`
(`src/viewer/diff/`); the root keeps `@deprecated` re-exports. `DiffViewer`
already wraps the same readonly `NavigatedViewer` the viewer exports, so `/viewer`
is their natural home. This **discharges the follow-up** recorded in Consequences
above (the `DiffViewer` refactor onto the viewer internals). The Node-safe diff
*data* layer stays on the separate `@miragon/bpmn-modeler/diff` subpath.

Two decisions in this ADR are consciously superseded:

- **The viewer purity gate is removed** — `scripts/check-viewer-pure-entry.mjs`,
  the `check:viewer-pure` build step, and the `src/architecture.spec.ts` viewer
  lean-set rule (all in "Mechanised gates" above) are deleted. The viewer surface
  will keep accreting custom features (i18n arrives now via `DiffLegend`; a
  preact-based readonly panel is planned in #1443), so a per-feature
  forbidden-list is not worth maintaining. The viewer still imports **no CSS**
  (still load-bearing for `cssCodeSplit: false`), and `check:dts` /
  `smoke-consumer.mjs` still guard the dist surface.
- **The "`locale` omitted in v1 / no i18n" exclusion is superseded** —
  `DiffLegend` keeps its `@miragon/bpmn-modeler-i18n` import, so the i18n
  dictionaries are now reachable from `/viewer`. This is the deliberate trade-off
  for translated diff labels; no translator-injection refactor was done.

This is a **conscious deviation from issue #1439's acceptance criteria**, which
called for `check-viewer-pure-entry.mjs` to still pass (maintainer decision,
Peter). The neutral diff markers + legend CSS move into `src/styles/diffView.css`,
shared by `viewer.css` (so `/viewer` diff consumers get a themed legend) and
`diff.css` (so `styles.css`/bpmn-webview consumers see no change).
