# Release and publishing

- Status: accepted
- Last reviewed: 2026-11-13

## Context

Published packages and IDE hosts have independent version lines but bundle shared
source. Release routing must account for changes in those shared inputs without
treating every package API break as a host break. Releases are cut occasionally
and usually ship every component with pending changes. npm and VS Code
Marketplace publishing need authentication without a standing CI token (Azure
DevOps retires the global PATs the Marketplace accepted on December 1, 2026, and
Open VSX offers the same OIDC exchange). Operational steps are in the
[release guide](../vscode/contributing/release-process.md); version alignment is in
[Dependencies](dependencies.md) and the standalone app's packaging in
[Standalone app](standalone-app.md).

## Contents

- [Release components and markers](#release-components-and-markers)
- [Release pull request](#release-pull-request)
- [Packing and publishing](#packing-and-publishing)
- [Orca plugin](#orca-plugin)
- [Consequences](#consequences)

## Decision

### Release components and markers

Release-please routes by changed file paths, not Conventional Commit scope. Only
its root component can observe multiple paths, so give that slot to the BPMN
package, whose public semver contract spans its package sources and inlined
libraries. The [release configuration](../../release-please-config.json) is the
source of truth for routing and version-stamped files.

| Component | Watched location | Shared-source mechanism |
| --- | --- | --- |
| `bpmn-modeler` | Root `.` with exclusions | Receives its package and inlined-library changes directly |
| `dmn-modeler` | `packages/dmn-modeler` | `BUNDLED_LIBS` for `modeler-types`, `bpmn-diff` and `bpmn-i18n-extras` |
| `vscode` | `apps/vscode-plugin` | `BUNDLED_WEBVIEW` for bundled packages, webviews, core/shared and standalone sources |
| `intellij` | `apps/intellij-plugin` | `BUNDLED_WEBVIEW` for its bundled webviews, bridge/core and relevant package/library sources |
| `orca` | `apps/orca-plugin` | `BUNDLED_WEBVIEW` for both packages, the libraries they inline and `libs/shared` |

The root excludes applications, docs, CI, host libraries, the DMN package and root
tooling files individually. It is a blocklist without globs: review new root files
so unrelated tooling does not trigger npm releases. Docs and workflow changes do
not themselves release products. Tags stay `<component>-v<version>` and changelogs
live with each component. Root `package.json` tracks the BPMN npm version; VS
Code's extra files keep standalone and its extension version in lockstep.

**Markers.** For shared `feat`/`fix` changes, the
[marker workflow](../../.github/workflows/sync-release-markers.yml) creates one
commit touching the affected markers and mirroring the triggering squash-merge PR
title. It preserves the type (`feat` gives minor, `fix` patch) but strips the
breaking `!`: a shared API break need not break a bundling host. A genuinely broken
component must be touched in its own directory or get an explicit `Release-As`
override. Shared `chore`/`docs`/`refactor` changes ship with the next release
without marker attribution. DMN's three inlined libraries use the same mechanism
(IntelliJ bundles no DMN editor and gets no DMN-only markers); marker files are
excluded from trigger paths where needed, DMN's in particular, to prevent
recursive marker commits. The
[release-marker spec](../../tools/repo-checks/src/releaseMarkers.spec.ts) fails when
a library either package inlines is missing from the workflow's trigger paths or
the routing pattern. The
[host webview spec](../../tools/repo-checks/src/hostWebviews.spec.ts) takes the
webviews each host ships from its build and fails when the trigger paths or a host's
routing pattern misses one of them, or matches a webview that host does not ship. It
checks the publish workflows' focused installs and build steps against the same lists,
and fails when a focus line names a package that is no workspace, which otherwise
surfaces only at release time.

Keeping VS Code as root would leave the npm package's inlined-library changes
under-versioned and could major-release VS Code for package-only breaks. Generic
patch or scheduled batch markers would lose meaningful changelog entries or
attribute shipped changes to a later release. The accepted cost is a bot commit for
each relevant shared feature/fix.

### Release pull request

Release-please maintains one combined Release PR for all components
(`separate-pull-requests: false`). Tags, changelogs and manifest entries stay per
component, and a component without releasable changes is absent. Merging it starts
one release run behind one `release-approval` gate and publishes every included
component. With one PR per component, every merge started its own run and approval
and occasional releasers had to work out which PRs to merge and in what order
(#1669).

There is no release order to model: the two npm packages inline their libraries and
do not depend on each other, the hosts build the packages from source at their own
tag through `workspace:` ranges, and every publish job in
[release-please.yml](../../.github/workflows/release-please.yml) waits only for the
release-please and approval jobs. The accepted cost: a single component cannot be
held back, because `Release-As` only overrides a version and release-please has no
per-component skip. That has not been needed so far; separate PRs documented as
order-independent were rejected because they keep one run and one approval per
component.

### Packing and publishing

Pack with `corepack yarn workspace <package> pack`, which rewrites workspace ranges
in the tarball, and publish that tarball with the npm CLI for Trusted
Publishing/OIDC and provenance. Do not use a long-lived CI npm token or Yarn's npm
publisher.

- The [reusable publish workflow](../../.github/workflows/publish-npm-modeler.yml)
  serves both npm packages (workspace, package directory and smoke-test dependency
  inputs). Each package configures its trusted publisher against the same top-level
  `release-please.yml` caller and `npm-registry` environment. Use an OIDC-capable
  npm CLI and `id-token: write`; provenance is a workflow flag, not
  `publishConfig.provenance`, so local bootstrap publishing remains possible.
- A new npm package needs a one-time manual initial publish before its trusted
  publisher can be configured, with a short-lived credential revoked afterwards.
  Real publishing is gated by release approval and the registry environment; manual
  dispatch of a reusable workflow is dry-run-only, and a failed real publish is
  retried through its release-please job. Versions that already exist on npm are
  skipped, so retries are idempotent.
- The VS Code extension publishes with `vsce publish --oidc` (Marketplace Trusted
  Publishing), not a PAT. The publisher's policy names `publish-vscode-modeler.yml`
  and the `vscode-marketplace` environment, and the job and its `release-please.yml`
  caller grant `id-token: write`. Microsoft does not document whether a reusable
  workflow is matched by its own file or its caller, so a manual dispatch with
  `dry-run: false` is the fallback until a release run proves the called-file match.
- Open VSX publishes with `ovsx publish --trusted-publishing`. It matches the
  token's `workflow_ref` (the top-level caller) and allows one trusted publisher per
  extension, so it is registered for `release-please.yml` and the
  `open-vsx-marketplace` environment.
- Validate the packed artifact in scratch consumers before publishing: no
  `workspace:` ranges, resolvable declared exports, appropriate browser entries and
  the Node-safe BPMN diff entry. DMN's smoke bundles its consumer with esbuild
  because its upstream extensionless browser imports do not resolve under bare Node
  ESM; one parameterized workflow keeps the shared logic consistent.

### Orca plugin

Orca builds nothing and installs the files of a pinned commit, so the built plugin
folder has to live in a repository. Every Miragon modeler publishes into one
catalog, [Miragon/orca-plugins](https://github.com/Miragon/orca-plugins), whose
`sources.json` allows this repository to publish `bpmn-modeler`. After release
approval, the [publish workflow](../../.github/workflows/publish-orca-plugin.yml)
builds `apps/orca-plugin/plugin/`, smoke-tests exactly that folder in the newest
Orca and hands it, with the release tag and changelog section in a `release.json`,
to that repository's `publish-plugin` action (pinned to a commit). The action opens
a pull request with the plugin's bytes and one with its catalog entry and
squash-merges each once that repository's `validate` passes, so a release is one
catalog change and one tag there. It authenticates with the release-please GitHub
App, scoped to `miragon/orca-plugins` with `contents: write` and
`pull-requests: write`. A failed publish closes its PR and a re-run retries and
skips bytes already on main; the `orca-plugins-publish` concurrency group
serializes publishes from this repository only. This repository stays free of
build output, and manual dispatch is a dry run.

- release-please bumps `orca-plugin.json` with the workspace's version (the
  [manifest spec](../../apps/orca-plugin/src/manifest.contract.spec.ts) keeps the
  two equal) and the line starts at `0.1.0` (`initial-version`) because
  release-please gives a package without a released version `1.0.0`.
- One build writes both editor pages, so shared code ships once. The bundle ships
  unminified with sourcemaps but without the libraries' comments: Orca's listing
  policy forbids only code minified to hide what it does.

## Consequences

Packages keep separate version lines while bundled feature/fix changes reach the
hosts that ship them, and everything releases together from one PR and one
approval. Routing exclusions and marker input sets are maintained configuration,
not inferred from the module graph. npm, VS Code Marketplace and Open VSX
publishing use short-lived identity; package bootstrap and trusted-publisher
registration remain explicit setup steps, and the workflow file name and
environment name are tied to each registry's policy.
