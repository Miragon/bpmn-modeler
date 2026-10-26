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

The pure functions in `src/domain/deploymentDraft.ts` decide, from a
`DraftSnapshot`:

- whether Save, New, Delete, the target select and the target inputs are
  disabled, and Save's tooltip;
- why Deploy and Start Instance are blocked (a save or load in flight,
  credentials loading, unsaved target changes).

`form.ts` builds the snapshot from its flags and applies the result to the DOM.
Each request button also stays disabled while its own request is in flight:
Deploy while `deploying` (`form.ts`), Start Instance while `starting`
(`startInstanceForm.ts`). Click handlers keep their payload checks, such as a
required Target Name.

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
