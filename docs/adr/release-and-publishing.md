# Release and publishing

- Status: accepted
- Last reviewed: 2026-11-18

## Context

Published packages and IDE hosts have independent version lines but bundle shared
source. Each line's notes must list the changes its users get and no other, and a
package API break must not count as a host break. Releases are cut occasionally
and usually ship every component with pending changes. npm and VS Code
Marketplace publishing need authentication without a standing CI token (Azure
DevOps retires the global PATs the Marketplace accepted on December 1, 2026, and
Open VSX offers the same OIDC exchange). Operational steps are in the
[release guide](../vscode/contributing/release-process.md); version alignment is in
[Dependencies](dependencies.md) and the standalone app's packaging in
[Standalone app](standalone-app.md).

## Contents

- [Release lines and attribution](#release-lines-and-attribution)
- [Release pull request](#release-pull-request)
- [Packing and publishing](#packing-and-publishing)
- [Orca plugin](#orca-plugin)
- [Consequences](#consequences)

## Decision

### Release lines and attribution

No release line watches source code. Release-please stays the version and
changelog engine, but each of the five lines is a `simple` package at
`release/<id>` (`version.txt`, `ATTRIBUTION`), and only the
[sync workflow](../../.github/workflows/sync-release-lines.yml) commits there. Its
changelog (`changelog-path`) and versioned files (`extra-files`) keep their places,
addressed from the repository root with a leading `/`. Tags stay
`<component>-v<version>`. The private root `package.json` is an extra file of
`bpmn-modeler`, as it followed the npm package when that package was the root.

| Line | Ships to |
| --- | --- |
| `bpmn-modeler` | npm `@miragon/bpmn-modeler` |
| `vscode` | VS Code Marketplace, Open VSX, standalone app |
| `intellij` | JetBrains Marketplace |
| `orca` | Miragon/orca-plugins |
| `dmn-modeler` | npm `@miragon/dmn-modeler` |

The [registry](../../.github/release-lines.json) says which paths each line ships,
which files no user receives (specs, tests, fixtures, READMEs) and which workspaces
no line ships. For every first-parent commit pushed to main,
[release-routing.mjs](../../.github/scripts/release-routing.mjs) decides the lines
of a `feat` or `fix` from its merged PR's declaration (below), else from its changed
files, and the sync workflow writes one attribution commit per line group through
[release-lines-sync.mjs](../../.github/scripts/release-lines-sync.mjs), which
holds the command line and the I/O. It changes
`release/<id>/ATTRIBUTION` of each line in the group, and its subject is the
commit's subject plus `[sync <short sha>]`. A breaking `!` stays only on the lines
whose `breaking` globs match a shipped file: the npm package's contract spans its
inlined libraries, a host breaks only through its own folder. `chore`, `docs` and
`refactor` reach no line, and the changelog sections are `feat` and `fix` only, so
a commit of another type that changes `release/<id>/` releases nothing. The sync
skips its own commits and release-please's, writes nothing twice, writes no commit
that leaves the tree unchanged and retries when main moves under it.

The files say what a line bundles, not what it offers: the merge view lives in
`libs/bpmn-merge`, which three lines bundle, but only VS Code opens it. So the PR
author declares the lines under "Ships in" in the PR body: one box per line and
`none` (no released user gets it). Ticked lines win; a ticked line that ships none
of the files is dropped; `none` attributes nothing; nothing ticked falls back to the
files. A ticked line may carry its own changelog subject
(`` `bpmn-modeler` as `fix(viewer): …` ``); lines with the same subject share one
attribution commit. The breaking `!` of every subject comes from the title and the
line's `breaking` globs, never from the wording, so a wording can neither drop a
major bump nor add one. Sync, `reconcile` and the audit read the merged PR's body as
it reads now, so the audit asks only for the ticked lines. The sync finds the PR by
the `(#N)` of the squash subject first, because GitHub may not have linked a
just-pushed commit to its PR yet. A commit without a merged PR follows its files,
and the step summary says so. The declaration is parsed in
[release-declaration.mjs](../../.github/scripts/release-declaration.mjs), the PR
rules in [release-check.mjs](../../.github/scripts/release-check.mjs), both pure;
[github-pull-requests.mjs](../../.github/scripts/github-pull-requests.mjs) is the
one place that reads a PR from GitHub, for the job, the sync and the hook.

The job "Validate release lines" in
[lint-pr-title.yml](../../.github/workflows/lint-pr-title.yml) runs the same rules
on every PR and on every body edit (`release-lines-sync.mjs check --pr`). It fails a
`feat`/`fix` whose files reach two or more lines with nothing ticked, and prints the
block to paste: those lines and `none`, unticked, each line with its `wiring`
question. It ticks nothing because a shared library such as `libs/bpmn-i18n-extras`
is in every line's `ships`, so a merge-view feat would come out ticked for all five
lines, and pasting it unchanged would pass. Translation files still count toward a
line: a translation-only fix must reach the lines that bundle it. It also fails a
ticked line that ships none of the files; `none` with a line; a breaking `!` whose
files hit a line's `breaking` globs without that line ticked; a
per-line subject that is no `feat`/`fix` subject or whose `!` differs from the
title's for that line; a box it cannot read; and any PR but the release PR (its
branch in this repository, not a fork's) that edits an existing line's folder under
`release/**`. A PR that adds a line may create the new line's folder. It runs only
the base branch's code with a read-only token, so it can be required. It reports on
every PR that starts workflows: a PR opened with `GITHUB_TOKEN` (such as
`update-engine-versions.yml`'s) starts none, the same gap the title check has. A
Claude Code `PostToolUse` hook
([ships-in-check.mjs](../../.claude/hooks/ships-in-check.mjs)) runs the check after
`gh pr create` and after a `gh pr edit` of the title or body of an open PR, because
that is the one moment the decision is made: it blocks the undeclared case and asks
Claude to confirm ticked lines by their wiring, which each line names in the
registry (`wiring`). It is one handler on every Bash call, spawned without a shell:
an `if` filter still runs on any `$()` command, and a shell-form path does not
expand in PowerShell. It fails open.

Cost: the author must know the wiring, and a wrong box is a wrong changelog. The
check catches boxes that contradict the files, not boxes that contradict the
wiring; the hook and the `architecture-review` skill ask for that. A body edited
after the merge changes no attribution already written: `reconcile` adds the
attributions of newly ticked lines, and an unticked line is removed only by hand
(see the release process); a section left empty falls back to the files, so the
last line is removed by ticking `none`. `bpmn-modeler`'s breaking glob is `**`, so a
breaking change to any file it bundles must tick it, even when the npm package does
not offer the change.

The specs hold the registry to the builds
([releaseLines.spec.ts](../../tools/repo-checks/src/releaseLines.spec.ts)) and the
registry, release-please configuration, manifest, `version.txt` files and versioned
files to each other
([releasePackages.spec.ts](../../tools/repo-checks/src/releasePackages.spec.ts)).
The [host webview spec](../../tools/repo-checks/src/hostWebviews.spec.ts) keeps the
publish workflows' installs and builds to the webviews each host ships.

Cost: the sync run now carries the notes. A failed or skipped run leaves a change
off its lines, so the
[release attribution check](../../.github/workflows/release-attribution.yml) fails
the release PR when a `feat`/`fix` since a line's last tag lacks its attribution,
and a `reconcile` dispatch of the sync adds what is missing. Every
other PR passes that check at once, so it can be required. release-please pushes
the release PR only when its body changes, which a missing attribution does not,
so a failed sync run re-runs the check; a sync that never ran is caught only by
re-running it before the merge. Only the commit's subject reaches a line: a source
PR's `BEGIN_COMMIT_OVERRIDE`, a `BREAKING CHANGE:` footer and a `Release-As:`
footer do not reach its attribution commits, so a break is marked with `!`.

Rejected: a root component with a blocklist of `exclude-paths`, because
release-please matches them as folder prefixes only, so top-level files such as
`yarn.lock` reached the npm notes, and native routing counted spec files. Path
markers per bundled folder (the previous `BUNDLED_WEBVIEW`/`BUNDLED_LIBS`), because
they copied every shared change into every line that bundles the folder. Labels,
because fork authors cannot set them and they are not in the history
release-please reads. Commit trailers for the declaration, because they depend on
the squash settings. The scope alone, because one scope maps to several lines and
the lines it names are wrong both ways. Rewriting the release PR's notes, because
every push to main regenerates the PR.

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
  two equal). The line started at `0.1.0`.
- One build writes both editor pages, so shared code ships once. The bundle ships
  unminified with sourcemaps but without the libraries' comments: Orca's listing
  policy forbids only code minified to hide what it does.

## Consequences

Packages keep separate version lines while bundled feature/fix changes reach the
lines that ship them, and everything releases together from one PR and one
approval. The registry is maintained configuration, checked against the builds by
specs rather than inferred from the module graph at release time. npm, VS Code Marketplace and Open VSX
publishing use short-lived identity; package bootstrap and trusted-publisher
registration remain explicit setup steps, and the workflow file name and
environment name are tied to each registry's policy.
