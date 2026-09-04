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

## Amendment (#1443, 2026-09-04)

`ViewerOptions` gains an **optional `propertiesPanel: { parent }`** — unlike on
the modeler/design surfaces, where the panel is mandatory. When set, the viewer
registers the engine-neutral panel's full design-parity module set
(`PropertiesPanelModule` + `NeutralPropertiesProviderModule` +
`ModeFilterModule` + `CustomGroupsModule`, ADR 0017) and passes
`feelPopupContainer: container`; `setTheme` then scopes both the container and
the panel parent. When omitted, none of the panel modules enter the DI graph —
byte-identical to before.

- **Readonly is derived, not configured.** The viewer still registers no
  `modeling` / `commandStack`; the panel renderer derives its readonly flag from
  the absent `modeling` service and disables every entry. The readonly-by-
  construction guarantee (and its runtime proof in `createViewer.spec.ts`) is
  unchanged *with the panel registered*.
- **`@bpmn-io/properties-panel` / preact / CodeMirror enter the `/viewer`
  closure** (they stay Vite externals, so tree-shaking hosts that skip the
  option still drop them where their bundler can). This continues the
  surface-accretion trajectory the #1439 amendment anticipated ("a preact-based
  readonly panel is planned in #1443"); the purity gate stays retired, replaced
  by a narrow `architecture.spec.ts` rule: `src/viewer/**` must deep-import the
  panel lib, never its barrel.
- **The viewer entry still imports no CSS** (load-bearing for
  `cssCodeSplit: false`): the panel modules are deep-imported past the lib
  barrel's CSS side-effect import. `viewer.css` gains the panel sheets
  (`properties-panel.css` + the dark-theme overrides) instead.
- **`locale` / `TranslateModule` remain omitted** — diagram-js's identity
  `translate` satisfies the renderer (English labels); hosts can add the
  translate module via `additionalModules`.

## Amendment (#1445, 2026-09-04)

`ViewerOptions` gains an **optional `capabilities: ViewerCapabilities`** —
navigation-only, exactly like `/design`'s `DesignerCapabilities` (#1444, ADR
0016). Model navigation is the one interaction a readonly surface should still
offer, and it reads the model without mutating it, so it belongs on the viewer
too. Present ⇒ the viewer registers `diagram-js/lib/features/context-pad` +
`createModelNavigationModule(port)`; absent ⇒ the graph is byte-identical to
before and `getService("contextPad")` throws (step 9, #1447, the bpmn-webview
View mode, depends on this).

- **diagram-js's context pad, never bpmn-js's.** `NavigatedViewer` registers no
  `contextPad`, so one must be composed in. We register the plain diagram-js
  module (`ContextPad.$inject = [canvas, elementRegistry, eventBus, scheduler]`,
  `__depends__` interaction-events/scheduler/overlays — all already in the viewer
  graph), **not** `bpmn-js/lib/features/context-pad`, whose provider drags
  connect / create / direct-editing / popup-menu and injects `modeling`. The
  readonly-by-construction proof is therefore unchanged with the capability on:
  `modeling` / `commandStack` stay unregistered and throw (asserted in
  `createViewer.spec.ts`).
- **Own `ViewerCapabilities` interface**, not a reuse of `DesignerCapabilities`:
  `/viewer` must not import from `src/design/*`. Structural identity between the
  two (mutual assignability) is asserted in `publicApi.spec.ts`, and the
  navigation types re-export from the `/viewer` barrel as they do from `/design`.
- **The line-17 "context pad" remark** (Context, "hiding the palette leaves
  editing live — keyboard, context pad") refers to **bpmn-js's** editing pad,
  which the viewer still never registers. The opt-in diagram-js pad here carries
  only the navigate entry and no editing affordance, so that argument stands.
- **Empty pad on an unreferenced element renders nothing.** The provider returns
  `{}` for an element with no resolvable reference; diagram-js renders an empty,
  invisible `.djs-context-pad` (same as bpmn-js does for labels). No handling.
- **No build / CSS / config change.** `@miragon/bpmn-model-navigation` is already
  inlined into the package build (INLINED_LIBS, api-extractor `bundledPackages`);
  its only bare runtime import is `bpmn-js/lib/util/ModelUtil`; the identity
  `translate` the pad provider injects already exists in the viewer graph; and
  `.djs-context-pad` CSS already ships via `viewer.css`. As on `/design`, the one
  conditional is inlined rather than reusing `src/capabilityModules.ts` (which
  value-imports code-link + inline-scripting, the latter dragging a CSS side
  effect into the CSS-free viewer entry).
- **The two stale acceptance criteria in #1445 are consciously not applied.**
  The issue asked to update `scripts/check-viewer-pure-entry.mjs` and the viewer
  lean-set rule in `architecture.spec.ts` — both retired in #1439/#1449 (the two
  amendments above). There is no viewer allow-list left to update; re-adding one
  would contradict the surface-accretion trajectory those amendments set.
