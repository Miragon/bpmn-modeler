# 0018 — Runtime design/implement mode on `createModeler`

- Status: accepted (#1442)
- Date: 2026-09-04
- Category: bpmn-webview

Part of the "one document, three modes" epic (#1438), roadmap step 4, building on
the engine-neutral properties-panel lib [ADR 0017](0017-engine-neutral-properties-panel-lib.md),
the design-mode subpath [ADR 0016](0016-design-mode-subpath.md), and the
container-scoped theming of [ADR 0012](0012-container-scoped-theming.md).

## Context

The epic needs a **Design** view of a model that is already tagged for an
execution engine (Camunda 7 / 8) — a documentation-focused surface that hides the
engine chrome and reduces the properties panel to standard BPMN. The obvious
route, the existing engine-neutral [`/design` subpath](0016-design-mode-subpath.md)
(`createDesigner`, base `bpmn-js/lib/Modeler` with no camunda/zeebe moddle and no
`camunda-bpmn-js` behaviours), **loses engine data**: with no engine moddle
registered, `BpmnReplace` and copy-paste (both routed through `ModdleCopy`)
silently drop the `zeebe:*` / `camunda:*` extension elements they cannot describe.
A user who opens a C8 diagram, switches to Design, and replaces or copies a task
would corrupt their model.

So Design on a *tagged* model cannot be a different bpmn-js instance. It has to be
the same live `createModeler` instance — same moddle, same behaviours, same
command stack — with only the *presentation* changed.

## Decision

Make design/implement a **runtime mode on the existing `createModeler` instance**,
toggled live with a new `handle.setMode(mode)` / `handle.getMode()` pair and an
initial `mode?: ModelerMode` option (default `"implement"`). No instance is
created or destroyed on a toggle.

- **The DI module graph is mode-invariant.** Every module is registered once at
  construction; nothing is added or removed on a toggle. This is the no-data-loss
  guarantee stated structurally: the engine moddle and `camunda-bpmn-js` behaviours
  are always present, so replace and copy-paste keep engine data in *both* modes.
- **Single source of truth = the panel's `propertiesPanelModeFilter`.** The
  properties-panel lib (ADR 0017) already ships a stateful `ModeFilterProvider`
  that holds the mode, registers at panel priority 10, and fires
  `propertiesPanel.providersChanged` from its own `setMode`. The package holds no
  second mode field that could drift; `getMode` reads the filter, and a pure
  `applyMode(ports, mode)` orchestration helper (the `viewState.ts` port pattern)
  drives the filter, the token-simulation stop, the `data-bpmn-mode` stamp, and
  the `onModeChanged` callback off a small unit-testable seam.
- **`modeChanged` is an `onModeChanged?` options callback.** The package's only
  outbound-event mechanism is options callbacks (`onContentSaved`, `onLintResults`,
  …); a one-off eventBus event would be inconsistent. It fires once per *actual*
  change.
- **Popup-menu chrome is filtered by one low-priority DI middleware.** A
  `PopupMenuModeFilter` registers on `bpmn-replace` / `bpmn-append` / `bpmn-create`
  below diagram-js's default priority (so it runs last, after the engine template
  provider) and, in design mode, strips the template entries; it also guards
  `elementTemplates.select` above the template chooser's default-priority
  subscriber (the chooser has no off switch). The token-simulation toggle is
  hidden via CSS scoped on the `data-bpmn-mode` container attribute, plus a
  `toggleMode.toggleMode(false)` on entering design.
- **`/design` stays untouched.** The subpath remains the route for *untagged*
  models and lean hosts wanting the Camunda stack out of their bundle. The two are
  different factories by design; `setMode` is the data-preserving route for the
  tagged design↔implement pair.

## Other considerations

Alternatives were weighed and rejected:

- **Destroy the instance and recreate the other surface.** The existing
  instance-switch pattern (capture view state → `destroy()` → create → `loadDiagram`
  → apply). Rejected: the bpmn-js command stack belongs to the destroyed instance,
  so **undo history is lost** on every toggle — unacceptable for a live view
  switch. (View state survives; edit history does not — see the README caveat.)
- **Add / remove DI modules at runtime on the one instance.** Would keep the
  instance but swap the engine providers out in design mode. Rejected: didi (the
  bpmn-js DI container) has no supported module add/remove after construction; the
  graph is frozen once `new Modeler(...)` runs.
- **Two documents (an engine copy and a neutral copy) kept in sync.** Rejected:
  reconciling edits made in one view back into the other is a three-way merge
  problem with no clean resolution, and doubles the in-memory model.

## Consequences

- **Design mode on an engine model omits timer / multi-instance.** Those groups
  are wholesale-replaced by the Camunda providers, so their neutral entries are not
  restorable by a filter — carried over from ADR 0017. A pure `/design` panel keeps
  them.
- **Not runtime-testable under Vitest.** `camunda-bpmn-js` does not boot under jsdom
  (ADR 0017), so the mode wiring on the real instance is proven by construction
  (the mode-invariant graph), by the pure `mode.spec.ts` / `modeModules.spec.ts`
  units, and by the `apps/demo-webapp` bpmn page end-to-end; the no-data-loss claim
  is an architectural invariant, not a Vitest assertion.
- **Mode code kept out of the `/design` and `/viewer` closures by intent.** An
  `architecture.spec.ts` gate forbids those subpaths from importing `./mode` /
  `./modeModules`, keeping the runtime-mode concern a `createModeler`-only one.
- **Host integration is deferred.** Wiring `setMode` into the VS Code / IntelliJ
  hosts and a demo mode-strip UI are follow-ups (#1446 / #1447); this change is the
  package capability only.
