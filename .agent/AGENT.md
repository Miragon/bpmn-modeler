# Agent Instructions

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

VS Code extension for BPMN/DMN process modeling, built with **Yarn 4 workspaces**.
Detailed architecture knowledge is available via skills — invoke `/architecture`,
`/bpmn-js`, `/vscode-custom-editors`, `/vscode-webviews`, or `/vscode-ux-guidelines`.

## Commands

Use `corepack yarn` as the package manager. Build orchestration uses `npm-run-all`.

```bash
corepack yarn install           # Install dependencies
corepack yarn build             # Build everything (libs → webviews + plugin)
corepack yarn build:libs        # Build shared libraries only
corepack yarn watch             # Development watch mode (F5 Extension Host)
corepack yarn test              # Test (Jest)
corepack yarn lint              # Lint

# Target a single workspace
corepack yarn workspace vs-code-bpmn-modeler build
corepack yarn workspace @miragon/bpmn-modeler-webview build

# Run a single test file
corepack yarn test --testPathPattern=apps/bpmn-modeler/src/service/bpmnUtils.spec.ts
```

### Webview scripts (bpmn-webview, dmn-webview, deployment-webview)

Each webview workspace has three scripts, one per workflow:

- `build` — one-shot bundle to `dist/webview-staging/<name>/`.
- `watch` — `vite build --watch`; rebuilds the bundle to disk. Used by the
  root `yarn watch` orchestrator (the VS Code extension host reads the files
  from disk via `webview.asWebviewUri`, so a dev HTTP server would not work
  here).
- `serve` — Vite HTTP dev server via for standalone browser preview.

At the root level: `yarn watch` runs the F5 orchestrator;
`yarn workspace @miragon/bpmn-modeler-webview serve` / `yarn workspace @miragon/dmn-modeler-webview serve` / `yarn workspace @miragon/bpmn-modeler-deployment-webview serve`
launch the per-webview dev server.

## Workspace Structure

```
apps/
  modeler-plugin/        # VS Code extension (Node/Webpack)
  bpmn-webview/          # BPMN webview frontend (Vite/browser)
  dmn-webview/           # DMN webview frontend (Vite/browser)
  deployment-webview/    # Deployment sidebar webview (Vite/browser)
  standalone/            # Theia/Electron desktop host shell
libs/
  shared/                # Shared webview utilities and message types
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

- **Extension host**: Webpack + `ts-loader` — `apps/bpmn-modeler/webpack.config.js`
- **Webviews**: Vite — `apps/{bpmn,dmn}-webview/vite.config.mts`
- **Tests**: Jest + `ts-jest` — `apps/bpmn-modeler/jest.config.ts`
- **Output**: `dist/apps/bpmn-modeler/`

## Path Aliases (`tsconfig.base.json`)

- `@miragon/bpmn-modeler-shared` → `libs/shared/src/index.ts`
- Resolved by `TsconfigPathsPlugin` (webpack) and `vite-tsconfig-paths` (Vite)

## Configuration Namespace

All VS Code settings use the `miragon.bpmnModeler` namespace (e.g. `miragon.bpmnModeler.alignToOrigin`, `miragon.bpmnModeler.language`). Do **not** use the legacy `miragon.camundaModeler` prefix.

## Deployment Webview (Dual-HTML Pattern)

The deployment sidebar has **two copies** of its HTML that must stay in sync:

- `apps/deployment-webview/index.html` — Vite development
- `apps/modeler-plugin/src/infrastructure/DeploymentWebviewHtml.ts` — runtime in VS Code

When modifying deployment form markup, update **both** files.
