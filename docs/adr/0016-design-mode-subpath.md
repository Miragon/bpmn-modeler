# 0016 — Engine-neutral design mode via the `@miragon/bpmn-modeler/design` subpath

- Status: accepted (#1196)
- Date: 2026-09-02
- Category: bpmn-webview

> Amended by [ADR 0020](0020-untagged-documents-first-class-in-hosts.md): the
> hosts now open an untagged (engine-neutral) document directly in this Design
> surface instead of stamping an execution platform onto it.

Roadmap step 7 — the last — of the bpm-iq embeddability epic (#1409), building on the subpath-injection precedent [ADR 0013](0013-injectable-lint-stack.md)
for `/lint`, the readonly-surface precedent
[ADR 0014](0014-readonly-viewer-subpath.md) for `/viewer`, the `Pick`-able
core-service contract of [ADR 0011](0011-stable-core-service-contract.md), and the
container-scoped theming of [ADR 0012](0012-container-scoped-theming.md).

## Context

The package exposed a full Camunda editor (`createModeler`) and a readonly viewer
(`createViewer`), but nothing for **engine-neutral, editable** documentation or
conceptual modelling — a BPMN surface a user can edit with no Camunda 7/8
properties panel and no execution platform. The full modeler cannot serve this by
hiding chrome at runtime: it drags camunda-bpmn-js, element templates, token
simulation, transaction boundaries, and the lint stack into the graph regardless.

The same forcing function as #1405/#1407 applies: single-file hosts embed through
`vite-plugin-singlefile`, which inlines everything *reachable*, so bundle
composition must be decidable at the **entry point**, not by a runtime `mode`
flag. Hence a separate subpath the bundler can keep apart.

**The mode marker is the absence of `modeler:executionPlatform` on
`bpmn:Definitions`.** Absent ⇒ Design; present ⇒ Implement, routed through the
already-exported `detectEngine(xml)` (#1404). Fallback for undetected XML is
*editable* Design, not readonly.

## Decision

Ship a **new subpath `@miragon/bpmn-modeler/design`** exporting an async
`createDesigner(container, options)` that resolves a `BpmnDesignerHandle`
(naming: `createDesigner` / `BpmnDesignerHandle` / `DesignerOptions` / class
`BpmnDesigner`).

- **Base bpmn-js `Modeler` + a neutral properties panel.** The design surface
  wraps `bpmn-js/lib/Modeler` (palette, context pad, modelling, keyboard,
  copy-paste, snapping, searchPad, outline) plus `BpmnPropertiesPanelModule` +
  `BpmnPropertiesProviderModule` from `bpmn-js-properties-panel` (engine-neutral
  general / documentation groups). Neutral UX comes from `TranslateModule`, our
  `AppendMenuModule` decorating the base `CreateAppendAnythingModule`,
  `FlowNavigationModule`, and `diagram-js-minimap` (`minimap: { open: false }`).
  Shared installs (`ThemeController`, `ViewportManager`, `SelectionManager`,
  keyboard/canvas focus, clipboard) reuse as-is.
- **Full core services (0011).** `CoreDesignerServices = CoreModelerServices` —
  the *whole* seven, `modeling` and `commandStack` included, the inverse of the
  viewer's readonly `Pick`. The editable surface is expressed in the type.
- **Subset-compatible handle.** Every `BpmnDesignerHandle` member is
  signature-identical to its `BpmnModelerHandle` counterpart (asserted in
  `publicApi.spec.ts`: `(m: BpmnModelerHandle): BpmnDesignerHandle => m`).
- **Scope-preserving `design.css` via the CSS-only build.** `src/design/index.ts`
  imports no CSS (`cssCodeSplit: false` would fold any reachable sheet into the
  shared `dist/bpmn-modeler.css`); its sheet ships as
  `@miragon/bpmn-modeler/design.css`, a second input on
  `vite.viewer-css.config.mts`, keeping its `[data-bpmn-theme="dark"]` scoping.
- **Theming + locale engage (0012).** `createDesigner` calls `i18n.extend(...)` →
  `setTheme(theme ?? "automatic")` → optional `i18n.setLanguage(locale)` — Design
  mode has translatable UI, unlike the viewer.

### v1 exclusions (all additive later, nothing foreclosed)

- **No `linting` option.** `buildLintModules` needs an `Engine` for its default
  config; the injectable `/lint` pattern (0013) makes a future engine-neutral
  ruleset purely additive.
- **No conversion helpers.** `stampExecutionPlatform` / `stripExecutionPlatform`
  (host-side mode switching) are deferred; `detectEngine` already covers routing.
  Switching = host stamps/strips the XML, `destroy()`, other factory. **Superseded
  for the design↔implement pair on an engine-tagged model** by
  [ADR 0018](0018-runtime-design-implement-mode.md): that pair is now a runtime
  `setMode` toggle on the same `createModeler` instance (no destroy, no engine-data
  loss). This subpath remains the route for untagged models and bundle purity.
- **No align-to-origin / grid / colour-picker chrome.** Each would add a new
  direct dependency (camunda-bpmn-js base chrome). `favouriteBpmnElements` is
  lifted to a first-class option since Design mode has no `settings`.
  - **Minimap included** (revised from the original plan). The plan deferred it
    partly "to keep the jsdom runtime spec feasible" (minimap's CJS interop is a
    known jsdom blocker, 0011). But the engine-neutral properties panel already
    makes a runtime spec infeasible (see Consequences), so that rationale is void
    for `/design` — nothing is left to protect. The only real cost is one small
    new direct dependency, `diagram-js-minimap` (already transitively present via
    camunda-bpmn-js), which the purity gate does not forbid; it ships collapsed
    (`minimap: { open: false }`) with its dark-theme sheet already scoped.
- **No host capabilities.** `DesignerOptions` carried none of the
  `ModelerCapabilities` ports in v1. **Amended (#1444):** the foreseen additive
  step landed — `DesignerOptions.capabilities` now accepts a narrower
  `DesignerCapabilities` with the single engine-neutral `modelNavigation` port
  (the engine-bound `codeLink` / `scripting` stay compile-time-rejected). The lib
  `@miragon/bpmn-model-navigation` is already inlined into the package build
  (INLINED_LIBS, api-extractor `bundledPackages`), its only bare runtime import
  is `bpmn-js/lib/util/ModelUtil`, and `designer.ts` inlines the one conditional
  rather than reusing `src/capabilityModules.ts` (which value-imports code-link +
  inline-scripting, the latter dragging a CSS side-effect into the CSS-free design
  entry). The purity gate stays green: nothing new becomes external.
- **No host UX.** The creation-time Design/Implement choice and a mode-switch chip
  in VS Code / IntelliJ are follow-up work outside this package-only PR.

### Mechanised gates

- **`scripts/check-design-pure-entry.mjs`** (new, wired into `build`): walks the
  static import graph from `dist/design.js` and fails if any bare specifier names
  the Camunda engine or lint stack (camunda-bpmn-js, the C7/C8 moddles +
  behaviours, transaction boundaries, element templates, token simulation,
  `@miragon/create-append-c7`, minisearch, bpmnlint). Unlike `/viewer`,
  `bpmn-js-properties-panel`, `@bpmn-io/properties-panel`, `preact`, CodeMirror,
  and `bpmn-js-create-append-anything` are **allowed**.
- **`src/architecture.spec.ts`**: every value-import in `src/design/**` must be a
  relative, `bpmn-js/*`, `diagram-js/*`, `@miragon/bpmn-modeler-types`, the
  neutral panel/menu packages, or the neutral `@miragon/*` libs (i18n, i18n-extras,
  append-menu, flow-navigation, clipboard). `import type` stays fine.
- **`scripts/check-dts.mjs`**, the CI dist-artefact list, and
  `scripts/smoke-consumer.mjs` gain the `design.js` / `design.d.ts` / `design.css`
  entries and the `./design` / `./design.css` subpaths.

## Consequences

- **Feature matrix closed:** `createModeler` (c7/c8 editable) | `/design`
  (engine-neutral editable) | `/viewer` (readonly).
- **Additive, non-breaking.** No host (vscode/intellij) change — #1196 is
  package-only per the epic's Host-impact constraint. The regression check is the
  demo page `apps/demo-webapp/bpmn/design.html`.
- **`preact`, CodeMirror, and `diagram-js-minimap` are legitimately in the design
  closure** — the first two are the engine-neutral properties panel's own
  dependencies, the last is the minimap module; the purity gate allows all three
  (unlike `/viewer`, which forbids the panel and minimap alike).
- **No runtime spec, unlike `/viewer`.** The engine-neutral properties panel
  (`bpmn-js-properties-panel`) reaches bpmn-js internals through extensionless
  ESM imports that Vitest's module runner resolves with Node's native loader,
  which rejects them — the same jsdom wall (0011) that leaves the full modeler
  untested. `createDesigner.spec.ts` documents the intended runtime contract via
  skipped, dynamic-import tests; the real runtime proof is the demo page plus the
  type-level conformance in `publicApi.spec.ts`.
