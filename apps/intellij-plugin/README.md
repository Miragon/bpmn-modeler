# BPMN Modeler for IntelliJ

[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/32634-miragon-bpmn-modeler?label=JetBrains%20Marketplace)](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/Miragon/bpmn-modeler/blob/main/LICENSE)

![Miragon Modeler for BPMN: processes from plain .bpmn files, right in IntelliJ and the other JetBrains IDEs](/docs/public/shots/intellij/cover.png)

Model BPMN 2.0 processes visually, right inside IntelliJ IDEA and the other JetBrains IDEs. A `.bpmn`
file opens on a drag-and-drop canvas, and every change is saved straight back to the file, ready to
commit next to the code it describes. It is the same modeler as in
[VS Code](../vscode-plugin/README.md), for Camunda 7, Camunda 8, Operaton and CIB seven.

Free and open source (Apache 2.0). No account.

**[Install from the JetBrains Marketplace](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler)**

## Get started

1. Open **Settings ▸ Plugins**, select the **Marketplace** tab, search for **Miragon BPMN Modeler**
   and click **Install**. Restart the IDE when asked.
2. Open any `.bpmn` or `.bpmn20.xml` file. The modeler is its default editor.
3. To start from scratch, use **New BPMN Model…** in the project view under **New** and pick
   **Camunda 7**, **Camunda 8** or **Engine-neutral**.

## Model on the canvas

![IntelliJ with order-fulfilment.bpmn open, the user task Pack order selected and its implementation, assignment and form groups in the properties panel](/docs/public/shots/intellij/properties.png)

Draw and edit BPMN 2.0 diagrams on a visual canvas, with the source view next to it when you need
it. The View, Design and Implement modes show as much of the engine detail as you need, the
properties panel sets each element's Camunda 7 or Camunda 8 attributes, and linting points at what
an engine would reject. **Format Diagram** (`Ctrl+Alt+L`) lays a diagram out.

![return-handling.bpmn in IntelliJ with red error markers on a service task without a job type and on two flows without a condition, and 3 errors in the lint hint](/docs/public/shots/intellij/linting.png)

## Compare versions

Compare two versions of a diagram side by side in the IDE's diff and version-control views.

## Element templates and scripts

Element templates under `.camunda/element-templates/` show up in the modeler; a template's JSON
opens with a preview of its properties panel beside it. Script tasks get context-aware suggestions,
and **Generate Script Files for Script Tasks** writes each inline script to a file you edit in the
IDE, synced back live.

## Deploy to Camunda

Deploy a diagram to a running Camunda 7 or Camunda 8 engine from the **Deploy** tab of the
**BPMN Modeler** tool window, and check it against a Camunda 7 engine before you do. Passwords and
client secrets stay in the IDE's password safe.

## Review your project's add-ons

The **Add-ons** tab of the same tool window lists the bpmn-js plugins, lint rule packages and
element templates of your project. Allow or revoke a plugin or rule package there, and turn element
templates off and on.

## Good to know

- Needs IntelliJ IDEA Community or Ultimate 2024.2 or newer, or another IDE on the IntelliJ Platform
  2024.2+ (PyCharm, WebStorm, GoLand and others), on macOS, Linux or Windows. No Node.js needed.
- The plugin edits BPMN. A `.dmn` file opens in the IDE's own editor; the form that creates element
  templates is in VS Code so far.
- Every action is under **Tools ▸ Miragon BPMN Modeler** and in **Find Action**; the settings are
  under **Settings ▸ Tools ▸ Miragon BPMN Modeler**.
- Something wrong? Open **Help ▸ Diagnostic Tools ▸ Debug Log Settings…**, add `io.miragon`,
  reproduce the problem and attach the IDE log to your issue. Credentials are redacted from it.

## Links

[Guide](https://miragon.github.io/bpmn-modeler/intellij/getting-started) ·
[Features](https://miragon.github.io/bpmn-modeler/vscode/features/) ·
[Report an issue](https://github.com/Miragon/bpmn-modeler/issues) ·
[Source and contributing](CONTRIBUTING.md)

Made by [Miragon](https://www.miragon.io). Apache 2.0 licence.
