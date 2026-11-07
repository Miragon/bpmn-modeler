# Miragon BPMN Modeler

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.vs-code-bpmn-modeler.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler)
[![Installs](https://vsmarketplacebadges.dev/installs-short/miragon-gmbh.vs-code-bpmn-modeler.svg?label=Installs)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler)
[![Build](https://github.com/Miragon/bpmn-modeler/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/Miragon/bpmn-modeler/actions/workflows/build.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**BPMN, DMN and Camunda Forms where your work already happens.**

One modeler for Camunda 7 and Camunda 8, in VS Code, in IntelliJ, on the desktop and next to your
coding agent in Orca. Built on [bpmn.io](https://bpmn.io).

![Appending the missing end event to "Ship order" in VS Code clears the lint error and the modeler reports no issues](https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/modeler-demo.gif)

## Why we built this

Process models are code: they live in your repository, get reviewed in pull requests and ship with
the rest of your software. Editing them in a separate desktop modeler means a round trip for every
change. So the modeler comes to the files instead: open a `.bpmn` file, model, commit.

## Use it where you work

| Where | What it opens | Get it |
| --- | --- | --- |
| [VS Code](apps/vscode-plugin/README.md) | `.bpmn`, `.dmn`, `.form`, with deployment, the BPMN diff and links into your code | [Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler) · [Open VSX](https://open-vsx.org/extension/miragon-gmbh/vs-code-bpmn-modeler) |
| [IntelliJ and other JetBrains IDEs](apps/intellij-plugin/README.md) | `.bpmn`, with deployment | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler) |
| [Desktop app](apps/standalone/README.md) for macOS, Windows and Linux | `.bpmn`, `.dmn`, `.form`, with Git and auto-save | [Download](https://miragon.github.io/bpmn-modeler/download) |
| [Orca](apps/orca-plugin/README.md), experimental | `.bpmn`, `.dmn`, live while your agent writes them | [Orca plugin directory](https://onorca.dev/plugins/miragon.bpmn-modeler?catalog=https://github.com/miragon/orca-modelers.git) |

Each one has the properties panel for Camunda 7 and Camunda 8 (and Operaton and CIB seven), the
View, Design and Implement modes, linting, the token simulation and element templates. The UI speaks
12 languages. The [documentation](https://miragon.github.io/bpmn-modeler/) covers every feature.

The modeling engine is also on npm, to embed in your own app:
[`@miragon/bpmn-modeler`](packages/bpmn-modeler/README.md) and
[`@miragon/dmn-modeler`](packages/dmn-modeler/README.md).

## Contributing

Bug or idea? [Open an issue](https://github.com/Miragon/bpmn-modeler/issues). Pull requests are
welcome, from a typo to a feature: the layout, setup, tests and conventions are in
[CONTRIBUTING.md](CONTRIBUTING.md), and each host has its own guide next to its code.

Questions or commercial support: [info@miragon.io](mailto:info@miragon.io).

## License

[Apache License 2.0](LICENSE). Made by [Miragon](https://www.miragon.io).
