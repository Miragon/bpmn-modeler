# 0028 — `@miragon/dmn-modeler` as a subpath release component

- Status: accepted
- Date: 2026-09-08 (epic #1467; issue #1466)
- Category: cross-cutting

## Context

[ADR 0024](0024-extract-publishable-dmn-modeler-package.md) extracted the
host-free DMN modeler into a second publishable npm package,
`@miragon/dmn-modeler` at `packages/dmn-modeler` (0.1.0, with a build and a
`scripts/smoke-consumer.mjs`). It now needs a release line: a way for
release-please to version it, tag it, and drive its npm publish — the last open
sub-issue of the extraction epic.

Two facts about the existing pipeline constrain the shape of that line:

- **Only the root component can watch multiple paths**
  ([ADR 0014](0014-make-bpmn-modeler-the-root-release-component.md)). That root
  slot already belongs to `@miragon/bpmn-modeler`, the artifact where semver
  correctness matters most. All other components are single-path.
- The DMN package **inlines two private libs** — `libs/modeler-types` and
  `libs/bpmn-i18n-extras` (a subset of the BPMN package's inlined libs) — into
  its bundle. A change to either alters the published artifact without touching
  `packages/dmn-modeler`, exactly the coupling ADR 0014 solved for the hosts
  with sync markers. ADR 0014's marker mechanism was defined only for hosts
  bundling webviews; a single-path *package* inlining libs is the same gap,
  unaddressed.

The existing `publish-npm-modeler.yml` already builds, packs, smoke-tests and
publishes `@miragon/bpmn-modeler` with npm Trusted Publishing
([ADR 0009](0009-npm-publishing-pipeline.md)).

## Decision

Add `@miragon/dmn-modeler` as a **fourth, subpath release component** rather than
a second root — and reuse the existing publish machinery instead of cloning it.

- **Subpath component, not a second root.** `packages/dmn-modeler` is a
  `release-type: node` component with `include-component-in-tag: true`, giving
  the tag `dmn-modeler-v<version>` — the same shape as the `vscode`/`intellij`
  host components. The root slot stays `@miragon/bpmn-modeler` (ADR 0014); a
  package living in its own directory needs no multi-path watching, so no
  root-component swap is warranted. `packages/dmn-modeler` is already in the
  root's `exclude-paths` (landed with #1461), so DMN-package commits never feed
  the npm line.
- **`BUNDLED_LIBS` marker for the two inlined libs.** `sync-release-markers.yml`
  learns a third marker, `packages/dmn-modeler/BUNDLED_LIBS`, bumping the DMN
  line when `libs/modeler-types` or `libs/bpmn-i18n-extras` changes without a
  native `packages/dmn-modeler` touch. This extends ADR 0014's marker mechanism
  from *hosts bundling webviews* (`BUNDLED_WEBVIEW`) to *a package inlining
  libs* — same title-mirroring, same `!`-stripping, same same-sha idempotence.
  Unlike the host markers, this one sits under its own trigger path, so the
  trigger negates `packages/dmn-modeler/BUNDLED_LIBS` to keep a marker commit
  from re-triggering the workflow.
- **One parameterised reusable publish workflow, not a clone.**
  `publish-npm-modeler.yml` gains `workspace`, `package-dir` and
  `smoke-extra-deps` inputs (defaults target `@miragon/bpmn-modeler`; DMN passes
  `jsdom esbuild`, which the bpmn smoke does not need). `release-please.yml`
  gains an `npm-dmn` fan-out job mirroring `npm`. Trusted Publishing binds **per
  package** on npmjs.com but each package points at the same top-level caller
  (`release-please.yml`) and the shared `npm-registry` environment. As with
  bpmn's 0.1.0 (ADR 0009), `@miragon/dmn-modeler@0.1.0` requires a one-time
  manual bootstrap publish before its trusted publisher can be configured.
- **The DMN smoke bundles its consumer.** Unlike bpmn-js, the dmn-js stack
  (`dmn-js`, `dmn-js-shared`, `dmn-js-drd`, …) ships no `exports` maps and uses
  extensionless deep imports, so it only resolves through a bundler — the way
  every real consumer and the webview host use it, never bare Node ESM. The
  smoke therefore bundles a tiny consumer entry with esbuild (hence the extra
  `esbuild` scratch dep) before importing it, rather than importing the tarball
  directly. A direct import under `node` would fail on dmn-js internals and
  prove nothing about real usage.

## Consequences

- The DMN package versions and releases on its own line
  (`dmn-modeler-v<version>`), independent of the BPMN package's cadence — which
  is the point of a separate package (ADR 0024). A `feat(dmn-modeler): …`
  commit opens only `chore(main): release dmn-modeler …`.
- Lib changes to the two inlined libs now correctly bump the DMN line, so the
  published artifact never changes without a version bump — the same guarantee
  ADR 0014 gives the hosts and the BPMN package.
- A `libs/modeler-types` push produces one marker commit touching all three
  markers: the BPMN (root) line bumps natively, the vscode host via
  `BUNDLED_WEBVIEW`, and the DMN line via `BUNDLED_LIBS`; the marker commit
  itself is excluded from the root line and cannot re-trigger the workflow. The
  vscode host bundles the DMN webview (which inlines the package), so
  `packages/dmn-modeler` is in the vscode marker's relevant set; IntelliJ ships
  no DMN editor, so it is not.
- One publish workflow now serves both packages. A change to the shared publish
  logic applies to both at once; the cost is that the workflow reads its target
  from inputs rather than being self-describing.

## Alternatives considered

- **Clone `publish-npm-modeler.yml` into a DMN-specific workflow.** Rejected:
  two near-identical workflows drift; the only real differences (workspace,
  directory, one extra smoke dep) are cleanly expressible as inputs.
- **A second root component.** Impossible — release-please allows only one root;
  and a package in its own directory does not need multi-path watching anyway.
- **A dedicated `npm-registry-dmn` environment.** Rejected: the environment
  gates approval and records deployments; one shared `npm-registry` environment
  serves both, and the npm-side trusted publisher is already scoped per package.
- **Swap the root slot to a broader component.** Rejected: the root belongs to
  the artifact with the hardest semver requirement (ADR 0014); nothing about DMN
  changes that.

References [ADR 0009](0009-npm-publishing-pipeline.md),
[ADR 0014](0014-make-bpmn-modeler-the-root-release-component.md),
[ADR 0024](0024-extract-publishable-dmn-modeler-package.md).
