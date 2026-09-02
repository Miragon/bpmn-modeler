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
  arrives via a `fix(vscode): sync bundled sources` marker. Its changelog moved
  from the repo root to `apps/vscode-plugin/CHANGELOG.md`.
- **intellij** (`apps/intellij-plugin`): unchanged mechanics; its marker moves
  into the shared `sync-release-markers.yml` workflow.
- **Unwatched by everyone**: `apps/demo-webapp`, `docs`, `.github`. Tooling and
  demo churn never releases anything.

Markers are always `fix(...)` — a **patch** bump — regardless of the underlying
commit's severity. Severity is signalled by *which component paths a squashed PR
touches*: a host a change genuinely breaks must touch that host's own directory
(or use a `Release-As:` footer) to major it.

## Consequences

- Package semver is now natively correct: a `!` in the package or its inlined
  libs majors `bpmn-modeler` and only `bpmn-modeler`. The pending spurious
  `vscode 2.0.0` regenerates without the breaking change; `bpmn-modeler`
  proceeds to `1.0.0`.
- A shared-source fix releases every line that ships it (hosts via markers), so
  nothing under-releases either.
- **Host feature work outside the host's own directory lands as a generic patch
  marker** — e.g. a `feat(dmn-webview)` no longer minors vscode or gets its own
  changelog line. Accepted: user-visible host features almost always touch the
  host directory too (command/setting/editor registration), and host version
  numbers are cosmetic next to library semver.
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
- **Encode severity in markers (e.g. a `feat!` marker).** Rejected: it would
  propagate a breaking bump to lines the change doesn't actually break; the
  touch-the-host's-own-path convention gives intentional control.
