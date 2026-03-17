# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in
this repository.

## Project Overview

The BPMN modeler is a VS Code extension for BPMN/DMN process modeling, built with **Yarn
4
workspaces**. It provides:

- **Camunda Modeler** (`bpmn-modeler`): BPMN 2.0 and DMN diagram editor for Camunda 7 and
  8

## Commands

Use `corepack yarn` as the package manager (required in non-interactive shells like
Claude Code's Bash tool). Build orchestration uses `npm-run-all`.

```bash
# Install dependencies
corepack yarn install

# Build everything (libs → webviews + plugin in parallel)
corepack yarn build

# Build only the shared libraries
corepack yarn build:libs

# Development watch mode
corepack yarn dev

# Test (Jest, extension host only)
corepack yarn test

# Lint
corepack yarn lint

# Target a single workspace directly
corepack yarn workspace vs-code-bpmn-modeler build
corepack yarn workspace bpmn-webview build

# Run a single test file (Jest)
corepack yarn test --testPathPattern=apps/bpmn-modeler/src/service/bpmnUtils.spec.ts
```

## Architecture

### Project Structure

```
apps/
  modeler-plugin/  # VS Code extension: BPMN/DMN editor (Node/Webpack)
  bpmn-webview/    # Webview frontend for BPMN (Vite/browser)
  dmn-webview/     # Webview frontend for DMN (Vite/browser)
libs/
  shared/          # Shared webview utilities and message types
```

### Service Architecture (Flat, No DI Framework)

The extension (`modeler-plugin`) uses a flat service architecture with plain constructor
wiring:

```
src/
  domain/           # Pure domain types — no external dependencies
    session.ts      # ModelerSession: per-editor echo-prevention guard counter
    model.ts        # BpmnModelerSetting, SettingBuilder
    errors.ts       # Domain error types
  infrastructure/   # VS Code API adapters
    EditorStore.ts  # Per-editor Map; manages subscriptions, postMessage
    VsCodeDocument.ts
    VsCodeWorkspace.ts
    VsCodeSettings.ts
    VsCodeUI.ts
    WebviewHtml.ts
  service/          # Business logic — owns per-editor ModelerSession maps
    BpmnModelerService.ts  # sync + display use cases; implements ArtifactChangeTarget
    DmnModelerService.ts
    ArtifactService.ts     # Convention-based element-template discovery + file watchers
    bpmnUtils.ts           # Shared BPMN helpers
  controller/       # VS Code event → service call
    BpmnEditorController.ts
    DmnEditorController.ts
    CommandController.ts
  main.ts           # Plain constructor wiring: EditorStore → VsCode* → Services → Controllers
```

### Session Management (Echo Prevention)

Each open editor gets its own `ModelerSession` owned by the service:

1. Webview sends `SyncDocumentCommand` → `BpmnModelerService.sync()` acquires guard →
   writes document
2. Write triggers `onDidChangeTextDocument`
3. `BpmnModelerService.display()` checks `session.isGuarded()` → returns early (no echo)
4. Guard released in `finally` block

### Webview Communication

Webview apps communicate via `postMessage`. Message types:
`libs/shared/src/lib/messages.ts`. Webviews built into
`dist/apps/bpmn-modeler/<webview-name>/` and copied into the extension output by
`CopyWebpackPlugin`.

### Path Aliases (tsconfig.base.json)

- `@bpmn-modeler/shared` → `libs/shared/src/index.ts`

Resolved by `TsconfigPathsPlugin` (webpack) and `vite-tsconfig-paths` (Vite).

### Build System

- **Extension host** (Node): Webpack + `ts-loader` —
  `apps/bpmn-modeler/webpack.config.js`
- **Webviews** (browser): Vite — `apps/{bpmn,dmn}-webview/vite.config.mts`
- **Tests**: Jest + `ts-jest` — `apps/bpmn-modeler/jest.config.ts`
- Output: `dist/apps/bpmn-modeler/`

### Deployment Webview (Dual-HTML Pattern)

The deployment sidebar has **two copies** of its HTML structure that must stay in sync:

- `apps/deployment-webview/index.html` — used by Vite during development
- `apps/modeler-plugin/src/infrastructure/DeploymentWebviewHtml.ts` — inline HTML served
  at runtime inside VS Code

When modifying the deployment form markup, update **both** files.

### Element Template Discovery

`ArtifactService` uses a convention-based approach: element templates are searched under
`<configFolder>/element-templates/` at each directory level from the BPMN file up to the
workspace root. The config folder name (default: `.camunda`) is read from the
`miragon.bpmnModeler.configFolder` VS Code setting. No project-level config file is
required.
