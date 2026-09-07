# 0024 — Extract the host-free DMN modeler into a publishable npm package

- Status: accepted
- Date: 2026-09-07 (epic #1467; issue #1461)
- Category: dmn-webview

> Amended by [ADR 0026](0026-dmn-container-scoped-theming.md): the deferred
> per-instance theming has landed. `styles.css` is now emitted from the lib
> entry (`src/index.ts` imports the scoped `themes.css`), not the standalone
> CSS-only rollup (`vite.styles.config.mts` is deleted), and theming is
> per-instance via `data-dmn-theme` rather than the page-global `#theme-link`.

## Context

`apps/dmn-webview` grew the DMN modeling surface (decision requirements
diagrams, decision tables, literal expressions, properties panel, Camunda
simulation), but it is a `private` app whose only interface is the Query/Command
postMessage protocol — too host-specific to publish. This mirrors exactly the
BPMN situation that [ADR 0006](0006-extract-publishable-modeler-package.md)
resolved by inverting the layering, and epic #1467 does the same for DMN.

The cut line already exists: #1460 landed a per-instance `DmnModeler` facade,
a `createModeler` factory, and a self-contained `publicApi.ts` in
`apps/dmn-webview/src/app/`, all free of host references. That seed is a pure
`git mv` away from a package.

## Decision

Extract the host-free DMN modeler composition — the `DmnModeler` facade,
`createModeler`, the public API types, the theme stylesheets, and the ambient
dmn-js/diagram-js type shims — into a new publishable workspace
`packages/dmn-modeler` (`@miragon/dmn-modeler`), and rewire `apps/dmn-webview`
to consume it through the tsconfig alias (`workspace:*`), so the staged host
bundle contract is unchanged.

The rules match ADR 0006:

- **The public API is the facade, not the protocol.** The semver commitment is
  the `createModeler` surface (`DmnModelerHandle` / `DmnModelerOptions`); the
  Query/Command protocol stays private to the webview adapter.
- **Externalise the dmn-js stack** (`dmn-js`, `diagram-js`,
  `dmn-js-properties-panel`, `@emaarco/dmn-js-simulation`, `camunda-dmn-moddle`,
  the `@bpmn-io/*` primitives) as real `dependencies`; only the two private
  workspace libs `@miragon/bpmn-modeler-types` and
  `@miragon/bpmn-modeler-i18n-extras` are inlined into the bundle.
- **The package lives in `packages/`, not `libs/`.** Import direction is
  `packages → libs`, never the reverse.

Two decisions specific to this step:

- **`styles.css` is emitted from the themes rollup**, not via an `index.ts` CSS
  import. `src/index.ts` stays CSS-free so the staged
  `dist/webview-staging/dmn-webview/index.css` stays byte-identical (an
  acceptance criterion). The stock dmn-js sheet list lives once in
  `src/styles/base.css`, re-imported by both theme entries and shipped as
  `dist/dmn-modeler.css` (a consumer needs it to render at all).
- **Theming stays page-global** on the un-scoped `lightTheme.css` /
  `darkTheme.css` + `#theme-link` swap. The `theme` / `locale` options and
  `setTheme()` are accepted but inert, reserved so the API stays stable.

## Decisions deliberately not taken here

- **Scoped, per-instance theming** (the `data-bpmn-theme` attribute mechanism
  that BPMN uses) → issue #1462.
- **The thin-adapter rewire** of `apps/dmn-webview/src/app/` (host.ts / state.ts
  still speak the protocol under a temporary eslint exemption) → issue #1463.
- **The subpath release line and parameterised publish workflow** (the DMN
  release component, its own ADR) → issue #1466 / ADR 0025.

## Alternatives considered

**Publish the webview app as-is.** Rejected for the same reason as BPMN: its
Query/Command surface presumes a VS Code/IntelliJ host and is not an embeddable
API.

**Fold DMN into `@miragon/bpmn-modeler`.** Rejected: DMN ships a separate dmn-js
stack whose install weight has no place in a BPMN-only consumer's bundle, and
the two surfaces have different release cadences. A separate package keeps each
consumer's dependency graph honest.

## Consequences

- External consumers get an embeddable DMN modeler with one `createModeler`
  call; the feature stack lands once and both the webview and the tarball share
  it.
- The package's public surface becomes a compatibility contract. Enforcement is
  mechanised: `src/architecture.spec.ts` (import direction, no protocol/engine/
  apps names), `scripts/check-dts.mjs` (no leaked protocol symbols or `dmn-js`
  import in the published `.d.ts`), `scripts/check-externals.mjs` (every bare
  import is a declared dependency), the eslint BND-PROTOCOL-PRIVATE rule, and
  `yarn.config.cjs` (now guards the shared pins of both packages, flagging a
  conflict instead of silently letting one win).
- Version skew between the package's externalised `dependencies` and the
  versions the monorepo hosts resolve is possible; the root lockfile plus the
  `yarn constraints` guard keep them aligned while both live in this repo.
