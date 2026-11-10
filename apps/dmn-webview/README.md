# `@miragon/dmn-modeler-webview`

The DMN editor (decision requirements diagrams, decision tables, literal expressions) that VS Code
and the desktop app load into their webviews. It is a thin host adapter around the publishable
[`@miragon/dmn-modeler`](../../packages/dmn-modeler/README.md) and talks to the host over the
Query/Command protocol of [`libs/shared`](../../libs/shared/README.md). IntelliJ does not load it.
Internal workspace, not published on its own.

## How it works

Role folders under `src/`: `main.ts` is the entry; `composition/bootstrap.ts` runs the handshake and
wires the page; `service/documentSession.ts` keeps the document in sync with the host;
`adapter/in/hostMessageRouter.ts` dispatches the host's queries; `adapter/out/host.ts` selects the
host channel; `port/dmnHost.ts` types that channel and the persisted properties-panel UI state,
whose restore and persist logic is `propertiesPanelUiState.ts` in `libs/shared`.

## Develop

```bash
corepack yarn watch                                         # from the root: rebuilds to disk for the F5 extension host
corepack yarn workspace @miragon/dmn-modeler-webview serve  # the editor alone in a browser
corepack yarn workspace @miragon/dmn-modeler-webview test
```

`vite build` writes to `dist/webview-staging/dmn-webview/`, which `vscode-plugin` copies into the
VSIX.
