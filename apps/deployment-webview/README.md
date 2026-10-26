# `apps/deployment-webview/` — Deployment sidebar webview

Internal module. **Not published separately.**

Renders the **Deploy Diagram** sidebar of the modeler extension: a small
form that collects engine type, endpoint, auth credentials, and an optional
payload, then asks the extension host to deploy and (optionally) start a
process instance against Camunda 7 or Camunda 8.

Hosted by [`apps/vscode-plugin`](../vscode-plugin/README.md). Talks to the
extension host via the typed Query/Command protocol from
[`libs/shared`](../../libs/shared/README.md).

## Single-source markup

The form markup lives in **one** place:
`src/app/formTemplate.ts` (`FORM_TEMPLATE`), injected into `#app` by
`main.ts` at runtime. Every host shell — the Vite `index.html`,
`apps/vscode-plugin/src/deployment/infrastructure/DeploymentWebviewHtml.ts`,
and the IntelliJ deployment tool-window shell — ships only an empty
`<div id="app"></div>`. When modifying form markup, edit `formTemplate.ts`
only.

## Form rules

When Deploy, Save, New, Delete, the target select and the inputs are blocked,
and the reason shown for it, is decided in one place: the pure functions in
`src/domain/deploymentDraft.ts`. `form.ts` builds a `DraftSnapshot` from its
state and applies the result to the DOM; it does not repeat the conditions.

## Local development

From the repo root:

```bash
corepack yarn watch                              # rebuild bundle to disk; F5 launches the extension host
corepack yarn workspace @miragon/bpmn-modeler-deployment-webview serve  # standalone Vite dev server in a browser
```

## Further reading

- Project `/architecture` skill — deployment subsystem, hexagonal ports for
  C7/C8 engines.
- Project `/vscode-webviews` skill — webview lifecycle, CSP, theming.
