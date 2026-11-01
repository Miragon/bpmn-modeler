# Release and publishing

- Status: accepted
- Last reviewed: 2026-11-01

## Context

Published packages and IDE hosts have independent version lines but bundle
shared source. Release routing must account for changes in those shared inputs
without treating every package API break as a host break. Releases are cut
occasionally and usually ship every component with pending changes. npm
publishing also needs installable tarballs, consumer validation and
authentication without a standing CI token.

The standalone Linux app needs Git inside its Flatpak sandbox without requiring
users to install a full development SDK or allowing host-command execution.

## Contents

- [Release components and markers](#release-components-and-markers)
- [Release pull request](#release-pull-request)
- [Packing and publishing](#packing-and-publishing)
- [Standalone Linux Git](#standalone-linux-git)
- [Standalone built-in languages](#standalone-built-in-languages)
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
root files so unrelated tooling does not trigger npm releases. Docs and
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
The [release-marker spec](../../tools/repo-checks/src/releaseMarkers.spec.ts)
fails when a library either package inlines is missing from the workflow's
trigger paths or from its routing pattern.

Keeping VS Code as root would leave the npm package's inlined-library changes
under-versioned and could major-release VS Code for package-only breaks.
Generic patch or scheduled batch markers would lose meaningful changelog
entries or attribute already-shipped changes to a later release. The accepted
cost is a bot commit for each relevant shared feature/fix.

### Release pull request

Release-please maintains one combined Release PR for all components
(`separate-pull-requests: false`). Tags, changelogs and manifest entries stay
per component, and a component without releasable changes is simply absent from
the PR. Merging it starts one release run behind one `release-approval` gate and
publishes every included component. With one PR per component, every merge
started its own run and approval, and occasional releasers had to work out which
PRs to merge and in what order ([#1669](https://github.com/Miragon/bpmn-modeler/issues/1669)).

There is no release order to model. The two npm packages inline their libraries
and do not depend on each other, the hosts build the packages from source at
their own tag through `workspace:` ranges rather than the registry, and every
publish job in [release-please.yml](../../.github/workflows/release-please.yml)
waits only for the release-please and approval jobs.

The accepted cost is that a single component cannot be held back: once the
combined PR merges, every component with releasable changes ships. `Release-As`
only overrides a version, and release-please has no per-component skip. Holding
a component back has not been needed so far. Keeping separate PRs and
documenting them as order-independent was rejected because it keeps one run and
one approval per component.

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
conflicting shared pins fail rather than choosing one silently. It also fails
when an identity-sensitive bpmn-io package (bpmn-js, diagram-js, bpmn-moddle,
moddle, the properties panels, element templates, create-append-anything)
resolves to more than one version: a stale transitive range once nested a second
bpmn-js under camunda-bpmn-js, so Implement ran a different bpmn-js than
View/Design. CI also runs `yarn dedupe --check`. Dedupe only moves ranges up to
the highest locked version, so the constraint still catches two cases dedupe
cannot fix: an exact workspace pin older than a version a new transitive range
resolved to (bump the pin), and ranges that do not overlap (add a root
resolution). Dependabot never dedupes, so the
[dedupe workflow](../../.github/workflows/dependabot-dedupe.yml) commits
`yarn dedupe` onto its npm PRs with the release GitHub App; the App's private key
is therefore also a Dependabot secret. That workflow skips the link step, so no
lifecycle script of a bumped package runs next to the write token. To keep the
exact pins moving with their dependents, [Dependabot](../../.github/dependabot.yml)
groups the bpmn-io stack across all update types instead of splitting it into
the minor/patch and major groups; a major there holds back the stack's minors
until it lands or is closed. The webview
Vite configs dedupe the core of the identity-sensitive set as a second line of
defence. Immutable CI installs additionally catch lockfile drift. Package build/declaration checks and the consumer smoke scripts
enforce the distribution boundary.

Published packages keep exact pins even where an upstream regular dependency
declares the same identity-sensitive package with a caret range: bpmn-js for
`diagram-js` and `bpmn-moddle`, `@bpmn-io/diagram-js-ui` for `preact`, and the
dmn-js packages for `diagram-js`. Yarn Berry resolves each descriptor to its
highest match, so a consumer's fresh Yarn install nests a second copy under the
upstream package whenever upstream has released past our pin. npm and pnpm
reuse the pinned version. The package READMEs give Yarn consumers root
`resolutions` at our pins. The grouped Dependabot bpmn-io updates bound the lag
window to cooldown, merge and release. Caret ranges would break the exact-pin
rule. An exact peer dependency would not help, because the upstream caret
descriptor still resolves on its own. Bundling would break plugin
interoperability. Moving the monorepo to another package manager does not
change a consumer's resolver; [#1780](https://github.com/Miragon/bpmn-modeler/issues/1780)
evaluates pnpm on other grounds.

### Standalone Linux Git

Use `org.freedesktop.Platform` at runtime and `org.freedesktop.Sdk` only for
building. Bundle Git under `/app` from the checksum-pinned source archive in
[`git.yml`](../../apps/standalone/flatpak/git.yml), following
[Obsidian's packaging](https://github.com/flathub/md.obsidian.Obsidian/blob/master/md.obsidian.Obsidian.yml).
Disable Perl, Rust, and Tcl/Tk components; the modeler uses the Git CLI and its
HTTPS helper. The Platform runtime supplies SSH, and `--socket=ssh-auth` lets
sandboxed Git use the host's SSH agent.

The [release workflow](../../.github/workflows/publish-standalone.yml) checks
Git in the finished application's runtime rather than the build SDK. Running
the full SDK at runtime would ship unnecessary development tools; forwarding
Git to the host would require general host-command execution permission.

### Standalone built-in languages

The standalone host needs common syntax grammars without requiring users to
install extensions. Declare the Open VSX `eclipse-theia.builtin-extension-pack`
VSIX at version 1.104.0 in the standalone `theiaPlugins` manifest. Keep the
existing explicit `vscode.git` 1.95.3 pin rather than upgrading Git with this
language-support change.

Use Theia's standard downloader to expand `extensionPack` and resolve extension
dependencies during preparation and packaging; do not maintain a separate list
of downloaded language plugins. electron-builder copies the resulting plugins
as extra resources. The [runtime configuration test](../../apps/standalone/scripts/theia-runtime.test.mjs)
guards the pack pin, exact exclusions, retained language members and fatal
download errors; the
[packaged runtime test](../../apps/standalone/scripts/packaged-runtime.test.mjs)
checks representative language registrations and grammar files in the artifact.

Exclude only `vscode.prompt` and `vscode.terminal-suggest` via
`theiaPluginsExcludeIds`: the pack references both, but Open VSX returns no
versions for either ID. Theia's standard downloader otherwise fails the entire
preparation after resolving the remaining members. Keep all other download
errors fatal rather than enabling `--ignore-errors`. Recheck these exclusions
when updating the pack.

## Consequences

Packages retain separate version lines while bundled feature/fix changes reach
the hosts that ship them. They release together from one PR and one approval;
a single line cannot be held back. Routing exclusions and marker input sets are
maintained configuration, not inferred automatically from the module graph. npm
publishing uses short-lived identity with provenance; package bootstrap and
trusted publisher registration remain explicit setup steps.

External dependencies permit consumer plugin interoperability but make version
alignment and declared dependencies part of release correctness. Yarn Berry
consumers who skip the README `resolutions` can run two copies of diagram-js,
bpmn-moddle or preact while our pins lag upstream. BPMN currently
declares `tiny-svg` and `@lezer/lr` directly to cover upstream undeclared imports;
remove those bridges only when the corresponding upstream packages declare or
stop using them. Hoisted installs can hide those gaps, and strict Yarn PnP
compatibility is not established merely by a successful hoisted build.

The standalone package carries its own Git version and must update the source
URL and checksum for Git fixes. Users need neither host Git nor the SDK runtime.
Git and its subprocesses remain sandboxed; host-only credential helpers and
hook dependencies need sandbox-compatible alternatives.

Built-in language grammars work offline after installation. The pack manifest
is pinned, but its members and their dependencies resolve to the latest
Theia-compatible versions at download time, so the pin alone does not make
plugin downloads reproducible. Syntax grammars do not imply full language-server
support. Prompt-file support and terminal suggestions from the two unavailable
extensions do not ship; the selected common language grammars remain included.

Operational instructions live in the
[release guide](../vscode/contributing/release-process.md); architecture and
API decisions remain in their respective topic records.
