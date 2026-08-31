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

### bpmn-webview

| ADR | Decision | Status |
| --- | --- | --- |
| [0006](0006-extract-publishable-modeler-package.md) | Extract the host-free modeler composition into a publishable npm package | accepted |
| [0007](0007-public-modeler-api.md) | Fix the public `@miragon/bpmn-modeler` API surface before extraction | accepted |
| [0008](0008-public-diff-api.md) | Public diff API: serializable `computeDiff` data layer, promoted primitives, in-page coordinator | accepted |
