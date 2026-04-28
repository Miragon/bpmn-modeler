# `apps/dmn-webview/` — DMN canvas webview

Internal module. **Not published separately.**

The DMN modeling surface (decision tables, decision requirements diagrams,
literal expressions) that runs inside the VS Code webview hosted by
[`apps/modeler-plugin`](../modeler-plugin/README.md). Built with Vite and
[dmn-js](https://github.com/bpmn-io/dmn-js); communicates with the extension
host via the typed Query/Command protocol from
[`libs/shared`](../../libs/shared/README.md).

## Local development

From the repo root:

```bash
corepack yarn watch                       # rebuild bundle to disk; F5 launches the extension host
corepack yarn workspace dmn-webview serve  # standalone Vite dev server in a browser
```

## Build output

`vite build` writes to `dist/webview-staging/dmn-webview/`. The
`modeler-plugin` webpack config copies that folder into the VSIX.

## Further reading

- Architecture and message protocol: project `/architecture` skill, docs
  site at <https://miragon.github.io/bpmn-vscode-modeler/>.
- Webview lifecycle and CSP: project `/vscode-webviews` skill.
