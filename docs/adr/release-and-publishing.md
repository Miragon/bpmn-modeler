# Release and publishing

- Status: accepted
- Last reviewed: 2026-09-18

## Context

Published packages and IDE hosts have independent release cadences but bundle
shared source. Release routing must account for changes in those shared inputs
without treating every package API break as a host break. npm publishing also
needs installable tarballs, consumer validation and authentication without a
standing CI token.

## Contents

- [Release components and markers](#release-components-and-markers)
- [Packing and publishing](#packing-and-publishing)
- [Consequences](#consequences)

## Decision

### Release components and markers

Release-please routes by changed file paths, not Conventional Commit scope.
Only its root component can observe multiple paths. Give that slot to the BPMN
package, whose public semver contract spans its package sources and inlined
libraries. The [release configuration](../../release-please-config.json) is the
source of truth for routing and version-stamped files.

| Component | Watched location | Shared-source mechanism |
| --- | --- | --- |
| `bpmn-modeler` | Root `.` with exclusions | Receives its package and inlined-library changes directly |
| `dmn-modeler` | `packages/dmn-modeler` | `BUNDLED_LIBS` for `modeler-types` and `bpmn-i18n-extras` |
| `vscode` | `apps/vscode-plugin` | `BUNDLED_WEBVIEW` for bundled packages, webviews, core/shared and standalone sources |
| `intellij` | `apps/intellij-plugin` | `BUNDLED_WEBVIEW` for its bundled webviews, bridge/core and relevant package/library sources |

The root excludes applications, docs, CI, host libraries, the DMN package and
root tooling files individually. It is a blocklist without globs: review new
root files so unrelated tooling does not trigger npm releases. Demo, docs and
workflow changes do not themselves release products.

Tags remain `<component>-v<version>` and changelogs live with each component.
Root `package.json` tracks the BPMN npm version; VS Code's extra files keep
standalone and its extension version in lockstep. Root release-please outputs
drive BPMN publishing; path-prefixed outputs drive the other components.

For shared `feat`/`fix` changes, the
[marker workflow](../../.github/workflows/sync-release-markers.yml) creates one
commit touching affected markers and mirroring the triggering squash-merge PR
title. Preserve its type (`feat` gives minor, `fix` patch) but strip breaking
`!`: a shared API break need not break a bundling host. A genuinely broken
component must be touched in its own directory or receive an explicit
`Release-As` override. Shared `chore`/`docs`/`refactor` changes ship with the
next release without marker attribution. Markers skip redundant native touches
and use same-SHA idempotence.

DMN's two inlined libraries use this same mechanism. Its marker also strips
`!`, so a genuinely breaking DMN API change needs a native DMN-package touch
or explicit release override. IntelliJ does not bundle a DMN editor and does
not receive DMN-only markers. Exclude marker files from trigger paths where
necessary, particularly DMN's marker, to prevent recursive marker commits.

Keeping VS Code as root would leave the npm package's inlined-library changes
under-versioned and could major-release VS Code for package-only breaks.
Generic patch or scheduled batch markers would lose meaningful changelog
entries or attribute already-shipped changes to a later release. The accepted
cost is a bot commit for each relevant shared feature/fix.

### Packing and publishing

Pack with `corepack yarn workspace <package> pack`, which rewrites workspace
ranges in the tarball. Publish that tarball with the npm CLI for Trusted
Publishing/OIDC and provenance. Do not use a long-lived CI npm token or replace
this path with Yarn's npm publisher.

The [reusable publish workflow](../../.github/workflows/publish-npm-modeler.yml)
accepts workspace, package directory and smoke-test dependency inputs for both
packages. Each npm package configures its trusted publisher against the same
top-level `release-please.yml` caller and `npm-registry` environment. Use an
OIDC-capable npm CLI and `id-token: write`; provenance is a workflow flag,
not `publishConfig.provenance`, so local bootstrap publishing remains possible.

A new npm package needs a one-time manual initial publish before its trusted
publisher can be configured. Use a short-lived credential and revoke it after
bootstrap. Normal real publishing is gated by release approval and the npm
registry environment. Manual dispatch of the reusable workflow is dry-run-only;
retry a failed real publish through its release-please job. Skip versions that
already exist on npm so retries are idempotent.

Validate the packed artifact in scratch consumers before publishing: no
`workspace:` ranges, resolvable declared exports, appropriate browser entries,
and the Node-safe BPMN diff entry. DMN's smoke bundles its consumer with esbuild
because its upstream extensionless browser imports do not resolve under bare
Node ESM. One parameterized workflow keeps the shared packing/publishing logic
consistent while allowing that consumer difference.

The [Yarn constraint](../../yarn.config.cjs) checks aligned dependency pins
between published packages and in-repo consumers, excluding peer dependencies;
conflicting shared pins fail rather than choosing one silently. Immutable CI
installs additionally catch lockfile drift. Package build/declaration checks and
the consumer smoke scripts enforce the distribution boundary.

## Consequences

Packages retain separate version lines while bundled feature/fix changes reach
the hosts that ship them. Routing exclusions and marker input sets are maintained
configuration, not inferred automatically from the module graph. npm publishing
uses short-lived identity with provenance; package bootstrap and trusted
publisher registration remain explicit setup steps.

External dependencies permit consumer plugin interoperability but make version
alignment and declared dependencies part of release correctness. BPMN currently
declares `tiny-svg` and `@lezer/lr` directly to cover upstream undeclared imports;
remove those bridges only when the corresponding upstream packages declare or
stop using them. Hoisted installs can hide those gaps, and strict Yarn PnP
compatibility is not established merely by a successful hoisted build.

Operational instructions live in the
[release guide](../vscode/contributing/release-process.md); architecture and
API decisions remain in their respective topic records.
