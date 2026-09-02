# 0014 — Make the npm package the root release component; hosts release via sync markers

- Status: accepted
- Date: 2026-09-02
- Category: cross-cutting

## Context

The repo ships three independent release lines (`vscode`, `intellij`,
`bpmn-modeler`), driven by [release-please](https://github.com/googleapis/release-please),
which routes each commit purely by its changed file paths (see the
[release process](../vscode/contributing/release-process.md)). Two constraints of
that tool shape everything here:

1. **Only the root component (`.`) can watch multiple paths** — it receives
   *every* commit minus its `exclude-paths`; all other components are
   single-directory.
2. Commit scope (`feat(bpmn-modeler): …`) plays no role in routing.

Until now the **vscode** line held the root slot, with `exclude-paths` of only
`apps/intellij-plugin`, `docs`, `packages`. That mismatched the real coupling
twice over:

- **A breaking package change over-released vscode.** `5536855
  feat(bpmn-modeler)!` (#1430) also touched `apps/bpmn-webview`,
  `libs/modeler-types` and root tooling files — all falling through to the
  vscode catch-all, whose release PR became a spurious `2.0.0`. Nearly every
  breaking package change adapts the webview in the same PR, so this would
  recur.
- **Lib changes under-released the npm package.** `@miragon/bpmn-modeler`
  inlines 10 private libs at build time (`packages/bpmn-modeler/vite.config.mts`
  `INLINED_LIBS`), but its single path `packages/bpmn-modeler` never saw a
  libs-only change — the published artifact changed without a version bump.
  The IntelliJ line already worked around its variant of this gap with
  `sync-intellij-webview.yml` committing a `fix(intellij): sync bundled webview`
  marker under its own path.

## Decision

**Give the root slot to the published npm package** — the one artifact where
semver correctness is a hard requirement and whose sources genuinely span
multiple paths. The hosts become single-path components fed by patch-level
sync markers, generalizing the proven IntelliJ workaround:

- **bpmn-modeler** (root `.`): natively watches `packages/*` and the 10 inlined
  libs. `exclude-paths` removes `apps`, `docs`, `.github`, the host-side libs
  (`modeler-core`, `shared`, `standalone-extension`) **and every root-level
  tooling file/dir individually** (`yarn.lock`, `package.json`, `README.md`, …)
  — the root is a blocklist without globs, so otherwise every host PR touching
  `yarn.lock` would feed the npm line. New root files must be added to the
  list. Its changelog stays at `packages/bpmn-modeler/CHANGELOG.md` via
  `changelog-path`; the package's `package.json` is stamped via an extra-file.
- **vscode** (`apps/vscode-plugin`): watches only its own directory. Everything
  else it ships — the four webviews, the standalone app (kept in lockstep via
  repo-root-relative `extra-files`, leading `/`), `libs/modeler-core`,
  `libs/shared`, `libs/standalone-extension` and the npm-package sphere —
  arrives via title-mirroring marker commits (below). Its changelog moved
  from the repo root to `apps/vscode-plugin/CHANGELOG.md`.
- **intellij** (`apps/intellij-plugin`): unchanged mechanics; its marker moves
  into the shared `sync-release-markers.yml` workflow.
- **Unwatched by everyone**: `apps/demo-webapp`, `docs`, `.github`. Tooling and
  demo churn never releases anything.

Each shared `feat`/`fix` push produces **one marker commit** (touching the
marker file of every affected host) whose subject mirrors the triggering PR
title — PRs are squash-merged, so the pushed head commit *is* the PR title.
The marker keeps the title's type (`feat` → host minor, `fix` → host patch)
but **strips a breaking `!`**: a package-breaking change is not a host-breaking
change. `chore`/`docs`/`refactor` shared changes are skipped — they ship with
the next host release unattributed, a deliberate noise/value cut. Breaking
severity is signalled by *which component paths a squashed PR touches*: a host
a change genuinely breaks must touch that host's own directory (or use a
`Release-As:` footer) to major it.

## Consequences

- Package semver is now natively correct: a `!` in the package or its inlined
  libs majors `bpmn-modeler` and only `bpmn-modeler`. The pending spurious
  `vscode 2.0.0` regenerates without the breaking change; `bpmn-modeler`
  proceeds to `1.0.0`.
- A shared-source fix releases every line that ships it (hosts via markers), so
  nothing under-releases either.
- **Host changelogs stay truthful.** Each shared `feat`/`fix` appears under its
  real PR title in every bundling host's changelog, with the right bump
  (`feat(dmn-webview)` still minors vscode), attributed to the release that
  actually ships it — the marker lands on `main` immediately after the shared
  push, so a release PR can never ship unattributed `feat`/`fix` changes. Cost:
  one bot commit on `main` per shared `feat`/`fix` PR; `chore`/`docs`/
  `refactor` shared changes ship unattributed.
- The manifest keys moved (`.` → package version, `apps/vscode-plugin` → vscode
  version) and the root `package.json` version now tracks the npm package, not
  vscode. Tags are unaffected — release-please matches releases by
  component-in-tag (`vscode-v*`, `bpmn-modeler-v*`, `intellij-v*`), not path.
- `release-please.yml` output wiring flipped: root (unprefixed) outputs now
  drive the npm publish; vscode reads the `apps/vscode-plugin--` outputs.
- Neither marker file sits under a workflow trigger path, so marker pushes
  cannot cascade into more markers.

## Alternatives considered

- **Keep vscode as root, broaden its `exclude-paths`, add markers for the other
  two lines.** Rejected: lib changes would reach the *published package* only as
  patch markers — wrong semver where it matters most — while the multi-path root
  slot was spent on a host whose version is cosmetic.
- **List every bundled path on each component.** Impossible: non-root components
  are single-path in release-please.
- **Propagate breaking `!` through markers.** Rejected: it would major-bump
  lines the change doesn't actually break; the touch-the-host's-own-path
  convention gives intentional control.
- **One generic patch marker per release cycle** (fewer bot commits). Rejected:
  the host changelog degrades to a meaningless "sync" line, and any shared
  change landing after the marker but before the release-PR merge ships without
  ever being attributed.
- **Batch markers on a schedule with accumulated titles.** Rejected: a release
  PR merged between batches ships changes that then get attributed to the
  *next* release — a changelog that can lie is worse than a few bot commits.
