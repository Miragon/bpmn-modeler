# `apps/dmn-webview/` — DMN canvas webview

Internal module. **Not published separately.**

The DMN modeling surface (decision tables, decision requirements diagrams,
literal expressions) that runs inside the VS Code webview hosted by
[`apps/vscode-plugin`](../vscode-plugin/README.md). Built with Vite and
[dmn-js](https://github.com/bpmn-io/dmn-js); communicates with the extension
host via the typed Query/Command protocol from
[`libs/shared`](../../libs/shared/README.md).

The host-free modeler facade now lives in the publishable
[`packages/dmn-modeler`](../../packages/dmn-modeler/README.md); this app is the
thin host adapter that consumes it.

The adapter is a flat `src/` layout mirroring
[`apps/bpmn-webview`](../bpmn-webview/README.md): `bootstrap.ts` runs the
protocol dispatch and handshake, `host.ts` selects the `HostApi`, and
`state.ts` + `webviewState.ts` hold the persisted properties-panel UI state.

## Local development

From the repo root:

```bash
corepack yarn watch                       # rebuild bundle to disk; F5 launches the extension host
corepack yarn workspace @miragon/dmn-modeler-webview serve  # standalone Vite dev server in a browser
```

## Build output

`vite build` writes to `dist/webview-staging/dmn-webview/`. The
`vscode-plugin` webpack config copies that folder into the VSIX.

## Further reading

- Architecture and message protocol: project `/architecture` skill, docs
  site at <https://miragon.github.io/bpmn-modeler/>.
- Webview lifecycle and CSP: project `/vscode-webviews` skill.
