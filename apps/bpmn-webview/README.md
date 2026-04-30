# `apps/bpmn-webview/` — BPMN canvas webview

Internal module. **Not published separately.**

The BPMN modeling surface that runs inside the VS Code webview hosted by
[`apps/modeler-plugin`](../modeler-plugin/README.md). Built with Vite and
[bpmn-js](https://github.com/bpmn-io/bpmn-js); communicates with the
extension host via a typed Query/Command message protocol from
[`libs/shared`](../../libs/shared/README.md).

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
`modeler-plugin` webpack config copies that folder into the VSIX.

## Further reading

- Architecture and message protocol:
  [`/architecture`](https://miragon.github.io/bpmn-modeler/) skill /
  docs site.
- bpmn-js internals (EventBus, services, copy-paste): the project's
  `/bpmn-js` skill.
- Webview lifecycle and CSP: the project's `/vscode-webviews` skill.
