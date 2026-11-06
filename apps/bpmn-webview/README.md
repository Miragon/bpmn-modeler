# `apps/bpmn-webview/` — BPMN canvas webview

Internal module. **Not published separately.**

The BPMN modeling surface that runs inside the VS Code webview hosted by
[`apps/vscode-plugin`](../vscode-plugin/README.md). Built with Vite and
[bpmn-js](https://github.com/bpmn-io/bpmn-js); communicates with the
extension host via a typed Query/Command message protocol from
[`libs/shared`](../../libs/shared/README.md).

## Surface session (View / Design / Implement)

The webview hosts exactly one of three surfaces at a time, chosen by the mode
strip in the properties-panel header:

- **viewer** — readonly bpmn-js viewer (View mode).
- **designer** — engine-neutral editable surface (Design mode).
- **modeler** — full Camunda modeler (Implement mode).

Switching mode swaps the active surface. Modeler-only host messages — element
templates, lint results, inline scripting, and modeler settings — are no-ops on
the viewer and designer surfaces; only the modeler surface consumes them. The
active mode is persisted in the webview state so a hidden/reopened editor
restores its surface.

## Source layout

Each file sits in a role folder under `src/`:

- `main.ts` and `templateEditorMain.ts` are the entries of the two bundles
  (`index.js`, `templateEditor.js`); `index.ts` is the barrel.
- `composition/bootstrap.ts` wires the editor page and runs its boot phases.
- `adapter/in/` turns the host's queries and the page's input into calls: the
  message router, the host's requests on the live surface, the mode strip, the
  editor chrome, the surface binding and the diff pane.
- `adapter/out/` wraps the modeler library (surface factories and modules, the
  document I/O of the live surface) and implements its ports over the host
  channel (capabilities, clipboard, linting, the form preview); `host.ts`
  selects the host channel.
- `service/` keeps the document and the view state in sync with the host and
  publishes the process variables.
- `port/` types the host channel, the state it persists and the ports the
  document session calls; `domain/` holds the pure rules.
- `templateEditor/` is the element template editor's page, in the same role
  folders.

## Why this lives in its own workspace

Webview frontends are browser code with their own bundler, dependency tree,
and dev workflow — separate from the Node.js extension host. Keeping them in
their own workspace lets each one iterate independently and run in a normal
browser during development.

## Local development

From the repo root:

```bash
corepack yarn watch                       # rebuild bundle to disk; F5 launches the extension host
corepack yarn workspace @miragon/bpmn-modeler-webview serve  # standalone Vite dev server in a browser
```

`watch` is what you want when developing the full extension. `serve` is for
isolated UI work without launching VS Code.

## Build output

`vite build` writes to `dist/webview-staging/bpmn-webview/`. The
`vscode-plugin` webpack config copies that folder into the VSIX.

## Further reading

- Architecture and message protocol:
  [`/architecture`](https://miragon.github.io/bpmn-modeler/) skill /
  docs site.
- bpmn-js internals (EventBus, services, copy-paste): the project's
  `/bpmn-js` skill.
- Webview lifecycle and CSP: the project's `/vscode-webviews` skill.
