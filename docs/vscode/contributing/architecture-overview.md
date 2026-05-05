# Architecture overview

This page is the gateway to the feature-internals docs. Every
`contributing/architecture/<feature>.md` page assumes the mental model below.
Read this once, then dive into a specific feature.

## Mental model

A Miragon BPMN Modeler session is two cooperating processes:

- The **extension host** (Node, built with webpack) runs inside VS Code. It
  owns the filesystem, VS Code APIs, the deployment sidebar backend, and all
  long-lived domain services.
- A **webview** (browser iframe, built with Vite) runs the bpmn-js / dmn-js
  modeler itself. Each open `.bpmn` or `.dmn` file has its own webview. A diff
  produces two webviews for one file.

These two processes talk through **typed message contracts** defined in
`libs/shared/src/lib/modeler.ts`. There is no shared memory and no direct
function calls — everything crosses via `postMessage`.

The same extension is shipped two ways:

- as a **`.vsix`** to the VS Code Marketplace (the primary delivery channel), and
- bundled into a **standalone Theia/Electron desktop app** (`apps/standalone`),
  which loads the very same `.vsix` as a Theia plugin. The host/webview split
  above is identical in both delivery modes.

## Monorepo layout

```
apps/
  modeler-plugin/     # Extension host (Node, webpack) — produces the .vsix
  bpmn-webview/       # BPMN webview (browser, Vite)
  dmn-webview/        # DMN webview (browser, Vite)
  deployment-webview/ # Deployment sidebar UI (Vite)
  standalone/         # Theia/Electron shell — bundles the .vsix into a desktop app
libs/
  shared/                        # Message contracts, cross-process utils
  bpmn-clipboard/                # bpmn-js DI module (copy/paste)
  bpmn-i18n/                     # bpmn-js DI module (translations)
  append-menu/                   # bpmn-js DI module (custom append UI)
  element-template-chooser/      # bpmn-js DI module (template picker)
  create-append-c7-element-templates/ # bpmn-js polyfill for C7 template creation (npm-published)
```

| Workspace | Lives at | What it does |
|---|---|---|
| `vs-code-bpmn-modeler` | `apps/modeler-plugin` | VS Code extension host entry; produces the `.vsix` |
| `@miragon/bpmn-modeler-webview` | `apps/bpmn-webview` | BPMN editor UI + diff viewer |
| `@miragon/dmn-modeler-webview` | `apps/dmn-webview` | DMN editor UI |
| `@miragon/bpmn-modeler-deployment-webview` | `apps/deployment-webview` | Deploy / Start Instance sidebar UI |
| `@miragon/bpmn-modeler-standalone` | `apps/standalone` | Theia/Electron shell — bundles the `.vsix` into a signed macOS DMG |
| `@miragon/bpmn-modeler-shared` | `libs/shared` | Message types, cross-process utilities |
| `@miragon/bpmn-modeler-clipboard` | `libs/bpmn-clipboard` | bpmn-js DI module for clipboard integration |
| `@miragon/bpmn-modeler-i18n` | `libs/bpmn-i18n` | bpmn-js DI module for translations |
| `@miragon/bpmn-modeler-append-menu` | `libs/append-menu` | Preact-based append menu overlay |
| `@miragon/bpmn-modeler-element-template-chooser` | `libs/element-template-chooser` | Preact-based template chooser overlay |
| `@miragon/create-append-c7-element-templates` | `libs/create-append-c7-element-templates` | Standalone npm-publishable bpmn-js polyfill for Camunda 7 template creation |

Most `libs/*` are source-only — the consuming Vite/webpack build compiles the
TypeScript and TSX files directly via the `@miragon/bpmn-modeler-<lib>` path alias.
Two libs have their own `tsc` build step:
`@miragon/bpmn-modeler-shared` (compiled because it's also consumed by the extension host),
and `@miragon/create-append-c7-element-templates` (compiled because it's
published to npm as a standalone artefact).

## Extension host vs webview

| Concern | Extension host | Webview |
|---|---|---|
| File I/O | yes (`vscode.workspace.fs`) | no |
| VS Code API | yes | no (bridged via messages) |
| `vscode.env.clipboard` | yes | no (bridged) |
| bpmn-js / dmn-js modeler | no | yes |
| Preact overlays | no | yes |
| Long-lived services | yes (`EditorStore`, `BpmnModelerService`, …) | no |
| Per-editor lifecycle | yes (`ModelerSession` per editor) | one per open `.bpmn`/`.dmn` tab |

The extension host uses a **flat service architecture** with plain constructor
wiring — no DI framework. Layers:

```
apps/modeler-plugin/src/
  domain/         Pure types — no external deps
  infrastructure/ VS Code API adapters (EditorStore, VsCodeDocument, …)
  service/        Business logic (BpmnModelerService, ArtifactService, …)
  controller/     VS Code events → service calls
  main.ts         Wiring root: builds the dependency graph
```

A webview module (`apps/bpmn-webview`) wires up bpmn-js via `BpmnModeler.create()`
and passes additional DI modules (clipboard, i18n, append-menu, template-chooser).
bpmn-js itself **uses didi**, a small DI framework inherited from the upstream
bpmn-js / diagram-js projects.

## Webview ↔ extension-host bridge

Messages are plain-object payloads wrapped in **`Query` and `Command` classes**
defined in `libs/shared/src/lib/modeler.ts`:

- **`Command`** — one-way message, fire and forget. Usually webview → host to
  request an action or notify of state.
- **`Query`** — one-way message that expects a corresponding response Query in
  the other direction. Host → webview Queries typically deliver data (e.g.
  `BpmnFileQuery` carries the XML when an editor opens).

The convention across the codebase:

- Webview → host: `SetXCommand`, `GetXCommand`, `XChangedCommand`.
- Host → webview: `XQuery` (deliver X) or `ApplyXQuery` (apply X to the pane).

Example (clipboard):

| Direction | Class | Purpose |
|---|---|---|
| webview → host | `GetClipboardCommand` | request element clipboard text |
| webview → host | `SetClipboardCommand` | write element clipboard text |
| host → webview | `ClipboardQuery` | deliver element clipboard text |

Each feature page lists its own message protocol.

## bpmn-js / diagram-js DI — the 30-second primer

bpmn-js is composed from **DI modules** (didi). A module is an object like:

```ts
export const MyModule = {
    __init__: ["myService"],
    myService: ["type", MyService],
};
```

didi constructs `myService` once per modeler instance and injects it wherever
another service names `myService` in its constructor's parameter list (via the
`$inject` static). Registering your module means passing it in
`additionalModules` when you instantiate the modeler:

```ts
new BpmnModeler({ additionalModules: [MyModule, ...] });
```

**Event priorities.** Many bpmn-js services use `EventBus` handlers with a
numeric priority. Higher priority runs first. Returning a non-`undefined` value
(including `false`) stops propagation. This is how `VsCodeClipboardModule`
intercepts copy at priority 2051 (above `NativeCopyPaste`'s 2050) — see the
[Copy & Paste internals](./architecture/copy-paste).

**Patching existing services.** Several of our modules decorate a core bpmn-js
method rather than adding a new service — e.g. `AppendMenuOverride` wraps
`popupMenu.open()`. didi doesn't stop you; just save the original and call it
(or not) from the replacement.

## Build pipelines

| Target | Tool | Config |
|---|---|---|
| Extension host (`.vsix`) | webpack + ts-loader | `apps/modeler-plugin/webpack.config.js` |
| BPMN webview | Vite | `apps/bpmn-webview/vite.config.mts` |
| DMN webview | Vite | `apps/dmn-webview/vite.config.mts` |
| Deployment webview | Vite | `apps/deployment-webview/vite.config.mts` |
| Standalone macOS DMG | `@theia/cli` + electron-builder | `apps/standalone/package.json`, `apps/standalone/electron-builder.yml` |
| Shared lib (`@miragon/bpmn-modeler-shared`) | tsc | `libs/shared/tsconfig.lib.json` |
| c7 npm lib | tsc | `libs/create-append-c7-element-templates/tsconfig.lib.json` |
| Tests | Vitest | `apps/modeler-plugin/vitest.config.ts` |
| Path alias resolution | `TsconfigPathsPlugin` (webpack), `vite-tsconfig-paths` (Vite) | `tsconfig.base.json` |

`yarn build` in the repo root uses `npm-run-all` to build libs first, then the
webviews and the extension plugin in parallel. `yarn dev` runs all of them in
watch mode; press F5 in VS Code to launch the Extension Development Host against
the watch build.

## Where to find things

| Task | Start here |
|---|---|
| Run the extension locally | [Development](./development) — Setup + F5 workflow |
| Add a new VS Code setting | `apps/modeler-plugin/package.json` → `contributes.configuration` + `VsCodeSettings` reader |
| Add a new webview message type | `libs/shared/src/lib/modeler.ts` — add the class, re-export, consume in both ends |
| Wire a new bpmn-js DI module | Create `libs/<name>/src/index.ts`, export the module, pass to `BpmnModeler.create({ additionalModules: [...] })` in `apps/bpmn-webview/src/app/modeler.ts` |
| Debug extension code | VS Code Debug → "Run modeler-plugin" → F5, breakpoints work in `apps/modeler-plugin/src/**` |
| Debug webview code | Reload extension host, open the webview, use Developer: Open Webview Developer Tools |
| Understand a specific feature | See Feature internals below |

## Feature internals

Architecture deep-dives live under `contributing/architecture/`:

- [Append Menu internals](./architecture/append-menu)
- [BPMN Diff internals](./architecture/bpmn-diff)
- [Copy & Paste internals](./architecture/copy-paste)
- [Deployment internals](./architecture/deployment)
- [Element Template Chooser internals](./architecture/element-template-chooser)
- [Language Support internals](./architecture/language-support)

Each page follows the same shape: Overview → System overview → Entry points →
Key files → Message protocol (if applicable) → Interaction flow → Gotchas →
Related.

## Related

- [Development](./development) — prerequisites, setup, commands, CI/CD, code style
- [Release process](./release-process) — how a release is cut
- `CLAUDE.md` at the repo root — quick reference for AI assistants and new contributors
