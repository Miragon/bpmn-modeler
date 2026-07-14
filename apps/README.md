# `apps/` — deliverables

Each package in `apps/` is a self-contained deliverable: it is built, run, or
shipped on its own, and no other package in this repository imports code from
it. Reusable code lives in [`../libs`](../libs), which an app only consumes.

## Webview frontends

These are browser bundles built with Vite. Each one builds itself to
`dist/webview-staging/<name>/` and is loaded inside a sandboxed webview by a
host. They export nothing, and they communicate with their host only over an
asynchronous `postMessage` channel that is typed by
[`libs/shared`](../libs/shared) and [`libs/modeler-core`](../libs/modeler-core).

| Package | What's inside |
| --- | --- |
| `bpmn-webview` | This webview hosts the BPMN diagram editor, built on bpmn-js with the properties panel. |
| `dmn-webview` | This webview hosts the DMN decision-table and DRD editor, built on dmn-js. |
| `deployment-webview` | This webview renders the Camunda deployment sidebar form. |

## Host applications

Each host embeds the webview bundles and drives the modeling engine in
[`libs/modeler-core`](../libs/modeler-core).

| Package | What's inside |
| --- | --- |
| `vscode-plugin` | This is the VS Code extension (Node and Webpack), whose custom text editors serve the webview HTML and route its messages. |
| `intellij-plugin` | This is the IntelliJ and JetBrains host (Kotlin and Gradle), which renders the same webview bundles in a JCEF browser. |
| `standalone` | This is the Theia and Electron desktop shell, which pairs with [`libs/standalone-extension`](../libs/standalone-extension). |
| `modeler-bridge` | This is a stdio JSON-RPC Bun binary that runs `modeler-core` out of process for the IntelliJ host, which has no Node runtime. |

## How a host and a webview connect

There is no import link between a host and a webview. They are joined by three
deliberately weak seams instead.

1. **Build.** The host copies the webview's staged bundle into its own output,
   for example through the `CopyWebpackPlugin` step in `vscode-plugin`. This is
   why the root build order is libraries, then webviews, then hosts.
2. **Load.** The host writes the webview HTML shell and points its `<script>`
   and `<link>` tags at the copied files through `webview.asWebviewUri(...)`.
3. **Talk.** The two halves exchange `Command` and `Query` messages over
   `postMessage`, so the only import-level coupling between them flows through
   `libs/`.

This boundary is what lets the same webview bundle serve VS Code, IntelliJ, and
the standalone shell unchanged.
