# `apps/form-webview/` — Camunda Form webview

Internal module. **Not published separately.**

The Camunda Form editing surface that runs inside the VS Code custom editor.
It uses [form-js](https://github.com/bpmn-io/form-js) for the visual editor and
preview, and exchanges typed Query/Command messages with the extension host
through [`libs/shared`](../../libs/shared/README.md).

## Behavior

- **Edit** keeps one persistent form-js editor instance.
- **Preview** renders the current in-memory schema without discarding edits.
- Host-provided source bytes remain unchanged until the user makes a visual edit.
- Invalid JSON shows a recoverable error and remains authoritative in the text editor.
- Visual edits post their full schema immediately. A short delivery guard plus the
  shared save/close flush protocol protects edits while that message is in flight.

## Local development

From the repository root:

```bash
corepack yarn watch
corepack yarn workspace @miragon/form-modeler-webview serve
```

`watch` rebuilds the bundle for the VS Code Extension Host. `serve` runs the
webview in a normal browser with its development host mock.

## Build output

`vite build` writes to `dist/webview-staging/form-webview/`. The VS Code plugin
webpack build copies that directory, the form JSON Schema, and dependency
licenses into the packaged extension.
