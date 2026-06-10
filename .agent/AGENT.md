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
corepack yarn test apps/vscode-plugin/src/shared/domain/BpmnDocument.spec.ts
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
  vscode-plugin/         # VS Code extension (Node/Webpack)
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

- **Extension host**: Webpack + `ts-loader` — `apps/vscode-plugin/webpack.config.js`
- **Webviews**: Vite — `apps/{bpmn,dmn}-webview/vite.config.mts`
- **Tests**: Vitest — `apps/vscode-plugin/vitest.config.ts`
- **Output**: `dist/apps/vscode-plugin/`

## Path Aliases (`tsconfig.base.json`)

- `@miragon/bpmn-modeler-shared` → `libs/shared/src/index.ts`
- Resolved by `TsconfigPathsPlugin` (webpack) and `vite-tsconfig-paths` (Vite)

## Configuration Namespace

All VS Code settings use the `miragon.bpmnModeler` namespace (e.g. `miragon.bpmnModeler.alignToOrigin`, `miragon.bpmnModeler.language`). Do **not** use the legacy `miragon.camundaModeler` prefix.

## Commit Conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
There is no commitlint/husky enforcement — the convention is upheld by
discipline, so match the existing history. Use `/commit` to generate a
conforming message.

**Format:** `<type>(<scope>): <subject>`

- **Subject:** imperative present tense, lowercase, no trailing period
  (e.g. `add`, not `added`/`adds`). Keep the header under ~72 characters.
- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`,
  `build`, `ci`, `perf`, `revert`.
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
