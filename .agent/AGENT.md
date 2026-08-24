# Agent Instructions

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

VS Code extension for BPMN/DMN process and Camunda Form modeling, built with **Yarn 4 workspaces**.
Detailed architecture knowledge is available via skills — invoke `/architecture`,
`/bpmn-js`, `/vscode-custom-editors`, `/vscode-webviews`, `/vscode-ux-guidelines`,
`/intellij-plugin`, `/i18n-translate`, or `/bpmn-browser-testing`.

## Commands

Use `corepack yarn` as the package manager. Build orchestration uses `npm-run-all`.

```bash
corepack yarn install           # Install dependencies
corepack yarn build             # Build everything (libs → webviews + plugin)
corepack yarn build:libs        # Build shared libraries only
corepack yarn watch             # Development watch mode (F5 Extension Host)
corepack yarn test              # Test (Vitest)
corepack yarn lint              # Lint

# IntelliJ plugin: build the webview/bridge artefacts, then launch a sandbox IDE
corepack yarn intellij:run      # = intellij:build (libs → webviews → bridge) + gradlew runIde
corepack yarn intellij:build    # refresh artefacts only (re-run after a webview change)

# Target a single workspace
corepack yarn workspace vs-code-bpmn-modeler build
corepack yarn workspace @miragon/bpmn-modeler-webview build

# Run a single test file
corepack yarn test libs/modeler-core/src/shared/domain/BpmnDocument.spec.ts
```

For the full IntelliJ dev/verify loop (prerequisites, sandbox behaviour, and how
to reproduce dark-mode webview bugs without launching a host) see
`apps/intellij-plugin/README.md`.

### Webview scripts (bpmn-webview, dmn-webview, form-webview, deployment-webview)

Each webview workspace has these scripts, one per workflow:

- `build` — one-shot bundle to `dist/webview-staging/<name>/`.
- `watch` — `vite build --watch`; rebuilds the bundle to disk. Used by the
  root `yarn watch` orchestrator (the VS Code extension host reads the files
  from disk via `webview.asWebviewUri`, so a dev HTTP server would not work
  here).
- `serve` — Vite HTTP dev server via for standalone browser preview.
- `dev` / `dev:app` — `dev` is only the [`portless`](https://portless.sh)
  entrypoint; the real Vite command lives in `dev:app`
  (`vite --port $PORT --host 127.0.0.1`). portless (a pinned dev dependency)
  serves the app under a stable `<worktree>.<app>.localhost` URL, with
  `portless.json` naming the app and pointing `dev` at `dev:app`. One-time
  per machine: `npx portless service install`.

At the root level: `yarn watch` runs the F5 orchestrator;
`yarn workspace @miragon/bpmn-modeler-webview serve` / `yarn workspace @miragon/dmn-modeler-webview serve` / `yarn workspace @miragon/form-modeler-webview serve` / `yarn workspace @miragon/bpmn-modeler-deployment-webview serve`
launch the per-webview dev server.

## Workspace Structure

```
apps/
  vscode-plugin/         # VS Code extension (Node/Webpack)
  bpmn-webview/          # BPMN webview frontend (Vite/browser)
  dmn-webview/           # DMN webview frontend (Vite/browser)
  form-webview/          # Camunda Form editor/preview frontend (Vite/browser)
  deployment-webview/    # Deployment sidebar webview (Vite/browser)
  intellij-plugin/       # IntelliJ host (Kotlin/Gradle, JCEF editors)
  modeler-bridge/        # stdio JSON-RPC Bun binary running modeler-core
                         # out-of-process for the IntelliJ host
  standalone/            # Theia/Electron desktop host shell
libs/
  modeler-core/          # Host-agnostic engine core (domain/service/
                         # infrastructure), consumed by all hosts (ADR #1060)
  shared/                # Shared webview utilities and message types
  append-menu/           # bpmn-js append-menu module
  bpmn-clipboard/        # bpmn-js clipboard modules
  bpmn-i18n/             # BPMN/DMN i18n
  code-link/             # Code-link feature
  element-template-chooser/ # Element-template chooser module
  model-navigation/      # Model navigation module
  standalone-extension/  # Theia frontend extension consumed by
                         # `apps/standalone/` (Miragon themes, splash,
                         # hidden built-in views)
```

The standalone Electron app is composed of the Theia shell (`apps/standalone/`)
plus a Theia frontend extension (`libs/standalone-extension/`). The extension
ships as its own package because Theia's generator only discovers
`theiaExtensions` declared on dependencies — see
`libs/standalone-extension/README.md` for details. Run
`yarn workspace @miragon/bpmn-modeler-standalone dev` for the full
build → package plugin → bundle → start chain.

## Build System

- **Extension host**: Webpack + `ts-loader` — `apps/vscode-plugin/webpack.config.js`
- **Webviews**: Vite — `apps/{bpmn,dmn,form,deployment}-webview/vite.config.mts`
- **Tests**: Vitest — root `vitest.config.ts` aggregates per-workspace projects
  (vscode-plugin, modeler-bridge, bpmn-webview, form-webview, bpmn-i18n,
  element-template-chooser, model-navigation, modeler-core, shared); root `test` =
  `vitest run --coverage`
- **Output**: `dist/apps/vscode-plugin/`

## Path Aliases (`tsconfig.base.json`)

Each `@miragon/...` alias maps to `libs/<dir>/src/index.ts`:

- `@miragon/bpmn-modeler-shared` → `libs/shared`
- `@miragon/bpmn-modeler-core` → `libs/modeler-core`
- `@miragon/bpmn-modeler-clipboard` → `libs/bpmn-clipboard`
- `@miragon/bpmn-modeler-i18n` → `libs/bpmn-i18n`
- `@miragon/bpmn-modeler-element-template-chooser` → `libs/element-template-chooser`
- `@miragon/bpmn-modeler-append-menu` → `libs/append-menu`
- `@miragon/bpmn-model-navigation` → `libs/model-navigation`
- `@miragon/bpmn-modeler-code-link` → `libs/code-link`
- Resolved by `TsconfigPathsPlugin` (webpack) and `vite-tsconfig-paths` (Vite)

## Configuration Namespace

All VS Code settings use the `miragon.bpmnModeler` namespace (e.g. `miragon.bpmnModeler.alignToOrigin`, `miragon.bpmnModeler.language`). Do **not** use the legacy `miragon.camundaModeler` prefix.

## Commit Conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
There is no local commitlint/husky hook, but CI validates the **PR title**
(`lint-pr-title.yml`). PRs are squash-merged, so the PR title is the commit
that lands on `main` and the line release-please reads to cut a release — it
must use one of the five types below. Intermediate commits on a branch are
upheld by discipline; match the existing history. Use `/commit` to generate a
conforming message.

**Format:** `<type>(<scope>): <subject>`

- **Subject:** imperative present tense, lowercase, no trailing period
  (e.g. `add`, not `added`/`adds`). Keep the header under ~72 characters.
- **Types:** the PR title must use one of the five release-please acts on:
  `feat` (minor bump), `fix` (patch bump), `refactor`, `docs`, `chore`. The
  other Conventional-Commit types (`style`, `test`, `build`, `ci`, `perf`,
  `revert`) are fine on intermediate branch commits, but fold them into `chore`
  for the PR title — they bump nothing and never reach the changelog.
- **Scope:** the affected workspace or feature, matching existing history —
  e.g. `bpmn-webview`, `dmn-webview`, `deployment-webview`, `vscode-plugin`,
  `editor`, `diff`, `domain`, `infrastructure`, `service`, `deps`, `release`.
  Omit the scope only when a change is genuinely repo-wide.
- **Body/footer:** optional. Explain the *why* in the body when the subject
  isn't self-explanatory; reference PRs/issues in the footer as the history
  does (e.g. `(#1056)`). Mark breaking changes with `!` after the
  type/scope (`feat(editor)!: …`) or a `BREAKING CHANGE:` footer.
- **No Claude attribution.** Do not add `Co-Authored-By` or
  "Generated with Claude Code" trailers (also enforced via `.claude/settings.json`).

Examples (from this repo's history):

```
fix(bpmn-webview): keep bpmn:Group transparent in dark mode (#1056)
refactor(editor): introduce EditorHandle port and split EditorStore
chore(release): bump version to 1.0.1
```

## Comment Style

Prefer clean code over comments. Write the minimum: no comment for what
the code already says, only a short one to *add* a non-obvious *why* — a
hidden constraint, an invariant the types can't express, the bug behind
this shape. If there's nothing to add, add nothing.

- Never restate the signature or narrate what the code does.
- When you do comment, be brief and precise — usually one line.
- Don't reference PRs, tickets, or callers; that belongs in git history.

## Deployment Webview (Single-Source Markup)

The deployment form's DOM lives in **one** place:
`apps/deployment-webview/src/app/formTemplate.ts` (`FORM_TEMPLATE`), which
`main.ts` injects into `#app` at runtime. Every host shell ships only an empty
`<div id="app"></div>` and lets the bundle render the body:

- `apps/deployment-webview/index.html` — Vite dev shell.
- `apps/vscode-plugin/src/deployment/infrastructure/DeploymentWebviewHtml.ts` —
  VS Code runtime shell (keeps the CSP nonce + asset-URI injection).
- IntelliJ deployment tool-window shell (`WebviewServer.kt`).

When changing the form markup, edit **only** `formTemplate.ts` — the shells no
longer carry a copy to keep in sync.
