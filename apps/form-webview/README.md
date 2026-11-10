# `@miragon/form-modeler-webview`

The Camunda Form editor and preview, built on [form-js](https://github.com/bpmn-io/form-js), that VS
Code and the desktop app open for `.form` files. It talks to the host over the Query/Command protocol
of [`libs/shared`](../../libs/shared/README.md). Internal workspace, not published on its own.

## How it works

- **Edit** keeps one persistent form-js editor instance; **Preview** renders the current in-memory
  schema without discarding edits.
- The host's source bytes stay unchanged until the user makes a visual edit. Invalid JSON shows a
  recoverable error and stays authoritative in the text editor.
- A visual edit posts the full schema at once. A short delivery guard and the shared save/close
  flush protect an edit while that message is in flight.
- form-js's `debounce` service is the flushable one from `@miragon/bpmn-modeler-types`, so a save or
  close applies a properties-panel value form-js still debounces.

## Develop

```bash
corepack yarn watch                                         # from the root: rebuilds to disk for the F5 extension host
corepack yarn workspace @miragon/form-modeler-webview serve  # the editor in a browser, with a mock host
corepack yarn workspace @miragon/form-modeler-webview test
```

`build` type-checks, then `vite build` writes to `dist/webview-staging/form-webview/`. The
`vscode-plugin` build copies that folder, the form JSON Schema and the dependency licenses into the
VSIX.
