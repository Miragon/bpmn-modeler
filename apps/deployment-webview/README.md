# `@miragon/bpmn-modeler-deployment-webview`

The deployment form: engine, endpoint, credentials and an optional payload, then Deploy and Start
Instance against Camunda 7 or Camunda 8. VS Code and the desktop app show it in the **Deploy** view,
IntelliJ in the **Deploy** tab of its tool window. It talks to the host over the Query/Command
protocol of [`libs/shared`](../../libs/shared/README.md). Internal workspace, not published on its
own.

## How it works

- **Single-source markup.** The form's DOM lives only in `src/adapter/in/formTemplate.ts`
  (`FORM_TEMPLATE`), injected into `#app` by `src/composition/bootstrap.ts`. Every host shell (this
  workspace's `index.html`, `apps/vscode-plugin/src/deployment/adapter/in/DeploymentWebviewHtml.ts`,
  IntelliJ's `WebviewServer.kt`) ships an empty `<div id="app"></div>`. Edit markup only in
  `formTemplate.ts`.
- **Form rules are pure functions** in `src/domain/deploymentDraft.ts`, decided from a
  `DraftSnapshot`: which controls are disabled and why Deploy or Start Instance is blocked (a save or
  load in flight, credentials loading, unsaved target changes). `credentialRefSignatureOf` decides
  which credential edits count as a target change (an `${env:…}` reference does, a literal does
  not). `requestAuthOf` checks what a request needs and returns the auth payload or the first reason
  to refuse; `authPayloadOf` builds the payload for New and Save without that check.
- **In-flight guards.** `form.ts` applies the rules to the DOM and keeps Deploy disabled while
  `deploying`; `startInstanceForm.ts` does the same for Start Instance while `starting`.

The deployment subsystem behind the form is recorded in [Deployment](../../docs/adr/deployment.md).

## Develop

```bash
corepack yarn watch                                                     # from the root: rebuilds to disk for the F5 extension host
corepack yarn workspace @miragon/bpmn-modeler-deployment-webview serve  # the form alone in a browser
corepack yarn workspace @miragon/bpmn-modeler-deployment-webview test
```

`vite build` writes to `dist/webview-staging/deployment-webview/`. For a local engine to deploy to,
see [`stack/`](../../stack/c7/README.md).
