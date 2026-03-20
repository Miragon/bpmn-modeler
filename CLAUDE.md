# CLAUDE.md

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
corepack yarn dev               # Development watch mode
corepack yarn test              # Test (Jest)
corepack yarn lint              # Lint

# Target a single workspace
corepack yarn workspace vs-code-bpmn-modeler build
corepack yarn workspace bpmn-webview build

# Run a single test file
corepack yarn test --testPathPattern=apps/bpmn-modeler/src/service/bpmnUtils.spec.ts
```

## Workspace Structure

```
apps/
  modeler-plugin/  # VS Code extension (Node/Webpack)
  bpmn-webview/    # BPMN webview frontend (Vite/browser)
  dmn-webview/     # DMN webview frontend (Vite/browser)
libs/
  shared/          # Shared webview utilities and message types
```

## Build System

- **Extension host**: Webpack + `ts-loader` — `apps/bpmn-modeler/webpack.config.js`
- **Webviews**: Vite — `apps/{bpmn,dmn}-webview/vite.config.mts`
- **Tests**: Jest + `ts-jest` — `apps/bpmn-modeler/jest.config.ts`
- **Output**: `dist/apps/bpmn-modeler/`

## Path Aliases (`tsconfig.base.json`)

- `@bpmn-modeler/shared` → `libs/shared/src/index.ts`
- Resolved by `TsconfigPathsPlugin` (webpack) and `vite-tsconfig-paths` (Vite)

## Configuration Namespace

All VS Code settings use the `miragon.bpmnModeler` namespace (e.g. `miragon.bpmnModeler.alignToOrigin`, `miragon.bpmnModeler.language`). Do **not** use the legacy `miragon.camundaModeler` prefix.

## Deployment Webview (Dual-HTML Pattern)

The deployment sidebar has **two copies** of its HTML that must stay in sync:

- `apps/deployment-webview/index.html` — Vite development
- `apps/modeler-plugin/src/infrastructure/DeploymentWebviewHtml.ts` — runtime in VS Code

When modifying deployment form markup, update **both** files.
