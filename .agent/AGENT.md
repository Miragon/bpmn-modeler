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
corepack yarn test              # Test (Vitest)
corepack yarn lint              # Lint

# Target a single workspace
corepack yarn workspace vs-code-bpmn-modeler build
corepack yarn workspace @miragon/bpmn-modeler-webview build

# Run a single test file
corepack yarn test apps/modeler-plugin/src/service/bpmnUtils.spec.ts
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
- **Tests**: Vitest — `apps/modeler-plugin/vitest.config.ts`
- **Output**: `dist/apps/bpmn-modeler/`

## Path Aliases (`tsconfig.base.json`)

- `@miragon/bpmn-modeler-shared` → `libs/shared/src/index.ts`
- Resolved by `TsconfigPathsPlugin` (webpack) and `vite-tsconfig-paths` (Vite)

## Configuration Namespace

All VS Code settings use the `miragon.bpmnModeler` namespace (e.g. `miragon.bpmnModeler.alignToOrigin`, `miragon.bpmnModeler.language`). Do **not** use the legacy `miragon.camundaModeler` prefix.

## Comment Style

Write comments that explain **why**, not **what**. Identifier names and
the code itself already say what is happening; a good comment captures
the non-obvious reason it has to be that way — a hidden constraint, an
invariant the type system can't express, the bug that motivated this
shape, a surprise the next reader would otherwise re-discover.

- Skip the comment if you can't articulate a non-obvious *why*. Silence
  beats noise.
- Be precise. Name the constraint, the failure mode, or the source. Avoid
  hedges ("maybe", "should probably") and filler ("this function does X").
- Don't bloat. One or two crisp sentences is almost always enough; if
  more is needed, link to a design doc or test rather than re-deriving
  the reasoning inline.
- Don't reference the current PR, ticket, or caller ("added for #123",
  "used by X"). That belongs in the commit message and rots in the
  source.

Use JSDoc (`/** ... */`) for documentation that sits above a
**class, function, method, or module** (top-of-file docstring) —
that's what IDE hover popups read; `//` line comments don't show up.
Multi-line form is preferred when the doc spans more than one
sentence or carries `@param`/`@returns` tags; a single-line
`/** … */` is fine for a one-sentence rationale. Use `//` for
inline notes — a tricky block, a property, the reason for one line.

Good — declaration doc as JSDoc, inline rationale as `//`:

```ts
/**
 * Persists a partial webview state without clobbering existing entries.
 *
 * `@bpmn-io/properties-panel` puts the `open` class on the header child,
 * never on the group root, so the panel's body element differs between
 * regular and list groups. The header is the only element common to
 * both that reliably tracks expansion state.
 */
function isGroupOpen(group: HTMLElement): boolean {
    // First rAF lets Preact commit the click-induced re-renders before
    // we read scrollHeight.
    ...
}
```

Noise (deletes cleanly):

```ts
/** Returns true if the group is open. */   // ❌ restates the signature
function isGroupOpen(group: HTMLElement): boolean { ... }
```

## Deployment Webview (Dual-HTML Pattern)

The deployment sidebar has **two copies** of its HTML that must stay in sync:

- `apps/deployment-webview/index.html` — Vite development
- `apps/modeler-plugin/src/infrastructure/DeploymentWebviewHtml.ts` — runtime in VS Code

When modifying deployment form markup, update **both** files.
