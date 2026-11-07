# BPMN Modeler for VS Code

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.vs-code-bpmn-modeler.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler)
[![Installs](https://vsmarketplacebadges.dev/installs-short/miragon-gmbh.vs-code-bpmn-modeler.svg?label=Installs)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler)
[![Open VSX](https://img.shields.io/open-vsx/v/miragon-gmbh/vs-code-bpmn-modeler?label=Open%20VSX)](https://open-vsx.org/extension/miragon-gmbh/vs-code-bpmn-modeler)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/Miragon/bpmn-modeler/blob/main/LICENSE)

![Miragon Modeler for BPMN: processes, decisions and forms from plain files, right in VS Code](/docs/public/shots/vscode/cover.png)

Model BPMN processes, DMN decisions and Camunda Forms right in VS Code, for Camunda 7, Camunda 8
and compatible engines such as Operaton and CIB seven. A `.bpmn`, `.dmn` or `.form` file opens in a
graphical editor, and the file stays the source of truth: save, Git and diff work as for your code.

Free and open source (Apache 2.0), built on [bpmn.io](https://bpmn.io). No account.

## Get started

1. Open any `.bpmn`, `.dmn` or `.form` file, or create one. It opens in the modeler instead of the
   text editor.
2. New to BPMN? The walkthrough **Get Started with BPMN Modeler** (**Help: Get Started**) shows you
   how to create, edit and deploy a diagram, and [camunda.com/bpmn](https://camunda.com/bpmn/)
   explains the notation.

## Model processes

![order-fulfilment.bpmn in VS Code with the user task Pack order selected, its context pad open and its implementation, assignment and form groups in the properties panel](/docs/public/shots/vscode/editor.png)

Add elements from the palette or the context pad and set their Camunda 7 or Camunda 8 details in
the properties panel. The View, Design and Implement modes show as much engine detail as you need.
**BPMN Modeler: Toggle Standard Text Editor** (`Ctrl+Shift+E`) opens the XML next to it.

## Play it through

![The order fulfilment process in token simulation, a token past the gateway In stock? and the simulation log listing Check stock and In stock?](/docs/public/shots/vscode/simulation.png)

The token simulation runs a process step by step, so you see each path before you deploy it.

## Catch mistakes early

![return-handling.bpmn with red error markers on a service task without a job type and on two flows without a condition, and 3 errors in the lint hint and the status bar](/docs/public/shots/vscode/linting.png)

Linting marks what the engine would reject, on the canvas and in the **Problems** view. It uses a
`.bpmnlintrc` from your workspace when there is one. Only drawing? Switch it off from the lint hint.

## Decisions and forms

![The Choose carrier decision table from shipping.dmn, simulated for a 3 kg express parcel to Germany: rule 2 is highlighted and the result reads DHL Express for 9.99](/docs/public/shots/vscode/decision.png)

Edit DMN decision tables and try them with the simulation above the table. Camunda Forms open in a
visual editor with a preview, and a Camunda 8 user task links straight to its form.

## Compare and deploy

![Two versions of a process side by side, with added, removed, changed and moved elements in colour](/docs/public/shots/bpmn-diff.png)

Select two `.bpmn` files in the Explorer and **Compare Selected (BPMN)** to see what changed,
element by element. The **Deploy Diagram** view (the rocket) deploys a diagram to Camunda 7 or
Camunda 8 and starts an instance with a payload from `.camunda/payloads/`.

## Good to know

- Element templates under `.camunda/element-templates/`, anywhere between your file and the
  workspace root, show up in the modeler without any project setup.
- Every command starts with **BPMN Modeler:** in the Command Palette, and the settings are under
  **BPMN Modeler** in the Settings. The [documentation](https://miragon.github.io/bpmn-modeler/vscode/configuration)
  lists them all.
- The modeler speaks 12 languages, from English and Deutsch to 日本語 and 한국어
  (**BPMN Modeler: Change Modeler Language**).
- Something wrong? Set the log level of the **bpmn.modeler** output channel to **Debug**
  (**Developer: Set Log Level…**), reproduce it and paste the channel into your issue. Credentials
  are never logged.
- The same modeler runs in [IntelliJ](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler),
  as a [desktop app](https://miragon.github.io/bpmn-modeler/download) and, experimental, in
  [Orca](https://miragon.github.io/bpmn-modeler/orca/getting-started).

## Links

[Documentation](https://miragon.github.io/bpmn-modeler/)
·
[Changelog](https://github.com/Miragon/bpmn-modeler/blob/main/apps/vscode-plugin/CHANGELOG.md)
·
[Report an issue](https://github.com/Miragon/bpmn-modeler/issues)
·
[Source and contributing](https://github.com/Miragon/bpmn-modeler/blob/main/CONTRIBUTING.md)

Made by [Miragon](https://www.miragon.io). Apache 2.0 licence.
