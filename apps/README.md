# `apps/`

Everything in `apps/` is built, run or shipped on its own, and no other workspace imports from it.
Reusable code lives in [`libs/`](../libs/README.md); an app only consumes it.

## Webviews

Browser bundles built with Vite into `dist/webview-staging/<name>/`. A host loads them in a sandboxed
webview; they export nothing and talk to the host only over `postMessage`, typed by
[`libs/shared`](../libs/shared/README.md).

| Workspace | What it renders | Loaded by |
| --- | --- | --- |
| [`bpmn-webview`](bpmn-webview/README.md) | The BPMN canvas with the properties panel, and the element template editor | VS Code, desktop app, IntelliJ |
| [`dmn-webview`](dmn-webview/README.md) | The DMN editor (DRD, decision tables, literal expressions) | VS Code, desktop app |
| [`form-webview`](form-webview/README.md) | The Camunda Form editor and preview | VS Code, desktop app |
| [`deployment-webview`](deployment-webview/README.md) | The deployment form | VS Code, desktop app, IntelliJ |
| [`add-ons-webview`](add-ons-webview/README.md) | The Add-ons view: plugins, rule packages, element templates and marketplaces | VS Code, desktop app, IntelliJ |

## Hosts

Each host embeds the webview bundles and drives the engine in
[`libs/modeler-core`](../libs/modeler-core/README.md).

| Workspace | What it is |
| --- | --- |
| [`vscode-plugin`](vscode-plugin/README.md) | The VS Code extension (Node, Webpack). Its custom editors serve the webview HTML and route the messages. |
| [`standalone`](standalone/README.md) | The Theia/Electron desktop app. It runs the packaged VS Code extension as a Theia plugin and adds [`libs/standalone-extension`](../libs/standalone-extension/README.md). |
| [`intellij-plugin`](intellij-plugin/README.md) | The JetBrains host (Kotlin, Gradle). It renders the webviews in JCEF. |
| [`modeler-bridge`](modeler-bridge/README.md) | A Bun binary that runs `modeler-core` out of process for the IntelliJ host, which has no Node runtime. |

## Orca plugin

[`orca-plugin`](orca-plugin/README.md) bundles `@miragon/bpmn-modeler` and `@miragon/dmn-modeler`
directly into Orca's editor frames, without `modeler-core` and without the webviews above. Its dev
loop is in [`orca-plugin/CONTRIBUTING.md`](orca-plugin/CONTRIBUTING.md).

## How a host and a webview connect

A host never imports a webview. They meet at three seams:

1. **Build.** The host copies the staged bundle into its own output (in `vscode-plugin` through
   `CopyWebpackPlugin`, in `intellij-plugin` through a Gradle staging task). So the root build runs
   libraries, then webviews, then hosts.
2. **Load.** The host writes the HTML shell and points its `<script>` and `<link>` tags at the copied
   files (`webview.asWebviewUri(...)` in VS Code).
3. **Talk.** Both sides exchange `Command` and `Query` messages over `postMessage`; their only shared
   imports come from `libs/`.

That is what lets one bundle serve every host unchanged. The boundaries are recorded in
[Architecture and hosts](../docs/adr/architecture-and-hosts.md#package-boundaries).
