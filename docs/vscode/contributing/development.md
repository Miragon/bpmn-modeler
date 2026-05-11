# Contributor Guide

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing & Linting](#testing--linting)
- [Code Style](#code-style)
- [Branching & Commits](#branching--commits)
- [CI/CD](#cicd)
- [Architecture Overview](#architecture-overview)

## Prerequisites

- **Node.js** v20 or later
- **corepack on `PATH`** and enabled. `corepack --version` must resolve in the
  shell you run `yarn install` from — the build scripts invoke
  `corepack yarn …` directly. If it prints `command not found` (Volta and a
  few other version managers don't ship a `corepack` shim), install it first:
  ```bash
  npm install -g corepack@latest
  corepack enable
  ```
  Standard Node distributions already include `corepack`; `corepack enable` is
  enough.
- **VS Code**

The webview `dev:*` scripts (standalone browser preview) use
[`portless`](https://www.npmjs.com/package/portless), which is installed
automatically as a dev dependency by `yarn install` — no global install
required.

## Setup

```bash
yarn install
```

## Project Structure

This is a Yarn 4 workspace monorepo containing a single VS Code extension (Camunda
Modeler) and its supporting packages:

| Workspace              | Path                  | Description                           |
|------------------------|-----------------------|---------------------------------------|
| `vs-code-bpmn-modeler` | `apps/modeler-plugin` | VS Code extension host (Node/Webpack) |
| `@miragon/bpmn-modeler-webview` | `apps/bpmn-webview`   | BPMN editor UI (Vite/browser)         |
| `@miragon/dmn-modeler-webview`  | `apps/dmn-webview`    | DMN editor UI (Vite/browser)          |
| `@miragon/bpmn-modeler-shared` | `libs/shared`         | Shared message types and utilities    |

### Workspace dependencies

Every workspace declares its own runtime and build dependencies in its
own `package.json`. The root `package.json` only carries cross-cutting
tooling (eslint, prettier, npm-run-all, typescript). This lets CI install
just the tree it needs via `yarn workspaces focus`:

```bash
# Modeler-only tree (no Theia, no native-keymap, no apt-step required)
yarn workspaces focus bpmn-modeler vs-code-bpmn-modeler @miragon/bpmn-modeler-webview \
  @miragon/dmn-modeler-webview @miragon/bpmn-modeler-deployment-webview @miragon/bpmn-modeler-shared @miragon/bpmn-modeler-append-menu \
  @miragon/bpmn-modeler-clipboard @miragon/bpmn-modeler-i18n \
  @miragon/bpmn-modeler-element-template-chooser \
  @miragon/create-append-c7-element-templates

# Just the c7 npm lib
yarn workspaces focus bpmn-modeler @miragon/create-append-c7-element-templates

# Just the docs site
yarn workspaces focus bpmn-modeler docs

# Full repo (needed for the standalone Theia app)
yarn install
```

The standalone app (`apps/standalone`) pulls Theia + `native-keymap`,
whose `node-gyp` postinstall needs `libx11-dev libxkbfile-dev
libsecret-1-dev` on Linux — which is why only the full-install workflow
(`build.yml`) runs the apt-step.

## Development Workflow

### Build

```bash
# Build everything (libs → webviews + plugin in parallel)
yarn build

# Build only the shared libraries
yarn build:libs
```

### Watch mode

```bash
# Rebuild all workspaces on change (feeds the F5 Extension Host)
yarn watch
```

### Docs site

```bash
yarn docs:dev
```

Opens the VitePress docs site in your browser.

### Run the extension in VS Code

1. Open the repository root in VS Code.
2. Run `yarn watch` to start watch mode.
3. Open the **Run and Debug** panel and select **"Run modeler-plugin"**.
4. Press **F5** to launch the Extension Development Host.

To reload the extension host after a change, press **Cmd+R** (macOS) or **Ctrl+R** (
Windows/Linux).

### Target a single workspace

```bash
yarn workspace vs-code-bpmn-modeler build
yarn workspace @miragon/bpmn-modeler-webview build
```

### Preview the BPMN webview in a plain browser

The BPMN webview can run standalone against a mocked VS Code host. This avoids
reloading the Extension Development Host while iterating on webview UI.

```bash
yarn dev:bpmn-webview
```

This launches a Vite dev server via [`portless`](#prerequisites); the URL is
printed to stdout when the server starts.

A URL query parameter selects what the mock serves:

| URL                                      | What renders                                                                                 |
|------------------------------------------|----------------------------------------------------------------------------------------------|
| `/` (or `?mode=modeler`)                 | Full editable Camunda modeler with a hardcoded sample diagram — matches the production modeler experience. |
| `/?mode=diff-before`                     | Readonly **before** (left) pane of a diff view, with highlights for removed / changed / moved elements.    |
| `/?mode=diff-after`                      | Readonly **after** (right) pane, with highlights for added / changed / moved elements.                     |

The diff modes run `bpmn-js-differ` against two fixture XMLs
(`apps/bpmn-webview/src/app/__fixtures__/mock-diff.ts`) so highlights reflect
the real differ's output. All mock code and its dependencies are gated on
`NODE_ENV === "development"` and tree-shaken out of the production webview
bundle.

## Testing & Linting

```bash
# Run all tests (includes coverage by default)
yarn test

# Run a single test file
yarn test --testPathPattern=apps/modeler-plugin/src/service/bpmnUtils.spec.ts

# Lint
yarn lint
```

Coverage reports are uploaded
to [Codecov](https://app.codecov.io/gh/Miragon/bpmn-modeler)
on CI.

## Code Style

| Tool             | Configuration       | Key rules                                           |
|------------------|---------------------|-----------------------------------------------------|
| **EditorConfig** | `.editorconfig`     | 4-space indent, LF line endings, max 89 chars       |
| **Prettier**     | `.prettierrc`       | Double quotes, trailing commas, arrow parens always |
| **ESLint**       | `eslint.config.mjs` | TypeScript strict                                   |

Prettier and ESLint are enforced by the lint step in CI.

## Branching & Commits

### Branching model

```mermaid
gitGraph
    commit
    branch feat/feature2
    checkout feat/feature2
    commit
    checkout main
    branch feat/feature1
    checkout feat/feature1
    commit
    commit
    checkout feat/feature2
    commit
    commit
    checkout main
    merge feat/feature1
    checkout feat/feature2
    merge main
    commit
    checkout main
    merge feat/feature2
```

### Commit messages

Use semantic commit messages scoped to the affected workspace:

```
feat(bpmn): add token simulation toolbar
fix(dmn): correct decision table rendering
chore(shared): update message type definitions
```

Common types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`.

## CI/CD

| Workflow            | Trigger                                                  | Purpose                                                                       |
|---------------------|----------------------------------------------------------|-------------------------------------------------------------------------------|
| **Build**           | every push / PR                                          | lint → test → build, full install (apt-step for Theia native modules)         |
| **PR Labeler**      | PR opened / updated                                      | auto-labels PRs by changed workspace                                          |
| **Prepare Release ***| manual (`workflow_dispatch`)                            | bump version, sanity build, commit, tag, create GitHub Release                |
| **Publish ***       | `release: published` (or `workflow_dispatch` + dry-run)  | build artefact, attach to release, push to Marketplace / npm / GitHub Release |
| **Deploy Docs**     | `release: published` / manual                            | VitePress build + GitHub Pages deploy                                         |

There are three `prepare-*` and three `publish-*` workflows — one pair
per artefact (VS Code extension, c7 npm lib, standalone macOS app). See
[Release process](./release-process) for the operational guide and the
pipeline flow diagram.

## Architecture Overview

The extension uses a **flat service architecture** with plain constructor wiring — no DI
framework.

```
apps/modeler-plugin/src/
  domain/         # Pure domain types — no external dependencies
  infrastructure/ # VS Code API adapters (EditorStore, VsCodeDocument, …)
  service/        # Business logic (BpmnModelerService, ArtifactService, …)
  controller/     # VS Code events → service calls
  main.ts         # Wiring: EditorStore → VsCode* → Services → Controllers
```

Key design decisions:

- **Echo prevention**: each open editor gets a `ModelerSession` guard that blocks the
  `onDidChangeTextDocument` echo caused by the extension's own document write.
- **Element template discovery**: convention-based — no project config file needed.
  Templates are resolved under `<configFolder>/element-templates/` walking up from the
  BPMN file to the workspace root.
- **Webview communication**: `postMessage` with typed message contracts defined in
  `libs/shared`.

See `CLAUDE.md` in the repository root for the full architectural reference.
