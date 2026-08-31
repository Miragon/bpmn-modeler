# 0009 — Publishing pipeline for `@miragon/bpmn-modeler`: npm CLI, yarn-packed tarball, Trusted Publishing

- Status: accepted (#1379)
- Date: 2026-08-31
- Category: cross-cutting

Closes epic #1293. The package (#1376), its public API (#1375, [ADR 0007](0007-public-modeler-api.md))
and the diff surface (#1378, [ADR 0008](0008-public-diff-api.md)) have landed;
this decision wires the package into the release machinery so it actually ships.

## Context

`packages/bpmn-modeler` (`@miragon/bpmn-modeler`) builds standalone and passes
its published-surface gates, but nothing publishes it. The repo already runs
release-please with two lines (`vscode`, `intellij`) plus reusable `publish-*`
workflows gated by GitHub environments. The npm line has to fit that shape while
answering choices the existing lines never faced:

- **How to authenticate to npm.** A long-lived npm token in CI is a standing
  credential-theft target and needs rotation.
- **How to pack.** The package depends on private workspace libs and other
  workspaces via `workspace:*` ranges, which are not installable off-registry.
- **How the first version bootstraps**, given npm's ordering constraints on
  Trusted Publishing.

## Decision

- **Publish with the npm CLI, not `yarn npm publish`.** We `yarn workspace
  @miragon/bpmn-modeler pack` (yarn rewrites `workspace:*` to real versions in
  the tarball manifest) and then `npm publish <tarball>`. This gets yarn's
  correct monorepo packing *and* the npm CLI's provenance/OIDC support in one
  path.
- **npm Trusted Publishing (OIDC) with provenance, not a token.** No npm secret
  lives in CI. `publish-npm-modeler.yml` runs `npm publish --provenance` with
  `id-token: write`; npm mints a short-lived OIDC token per run. This requires
  npm ≥ 11.5.1 (Node 22 ships npm 10, so the workflow upgrades npm) and binds
  the publisher to the **top-level caller workflow** (`release-please.yml`) and
  the `npm-registry` environment.
- **`0.1.0` is a one-time manual bootstrap publish.** npm only allows
  configuring a trusted publisher *after* a package exists, so the first version
  was published manually with a short-lived granular token that was then
  revoked. Consequently `publishConfig.provenance` is **not** set in
  `package.json` (it would break the tokenless laptop bootstrap); provenance is
  a workflow-only flag.
- **A third release-please line**, `packages/bpmn-modeler` → tag
  `bpmn-modeler-v<version>`, its own `CHANGELOG.md`, routed by longest-prefix
  exclusivity (the root `vscode` line keeps `exclude-paths: ["packages"]`). The
  `npm` fan-out job gates behind the existing `release-approval` environment and
  then the publish behind `npm-registry`, mirroring the other lines.
- **A pack-and-install smoke test** (`scripts/smoke-consumer.mjs`) runs in the
  publish workflow before publishing: it installs the packed tarball into a
  scratch project and asserts no `workspace:` range survived, every `exports`
  subpath resolves, and the Node-safe `./diff` subpath runs.
- **A version-skew guard** (a Yarn constraint in the root `yarn.config.cjs`)
  fails `yarn constraints` when an in-repo consumer pins a dependency the
  package ships at a different version (peer dependencies exempt);
  `yarn constraints --fix` auto-aligns. It runs in the package `build` chain
  and as its own cheap `build.yml` job; lockfile drift is already caught by
  the immutable installs in CI and the pre-push hook.

## Alternatives considered

- **`yarn npm publish`.** Rejected: yarn's publish path did not give us the npm
  CLI's provenance/OIDC integration; packing with yarn and publishing the
  tarball with npm gets both.
- **Long-lived npm token in a GitHub secret.** Rejected in favour of OIDC:
  Trusted Publishing removes the standing credential and adds provenance for
  free.
- **Extracting the data/diff layer as a second npm package** (revisited from
  ADR 0008): still rejected — one published artifact, one version line.

## Consequences

- No new GitHub repo secrets. One-time manual setup remains: configure the
  Trusted Publisher on npmjs.com (workflow `release-please.yml`, environment
  `npm-registry`), create the `npm-registry` environment, and push the
  `bpmn-modeler-v0.1.0` tag so release-please's first Release PR does not walk
  deep history.
- A **manual `workflow_dispatch` of `publish-npm-modeler.yml` is dry-run-only** —
  the trusted publisher only matches `release-please.yml` as caller. Real
  re-publishes are a re-run of the `npm` job on the release-please run. The
  publish step is idempotent (skips if the version is already on npm).
- **Known gap:** a `packages/bpmn-modeler`-only change releases only the npm
  line; the VS Code/Standalone/IntelliJ hosts that bundle it from source ship it
  only on their next otherwise-triggered release. There is no
  `BUNDLED_WEBVIEW`-style marker closing that gap yet — tracked as a follow-up.
