# `apps/deployment-webview/` — Deployment sidebar webview

Internal module. **Not published separately.**

Renders the **Deploy Diagram** sidebar of the modeler extension: a small
form that collects engine type, endpoint, auth credentials, and an optional
payload, then asks the extension host to deploy and (optionally) start a
process instance against Camunda 7 or Camunda 8.

Hosted by [`apps/modeler-plugin`](../modeler-plugin/README.md). Talks to the
extension host via the typed Query/Command protocol from
[`libs/shared`](../../libs/shared/README.md).

## Dual-HTML pattern

The deployment sidebar has **two copies** of its HTML that must stay in
sync:

- `apps/deployment-webview/index.html` — Vite development.
- `apps/modeler-plugin/src/infrastructure/DeploymentWebviewHtml.ts` —
  runtime in VS Code (CSP nonce, theme variables).

When modifying deployment form markup, update **both**.

## Local development

From the repo root:

```bash
corepack yarn watch                              # rebuild bundle to disk; F5 launches the extension host
corepack yarn workspace deployment-webview serve  # standalone Vite dev server in a browser
```

## Further reading

- Project `/architecture` skill — deployment subsystem, hexagonal ports for
  C7/C8 engines.
- Project `/vscode-webviews` skill — webview lifecycle, CSP, theming.
