# 0032 — Vitest browser mode (Playwright/Chromium) as a second project for `@miragon/bpmn-modeler`

- Status: accepted
- Date: 2026-09-10
- Category: cross-cutting

## Context

The modeler package's view-state contract — restore the viewbox, plane, and
selection after `loadDiagram` — races a delayed initial fit driven by a real
`ResizeObserver` (`libs/modeler-types/src/canvasResize.ts`). The #1490 defects
(a restored viewport overwritten by the still-pending initial fit; an empty
selection snapshot that cannot clear) only reproduce against a real bpmn-js
canvas laid out by a real browser: jsdom lays nothing out — bpmn-js's
`canvas.viewbox()` dereferences an SVG `transform.baseVal` jsdom does not
implement — and ships no `ResizeObserver`. This is the same wall that forces
`createViewer.spec.ts` to `it.skip` every render-dependent case (ADR 0011) and
to lean on the demo page for manual proof.

Unit tests over faked bpmn-js services (the existing `viewport.spec.ts`
harness) prove the latch's decision logic, but not that the fix survives an
actual observer delivery cycle. The #1490 acceptance criteria call for
real-ResizeObserver tests, so the repo needs an execution environment that
lays a diagram out.

## Decision

Add Vitest **browser mode** as a second project for `packages/bpmn-modeler`,
alongside the existing jsdom project. The repo is already on Vitest 4.1.11, so
this is a configuration + dev-dependency change, not a runner migration.

- New `packages/bpmn-modeler/vitest.browser.config.ts`: Playwright provider
  (`@vitest/browser-playwright`, headless Chromium), `include:
  src/**/*.browser.spec.ts`. Coverage is intentionally **off** for this project
  — v8-coverage-in-browser merge is not worth the complexity for a handful of
  specs.
- The alias block the jsdom project needs is extracted to
  `packages/bpmn-modeler/vitest.aliases.ts` and shared by both configs; the
  jsdom project excludes `*.browser.spec.ts`.
- New dev dependencies (`packages/bpmn-modeler` + root, matching the repo's
  existing `vitest`/`@vitest/coverage-v8` placement): `@vitest/browser-playwright`
  (pinned to the Vitest version, `4.1.11`) and `playwright`.
- Wire-up: the browser config is a project in root `vitest.config.ts`; a
  `test:browser` script chains into the package's `test` script so
  `yarn workspace @miragon/bpmn-modeler test` runs both projects; CI installs
  Chromium (`playwright install chromium --with-deps`) before that step.

## Alternatives considered

**Manual/demo-page verification only** (the status quo for render-dependent
paths). Rejected for #1490: the delayed-fit race is timing-sensitive and
regression-prone — exactly the kind of bug a human clicking through the demo
misses, and exactly what an automated real-observer test pins down.

**A dedicated Playwright suite** (separate `@playwright/test` runner). Rejected:
it duplicates the runner, the alias resolution, and the module graph the specs
already share with the rest of the package's Vitest suite. Browser mode reuses
the existing Vite pipeline and lets browser specs sit next to their unit
siblings.

## Consequences

- The #1490 repro is now a standing regression guard: viewer restore across the
  observer, hidden-then-visible restore, resize-after-restore, fresh-open fit,
  selection clearing, and the DiffViewer latch all run against real bpmn-js.
- CI gains a ~180 MB Chromium download on the bpmn-modeler test job and a
  browser boot per run — accepted for the coverage it buys.
- The `createModeSession` recreate acceptance (View↔Design survival) is **not**
  ported to a browser spec: the designer stack (append-menu, flow-navigation,
  layout) triggers Vitest browser's mid-run dependency re-optimization and a
  workspace-resolution gap, which makes the spec flaky. That path stays covered
  by `modeSession.spec.ts` (jsdom, transition logic) plus the viewer browser
  spec, which proves the exact `applyViewState`-after-`loadDiagram` survival the
  recreate relies on. Widening browser coverage to the full modeler/designer
  would need `optimizeDeps.include` tuning and missing lib aliases — deferred
  until a spec actually needs it.
- The viewer's static import of the neutral properties panel forces the browser
  dep pre-bundler to emit the production preact JSX runtime
  (`optimizeDeps.rolldownOptions.transform.jsx.development: false`), mirroring
  the jsdom project's `oxc.jsx.development: false`. A future Vite/Rolldown option
  rename would need this touched in one place.
