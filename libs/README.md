# `libs/` — building blocks

Each package in `libs/` is reusable code that other packages consume through its
public API with an `import` statement. The runnable and shippable ends of the
project, namely the webviews and hosts, live in [`../apps`](../apps). These
libraries are the shared foundation that both the hosts and the webviews depend
on.

## Foundation

| Package | What's inside |
| --- | --- |
| `modeler-core` | This is the host-agnostic BPMN and DMN engine, holding the domain models, services, host-capability ports, and the `vscode`-free infrastructure registries such as `EditorSessionStore` and `WebviewMessageRouter`. It must never import `vscode`. |
| `shared` | This holds the `Command` and `Query` message types and utilities that both the extension host and the webviews use, so it defines the vocabulary of the `postMessage` seam. |

## bpmn-js and dmn-js feature modules

Each of these is a self-contained editor feature, packaged separately so that it
can be composed into a webview and unit-tested in isolation.

| Package | What's inside |
| --- | --- |
| `append-menu` | This replaces the flat "Append element" dropdown with a two-panel Preact overlay. |
| `element-template-chooser` | This provides a richer, searchable overlay for picking an element template. |
| `bpmn-clipboard` | This makes copy and paste of elements and label text work inside the sandboxed webview iframe. |
| `code-link` | This adds a "Go to implementation" context-pad action that jumps to the task's source file. |
| `inline-scripting` | This lets the user edit a Camunda 7 script task's (or script-typed listener's) inline script in a real host editor tab, arbitrating a single writer per script surface and keeping the panel field in sync. |
| `model-navigation` | This adds a "Navigate to referenced model" action, jumping from a Call Activity to its BPMN process or from a Business Rule Task to its DMN decision. |
| `bpmn-i18n` | This provides runtime language switching for bpmn-js, dmn-js, the properties panel, and the app's own strings. |

## Host extension

| Package | What's inside |
| --- | --- |
| `standalone-extension` | This is a Theia frontend extension contributing Miragon themes, a splash screen, and view overrides, consumed by [`apps/standalone`](../apps/standalone). It ships as its own package because Theia only discovers `theiaExtensions` that are declared on dependencies. |
