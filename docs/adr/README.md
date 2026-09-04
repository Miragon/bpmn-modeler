# Architecture Decision Records

This directory is the decision log for the BPMN modeler monorepo. Each record
captures one architecturally significant decision — the context that forced
it, the alternatives that lost, and the trade-offs we accepted — so future
contributors don't re-litigate settled questions.

The rules of the game (format, numbering, categorization) are themselves a
decision: see [ADR 0001](0001-record-architecture-decisions.md).

These files are intentionally **not** part of the published VitePress site
(excluded via `srcExclude` in `docs/.vitepress/config.mts`); they are a
contributor-facing record, not user documentation.

## Index

### cross-cutting

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions as ADRs, categorized by module | accepted |
| [0009](0009-npm-publishing-pipeline.md) | Publishing pipeline for `@miragon/bpmn-modeler`: npm CLI, yarn-packed tarball, Trusted Publishing | accepted |
| [0014](0014-make-bpmn-modeler-the-root-release-component.md) | Make the npm package the root release component; hosts release via sync markers | accepted |

### modeler-core

| ADR | Decision | Status |
| --- | --- | --- |
| [0002](0002-modeler-core-extraction.md) | Extract `@miragon/bpmn-modeler-core` and fix the host-protocol seam | accepted |

### modeler-bridge

| ADR | Decision | Status |
| --- | --- | --- |
| [0003](0003-runtime-distribution.md) | Ship the modeler runtime as a self-contained Bun binary | accepted |
| [0005](0005-host-replicated-state.md) | Host-replicated state: the bridge's synchronous-mirror pattern | accepted |

### intellij-plugin

| ADR | Decision | Status |
| --- | --- | --- |
| [0004](0004-intellij-host-foundation.md) | IntelliJ host foundation: stdio JSON-RPC transport & process supervision | accepted |

### vscode-plugin

| ADR | Decision | Status |
| --- | --- | --- |
| [0015](0015-integrate-form-js-into-the-bpmn-modeler-extension.md) | Integrate form-js into the BPMN modeler extension | accepted |

### bpmn-webview

| ADR | Decision | Status |
| --- | --- | --- |
| [0006](0006-extract-publishable-modeler-package.md) | Extract the host-free modeler composition into a publishable npm package | accepted |
| [0007](0007-public-modeler-api.md) | Fix the public `@miragon/bpmn-modeler` API surface before extraction | accepted |
| [0008](0008-public-diff-api.md) | Public diff API: serializable `computeDiff` data layer, promoted primitives, in-page coordinator | accepted |
| [0010](0010-expose-reference-availability-through-navigation-port.md) | Expose reference availability through the model navigation port | accepted |
| [0011](0011-stable-core-service-contract.md) | Freeze a typed, semver-covered contract for the seven core bpmn-js services reached via `getService` | accepted |
| [0012](0012-container-scoped-theming.md) | Container-scoped theming via a per-instance `data-bpmn-theme` attribute; `#theme-link` swap kept as permanent legacy fallback | accepted |
| [0013](0013-injectable-lint-stack.md) | Injectable lint stack via the `@miragon/bpmn-modeler/lint` subpath; omitted `linting` now means off | accepted |
| [0014](0014-readonly-viewer-subpath.md) | Readonly `createViewer` via the `@miragon/bpmn-modeler/viewer` subpath: NavigatedViewer + outline, `Pick`'d services, scope-preserving `viewer.css`, `locale` omitted | accepted |
| [0016](0016-design-mode-subpath.md) | Engine-neutral `createDesigner` via the `@miragon/bpmn-modeler/design` subpath: base bpmn-js + plain-BPMN panel, `executionPlatform` absence as mode marker, Camunda/lint stack gated out | accepted |
| [0017](0017-engine-neutral-properties-panel-lib.md) | Engine-neutral properties panel via an inlined `@miragon/bpmn-modeler-properties-panel` fork: viewer-safe renderer, readonly derived from missing `modeling`, neutral provider, priority-10 design/implement mode filter, host custom-group slot | accepted |
