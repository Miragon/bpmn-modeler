# 0034 — Shared surface lifecycle primitives; `DisposableStore` in `modeler-types`

- Status: accepted
- Date: 2026-09-13

## Context

The 2026-09 review of `packages/bpmn-modeler` found five lifecycle bugs
(#1488, #1490, #1494, #1495, #1497), each fixed *per surface*. That left three-
plus bespoke variants of disposal, init-failure handling, initial-viewport
latching, and save/error reporting across `modeler.ts`, `design/designer.ts`,
`viewer/viewer.ts`, and `viewer/diff/DiffViewer.ts`. Every future lifecycle fix
would have to be re-applied to each surface, and a new surface starts from a
blank teardown method with no shared guarantees.

Each surface hand-rolled its own teardown: an ad-hoc list of `focusDisposers`,
a `stopObservingSize` field re-armed per load, a `disposeClipboardPolyfill`
field, a `contentSaved` debouncer, and a fixed `destroy()` ordering — with the
three orders disagreeing on independent concerns, an `elementTemplates.errors`
subscription leaking on the modeler, and `DiffViewer` re-running its disposers
on a second `destroy()`.

## Decision

Compose each surface's lifecycle from small, explicit primitives instead of a
base class:

- **`DisposableStore` / `MutableDisposable` / `subscribe`** live in
  `@miragon/bpmn-modeler-types` (alongside `observeCanvasSize`, `asyncDebounce`,
  `NoModelerError`). They must be published rather than package-internal because
  the package's `modeSession` subpath may value-import only this workspace lib
  (enforced by `packages/bpmn-modeler/src/architecture.spec.ts`). `destroy()`
  becomes `store.dispose()` — idempotent, LIFO (reverse-registration) disposal —
  plus nulling the manager fields; the re-armed per-load canvas observer is a
  `MutableDisposable`.
- **`createSurface`** (package-internal, replaces `destroyOnFailure`) owns
  allocate → apply-initial-options and, on failure, destroys the partial
  instance before rethrowing.
- **One initial-viewport policy** (`InitialViewportLatch` / `armInitialViewportPolicy`,
  package-internal) that `ViewportManager` and `DiffViewer` both delegate to.
- **One save/error path** (`wireContentSaved` + a `SurfaceReporter`), preserving
  the ADR 0033 error contract.

No surface base class: DI module composition stays explicit per facade.

The `bpmn-layout` and `model-navigation` libs adopt `DisposableStore` for their
DI-service teardown, which adds a `@miragon/bpmn-modeler-types` workspace
dependency edge from each. Both are inlined libs (bundled into the package at
build time), so this is a source-level edge with no publish impact; `code-link`
and `inline-scripting` already depend on `modeler-types`.

## Consequences

- Future lifecycle fixes land once, in a primitive, against a shared contract
  test suite (`lifecycleContract.browser.spec.ts`) run over all four surfaces.
- Facade line counts drop and their `destroy()` methods share one canonical LIFO
  order — externally unobservable because disposal is synchronous.
- `DiffViewer` post-destroy calls now throw `NoModelerError` (was: a dead bpmn-js
  instance) and its viewport subscription gains the `diagram.destroy` self-hook
  (#1494 parity). Both are intended, publicly observable behaviour changes.
- The two new `modeler-types` dependency edges are inward (`libs → libs`), so the
  `packages → libs` layering and the package's import-direction gate are
  unaffected.
