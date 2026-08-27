# Architecture overview

This page gives contributors the mental model of how the modeler is put
together. Deeper rationale for the big structural decisions lives in the
[decision log (`docs/adr/`)](https://github.com/Miragon/bpmn-modeler/tree/main/docs/adr)
in the repository.

## Mental model

A Miragon BPMN Modeler session is two cooperating processes:

- The **extension host** (Node, built with webpack) runs inside VS Code. It
  owns the filesystem, VS Code APIs, and the deployment sidebar backend, and it
  wires the host-agnostic modeling engine (`@miragon/bpmn-modeler-core`) to VS
  Code through port adapters. The engine itself — the long-lived domain services
  — lives in that `vscode`-free package; see
  [ADR 0002](https://github.com/Miragon/bpmn-modeler/blob/main/docs/adr/0002-modeler-core-extraction.md)
  in the repository's decision log.
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
  vscode-plugin/     # Extension host (Node, webpack) — produces the .vsix
  bpmn-webview/       # BPMN webview (browser, Vite)
  dmn-webview/        # DMN webview (browser, Vite)
  deployment-webview/ # Deployment sidebar UI (Vite)
  standalone/         # Theia/Electron shell — bundles the .vsix into a desktop app
libs/
  shared/                        # Message contracts, cross-process utils
  modeler-core/                  # Host-agnostic modeling engine (vscode-free)
  bpmn-clipboard/                # bpmn-js DI module (copy/paste)
  bpmn-i18n/                     # bpmn-js DI module (translations)
  append-menu/                   # bpmn-js DI module (custom append UI)
  element-template-chooser/      # bpmn-js DI module (template picker)
```

| Workspace | Lives at | What it does |
|---|---|---|
| `vs-code-bpmn-modeler` | `apps/vscode-plugin` | VS Code extension host entry; produces the `.vsix` |
| `@miragon/bpmn-modeler-webview` | `apps/bpmn-webview` | BPMN editor UI + diff viewer |
| `@miragon/dmn-modeler-webview` | `apps/dmn-webview` | DMN editor UI |
| `@miragon/bpmn-modeler-deployment-webview` | `apps/deployment-webview` | Deploy / Start Instance sidebar UI |
| `@miragon/bpmn-modeler-standalone` | `apps/standalone` | Theia/Electron shell — bundles the `.vsix` into macOS DMG, Windows NSIS, and Linux Flatpak packages |
| `@miragon/bpmn-modeler-bridge` | `apps/modeler-bridge` | Out-of-process stdio JSON-RPC bridge running `modeler-core` for the IntelliJ host; ships as a Node-free Bun binary |
| `@miragon/bpmn-modeler-shared` | `libs/shared` | Message types, cross-process utilities |
| `@miragon/bpmn-modeler-core` | `libs/modeler-core` | Host-agnostic modeling engine (domain + services + ports), consumed by the VS Code plugin and the IntelliJ bridge |
| `@miragon/bpmn-modeler-clipboard` | `libs/bpmn-clipboard` | bpmn-js DI module for clipboard integration |
| `@miragon/bpmn-modeler-i18n` | `libs/bpmn-i18n` | bpmn-js DI module for translations |
| `@miragon/bpmn-modeler-append-menu` | `libs/append-menu` | Preact-based append menu overlay |
| `@miragon/bpmn-modeler-element-template-chooser` | `libs/element-template-chooser` | Preact-based template chooser overlay |

Most `libs/*` are source-only — the consuming Vite/webpack build compiles the
TypeScript and TSX files directly via the `@miragon/bpmn-modeler-<lib>` path alias.
Only `@miragon/bpmn-modeler-shared` has its own `tsc` build step, compiled
because it's also consumed by the extension host.

The BPMN webview additionally depends on
[`@miragon/create-append-c7`](https://github.com/Miragon/create-append-c7)
— a bpmn-js polyfill for Camunda 7 template creation that lives in its own
repository and is pulled in as a published npm dependency, not a workspace.

## Extension host vs webview

| Concern | Extension host | Webview |
|---|---|---|
| File I/O | yes (`vscode.workspace.fs`) | no |
| VS Code API | yes | no (bridged via messages) |
| `vscode.env.clipboard` | yes | no (bridged) |
| bpmn-js / dmn-js modeler | no | yes |
| Preact overlays | no | yes |
| Long-lived services | yes (`EditorSessionStore`, `BpmnModelerService`, …) | no |
| Per-editor lifecycle | yes (`ModelerSession` per editor) | one per open `.bpmn`/`.dmn` tab |

The extension host is organised **by feature**, with plain constructor wiring —
no DI framework. Each feature folder owns the four classic layers as
subfolders; cross-feature use is funnelled through the feature's `index.ts`
barrel.

```
apps/vscode-plugin/src/
  main.ts            Activation: build shared deps, then call each feature's register()
  composition/       One register(context, deps) per feature — the wiring root
  shared/            Cross-feature substrate — no feature owns it
    domain/          Pure types (BpmnDocument, ModelerSession, ports) — no external deps
    service/         Stateless shared services (ArtifactService)
    infrastructure/  VS Code adapters (EditorSessionStore, VsCode*, WebviewMessageRouter, …)
  modeler/
    editor-session/  Generic custom-editor host (ModelerEditorController + participants)
    bpmn/  dmn/       { domain/ service/ controller/ infrastructure/  index.ts }
  diff/  deployment/  scriptTask/  navigation/  migration/
                     each: { domain/ service/ controller/ infrastructure/  index.ts }
```

The four layers still hold *within* each feature, and are now enforced in CI by
`apps/vscode-plugin/src/architecture.spec.ts` (ArchUnitTS): `domain` imports no
outer layer and no `vscode`/Node host modules; `service` never imports `vscode`
or `controller`; the tree is cycle-free; and a feature reaches a sibling only
through its `index.ts`. Three pieces are deliberately exempt from the
feature-isolation rule because they are not features: `shared/`, `composition/`,
and `modeler/editor-session/`.

Two patterns keep the controllers thin and constant-size as features grow:

- **`WebviewMessageRouter`** — an open/closed dispatch table. A webview command
  is handled by registering one more handler factory (see
  `modeler/bpmn/controller/webview-handlers/`), not by editing a central
  `switch`.
- **`EditorSessionParticipant`** — each per-editor lifecycle concern (render,
  element templates, settings, status bar, script-task teardown) is an
  independent participant the generic `ModelerEditorController` runs on resolve.
  Adding a concern is "write a participant + register it", with no controller
  edit. Both `.bpmn` and `.dmn` share this one controller.

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
intercepts copy at priority 2051 (above `NativeCopyPaste`'s 2050) — see
`libs/bpmn-clipboard/` in the repository.

**Patching existing services.** Several of our modules decorate a core bpmn-js
method rather than adding a new service — e.g. `AppendMenuOverride` wraps
`popupMenu.open()`. didi doesn't stop you; just save the original and call it
(or not) from the replacement.

## Build pipelines

| Target | Tool | Config |
|---|---|---|
| Extension host (`.vsix`) | webpack + ts-loader | `apps/vscode-plugin/webpack.config.js` |
| BPMN webview | Vite | `apps/bpmn-webview/vite.config.mts` |
| DMN webview | Vite | `apps/dmn-webview/vite.config.mts` |
| Deployment webview | Vite | `apps/deployment-webview/vite.config.mts` |
| Standalone desktop packages (DMG / NSIS / Flatpak) | `@theia/cli` + electron-builder + flatpak-builder | `apps/standalone/package.json`, `apps/standalone/electron-builder.yml`, `apps/standalone/flatpak/io.miragon.BpmnModeler.yml` |
| Shared lib (`@miragon/bpmn-modeler-shared`) | tsc | `libs/shared/tsconfig.lib.json` |
| Tests | Vitest | `apps/vscode-plugin/vitest.config.ts` |
| Path alias resolution | `TsconfigPathsPlugin` (webpack), `vite-tsconfig-paths` (Vite) | `tsconfig.base.json` |

`yarn build` in the repo root uses `npm-run-all` to build libs first, then the
webviews and the extension plugin in parallel. `yarn dev` runs all of them in
watch mode; press F5 in VS Code to launch the Extension Development Host against
the watch build.

## Where to find things

| Task | Start here |
|---|---|
| Run the extension locally | [Development](./development) — Setup + F5 workflow |
| Add a new VS Code setting | `apps/vscode-plugin/package.json` → `contributes.configuration` + `VsCodeSettings` reader |
| Add a new webview message type | `libs/shared/src/lib/modeler.ts` — add the class, re-export, consume in both ends |
| Wire a new bpmn-js DI module | Create `libs/<name>/src/index.ts`, export the module, pass to `BpmnModeler.create({ additionalModules: [...] })` in `apps/bpmn-webview/src/app/modeler.ts` |
| Debug extension code | VS Code Debug → "Run vscode-plugin" → F5, breakpoints work in `apps/vscode-plugin/src/**` |
| Debug webview code | Reload extension host, open the webview, use Developer: Open Webview Developer Tools |
| Understand a specific feature | Start at the feature's `libs/<name>/README.md` or the feature folder in `apps/vscode-plugin/src/` |

## Related

- [Development](./development) — prerequisites, setup, commands, CI/CD, code style
- [Release process](./release-process) — how a release is cut
- `CLAUDE.md` at the repo root — quick reference for AI assistants and new contributors
