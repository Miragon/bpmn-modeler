# `@miragon/bpmn-modeler-webview`

The BPMN canvas that VS Code, the desktop app and IntelliJ load into their webviews, plus the page of
the element template editor. It wraps `@miragon/bpmn-modeler` and talks to the host over the
Query/Command protocol of [`libs/shared`](../../libs/shared/README.md). Internal workspace, not
published on its own.

## How it works

- **One surface at a time.** The mode strip in the properties-panel header picks the **viewer**
  (View), the engine-neutral **designer** (Design) or the full Camunda **modeler** (Implement).
  Switching swaps the surface. Element templates, lint results, inline scripting and modeler
  settings only reach the modeler surface; on the other two they are no-ops. The active mode is kept
  in the webview state, so a reopened editor restores it. The rules behind the surfaces are in
  [BPMN modeler: surfaces and modes](../../docs/adr/bpmn-modeler.md#surfaces-and-modes).
- **Two bundles.** `main.ts` builds `index.js` (the editor), `templateEditorMain.ts` builds
  `templateEditor.js` (the element template editor, in `templateEditor/`).
- **Role folders** under `src/`: `composition/bootstrap.ts` wires the page and runs its boot phases;
  `adapter/in/` turns host queries and page input into calls (message router, mode strip, editor
  chrome, surface binding, diff pane); `adapter/out/` wraps the modeler library and implements its
  ports over the host channel (`host.ts` selects the channel); `service/` keeps document and view
  state in sync with the host; `port/` and `domain/` hold the types and the pure rules.

## Develop

```bash
corepack yarn watch                                          # from the root: rebuilds to disk for the F5 extension host
corepack yarn workspace @miragon/bpmn-modeler-webview serve  # the page alone in a browser, against a mock host
corepack yarn workspace @miragon/bpmn-modeler-webview test
```

`vite build` writes to `dist/webview-staging/bpmn-webview/`, which the hosts copy into their
packages. Browser testing is described in the `bpmn-browser-testing` skill, bpmn-js internals in the
`bpmn-js` skill and the webview lifecycle in the `vscode-webviews` skill (all in `.agents/skills/`).
