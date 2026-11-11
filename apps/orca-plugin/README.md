# BPMN & DMN Modeler for Orca

[![Orca](https://img.shields.io/badge/Orca-install-335DE5)](https://onorca.dev/plugins/miragon.bpmn-modeler?catalog=https://github.com/miragon/orca-modelers.git)
[![License: Apache 2.0](https://img.shields.io/github/license/Miragon/bpmn-modeler)](../../LICENSE)

![Miragon Modeler for BPMN, experimental: processes and decisions from plain .bpmn and .dmn files, edited by you and your agents](images/cover.webp)

**See the BPMN processes and DMN decisions your agent writes, and edit them right next to it.**

In [Orca](https://www.onorca.dev), a `.bpmn` or `.dmn` file opens as a diagram instead of XML, while your agent keeps reading and writing the plain file. It is experimental: it views, simulates and lightly models, has no deployment, code links, forms, diff or workspace element templates yet, and may change between releases.

## What you get

- **Live while your agent writes.** Each change your agent makes to the file shows up on the canvas right away; if you have unsaved edits, Orca asks whether to reload or keep yours.
- **Private by design.** The plugin runs in Orca's sandbox, with no file or network access and no account.

**Processes for Camunda 7 and Camunda 8.** `.bpmn` files open in the View, Design and Implement modes with the properties panel.

![Orca with order-fulfilment.bpmn open, the user task Pack order selected and its implementation, assignment and form groups in the properties panel](images/feature-properties.webp)

**Play it through.** The token simulation runs a process step by step.

![The order fulfilment process in token simulation, a token waiting after Pack order and the log listing In stock? and Pack order](images/feature-simulation.webp)

**Mistakes caught early.** Linting marks what an engine would reject.

![return-handling.bpmn with red error markers on a service task without a job type and on two flows without a condition](images/feature-linting.webp)

**Decisions.** `.dmn` files open with the decision requirements diagram, decision tables, literal and boxed expressions, the properties panel and the decision simulation.

![The Choose carrier decision table from shipping.dmn, simulated for a 3 kg express parcel without a country: rule 8 matches, UPS Express for 39](images/feature-dmn.webp)

## Install

Needs the Orca desktop app 1.4.248 or later.

1. Turn on plugins once in Orca's settings, under **Plugins**.
2. Open the [plugin's page](https://onorca.dev/plugins/miragon.bpmn-modeler?catalog=https://github.com/miragon/orca-modelers.git) and press **Install**. The first time, Orca asks whether to add the [Miragon modelers catalog](https://github.com/Miragon/orca-modelers), which also brings you new releases.

## Get started

1. Click **Try it** on the plugin's page to open an example process, or open any `.bpmn` or `.dmn` file.
2. Ask your agent to change the process and watch the canvas follow.
3. To start a new file, use **+** in the tab bar and pick **New BPMN process from example** or **New DMN decision from example**.

A read-only tab, such as an agent transcript, opens in View mode. The [Orca guide](https://miragon.github.io/bpmn-modeler/orca/getting-started) lists what the plugin leaves out; the [VS Code extension](../vscode-plugin/README.md), [IntelliJ plugin](../intellij-plugin/README.md) and [desktop app](../standalone/README.md) have the rest.

## Help and feedback

- **Documentation:** the [Orca guide](https://miragon.github.io/bpmn-modeler/orca/getting-started), with its limits.
- **Bugs and ideas:** tell us what you miss and [open an issue](https://github.com/Miragon/bpmn-modeler/issues).
- **More modelers:** [all Miragon modelers for Orca](https://github.com/Miragon/orca-modelers).

## Contributing

How the plugin is built, tested and released is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](../../LICENSE). Made by [Miragon](https://www.miragon.io).
