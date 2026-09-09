# 0021 — Publish the View / Design / Implement session via the `@miragon/bpmn-modeler/mode` subpath

- Status: accepted (#1447)
- Date: 2026-09-06
- Category: bpmn-webview

## Context

Epic #1438 ("one document, three modes") shipped the three surfaces — the
readonly `/viewer` ([ADR 0014](0014-readonly-viewer-subpath.md)), the
engine-neutral `/design` ([ADR 0016](0016-design-mode-subpath.md)), and the
runtime `mode`/`setMode` toggle on `createModeler`
([ADR 0018](0018-runtime-design-implement-mode.md)) — plus the host-side
orchestration that ties them together: which transition is a live toggle versus
a destroy-and-recreate, export-before-destroy, view-state hand-off, and the
post-destroy fallback so the page is never handle-less. That orchestration and
the segmented-control strip lived in private code — `libs/shared`'s
`surfaceMode.ts` / `modeStrip.ts` and the demo's `ModeSession.ts` — with a
second, flush-aware copy of the switch logic inlined in the VS Code / IntelliJ
webview `bootstrap.ts`.

The README sells the three-mode story, but an outside consumer of
`@miragon/bpmn-modeler` could not get the switch without re-implementing it, and
in-repo it was implemented twice. The building blocks are published; the
composition that makes them a product was not.

## Decision

Publish the session and its strip as a new subpath **`@miragon/bpmn-modeler/mode`**
(+ `mode.css`), following the entry-point precedents ([ADR 0016](0016-design-mode-subpath.md)
for `/design`, [ADR 0014](0014-readonly-viewer-subpath.md) for `/viewer`).

- **The consumer injects the per-mode surface factories.** `createModeSession`
  takes a `SurfaceFactories` bag (`view` / `design` / `implement`) and calls
  them; it value-imports **no** bpmn-js / Camunda code. So a consumer that
  bundles only `/viewer` never drags the editor stack in through `/mode`. The
  present factory set decides the available modes: supply one factory and you get
  one mode and no buttons; the strip renders a group only when two or more modes
  are available. Purity is gated at the module-graph level by
  `scripts/check-mode-pure-entry.mjs` and at the source level by
  `architecture.spec.ts`, exactly as `/design` is.
- **The pure mode model moves to `@miragon/bpmn-modeler-types`.** `SurfaceMode`,
  `SURFACE_MODES`, `isModeAvailable`, `defaultMode`, `resolveInitialMode`,
  `planTransition` are protocol-free *and* worth publishing (the host
  `BpmnFileQuery.defaultMode` and the `modeler-core` host ports already need the
  type), so they satisfy [ADR 0019](0019-webview-panel-chrome-in-shared.md)'s
  two-criteria rule — the same route `Engine` / `DetectedEngine` take.
  `defaultMode` / `resolveInitialMode` gain an optional `available` set so the
  fallback lands inside the consumer's supplied modes. The UI strings
  (`MODE_LABEL`, `MODE_BADGE`, the Implement-unavailable hint) ship with the
  strip in the package.
- **Both in-repo consumers migrate in this PR**, so one implementation of the
  session logic remains: the demo and the VS Code / IntelliJ webview both build a
  `SurfaceFactories` bag and drive the session through its lifecycle hooks
  (`onSurfaceCreated` / `onModeChanged` / `onSwitchStateChanged` / `beforeDestroy`
  / `onError`).

## Alternatives considered

**`/mode` imports all three factories itself.** Simplest call site, but every
consumer would then bundle the full Camunda stack even to render a viewer —
exactly what [ADR 0016](0016-design-mode-subpath.md)'s entry-point rule forbids.
Consumer-injected factories keep the entry surface-free.

**Keep the strip host-side.** The status quo: two copies of the switch logic and
no path for an outside consumer. Rejected — publishing the composition is the
point.

## Consequences

- The strip and mode model leave `libs/shared` (see the amendments on
  [ADR 0019](0019-webview-panel-chrome-in-shared.md) and
  [ADR 0020](0020-untagged-documents-first-class-in-hosts.md)); the
  resizer/focus/shortcut chrome stays private there, unchanged.
- The i18n strip keys (`View` / `Design` / `Implement` / `Mode` / the hint) stay
  on the `SOURCE_ONLY` allowlist in `libs/bpmn-i18n-extras`: the webview still
  emits them before a surface exists, so the harvest structurally cannot reach
  them.
- Both in-repo hosts pass the strip the full `SURFACE_MODES` set, so an untagged
  model shows all three buttons with Implement greyed (discoverable rather than
  hidden); the strip ignores clicks on the disabled button. A consumer that wants
  the "hide unavailable" behaviour instead passes `session.availableModes()` —
  and a single-factory consumer, whose `availableModes()` has one entry, gets no
  buttons at all.
- The initial surface still binds after its own import in the webview
  bootstrap (the session builds it without loading a diagram), preserving the
  first-open fit-to-viewport behaviour; a recreate/fallback binds through
  `onSurfaceCreated` before the session loads the carried XML.
