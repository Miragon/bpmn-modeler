# Miragon BPMN Modeler

[![VS Code Marketplace](https://img.shields.io/badge/VS_Code_Marketplace-install-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler)
[![Open VSX](https://img.shields.io/open-vsx/v/miragon-gmbh/vs-code-bpmn-modeler?label=Open%20VSX)](https://open-vsx.org/extension/miragon-gmbh/vs-code-bpmn-modeler)
[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/32634-miragon-bpmn-modeler?label=JetBrains%20Marketplace)](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler)
[![Desktop app](https://img.shields.io/badge/Desktop_app-download-335DE5)](https://miragon.github.io/bpmn-modeler/download)
[![Orca](https://img.shields.io/badge/Orca-install-335DE5)](https://onorca.dev/plugins/miragon.bpmn-modeler?catalog=https://github.com/miragon/orca-modelers.git)
[![Build](https://github.com/Miragon/bpmn-modeler/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/Miragon/bpmn-modeler/actions/workflows/build.yml)
[![License: Apache 2.0](https://img.shields.io/github/license/Miragon/bpmn-modeler)](LICENSE)

![In VS Code, appending the missing end event to "Ship order" clears the lint error and the modeler reports no issues](https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/modeler-demo.gif)

**Model processes and decisions right where their code lives.**

Edit BPMN processes, DMN decisions and Camunda Forms for Camunda 7, Camunda 8, Operaton or CIB seven in your editor, and commit them with your code.

## Why

A process change belongs in the same pull request as the code it affects, but a separate desktop modeler such as the Camunda Modeler puts it on a detour outside your repository. Here the modeler opens the file in your editor, and the plain XML stays the source of truth you diff and review like code.

## What you get

- **Camunda details in the properties panel.** Set each element's Camunda 7 or Camunda 8 attributes; Operaton and CIB seven, both Camunda 7 compatible, use the Camunda 7 settings.
- **As much detail as you need.** [View, Design and Implement modes](https://miragon.github.io/bpmn-modeler/vscode/features/modes) go from reading to engine-neutral sketching to full implementation.
- **Mistakes caught before deploy.** [Linting](https://miragon.github.io/bpmn-modeler/vscode/features/linting) marks what the engine would reject, and the [token simulation](https://miragon.github.io/bpmn-modeler/vscode/features/token-simulation) plays a process through.
- **Your team's building blocks.** [Element templates](https://miragon.github.io/bpmn-modeler/vscode/features/element-template-chooser) under `.camunda/element-templates/` show up without any project setup.
- **Review and deploy from the editor.** The [BPMN diff](https://miragon.github.io/bpmn-modeler/vscode/features/bpmn-diff) shows changes element by element, and [deployment](https://miragon.github.io/bpmn-modeler/vscode/features/deployment) sends a diagram to Camunda 7 or Camunda 8.

The [feature pages](https://miragon.github.io/bpmn-modeler/vscode/features/) describe VS Code; the table below shows what each editor opens.

## Install

| Where                                                              | Opens                                                                                                        | Get it                                                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| VS Code 1.76+                                                      | `.bpmn`, `.dmn`, `.form`, with deployment, diff and jumps into your code                                     | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler)                  |
| VSCodium, Cursor, Windsurf                                         | the same as VS Code                                                                                          | [Open VSX](https://open-vsx.org/extension/miragon-gmbh/vs-code-bpmn-modeler)                                                  |
| IntelliJ IDEA 2024.2+ (Community or Ultimate)                      | `.bpmn`, with deployment (preview)                                                                           | [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler)                                      |
| Desktop: macOS (Apple silicon), Windows x64, Linux x86_64          | `.bpmn`, `.dmn`, `.form`, with Git, diff and deployment (preview)                                            | [Download](https://miragon.github.io/bpmn-modeler/download)                                                                   |
| [Orca](https://www.onorca.dev) 1.4.248+, next to your coding agent | `.bpmn`, `.dmn` to view, simulate and lightly model; no deployment, diff, forms or code jumps (experimental) | [Orca plugin directory](https://onorca.dev/plugins/miragon.bpmn-modeler?catalog=https://github.com/miragon/orca-modelers.git) |

VS Code extension from the command line:

```bash
code --install-extension miragon-gmbh.vs-code-bpmn-modeler
```

Desktop app with Homebrew on an Apple silicon Mac:

```bash
brew install --cask miragon/tap/miragon-bpmn-modeler
```

## Get started

In VS Code:

1. Open any `.bpmn`, `.dmn` or `.form` file. It opens in the modeler.
2. No file yet? Run **New BPMN Model** from the Command Palette and pick **Camunda 7**, **Camunda 8** or **Engine-neutral**.
3. Select an element and set its details in the properties panel.

The other editors have their own guides: [IntelliJ](https://miragon.github.io/bpmn-modeler/intellij/getting-started), [desktop app](https://miragon.github.io/bpmn-modeler/standalone/getting-started) and [Orca](https://miragon.github.io/bpmn-modeler/orca/getting-started).

## Help and feedback

- **Documentation:** every feature, setting and limit at [miragon.github.io/bpmn-modeler](https://miragon.github.io/bpmn-modeler/).
- **Bugs and ideas:** [open an issue](https://github.com/Miragon/bpmn-modeler/issues).
- **Commercial support:** write to [info@miragon.io](mailto:info@miragon.io).
- **Embedding:** the modeler is on npm as [`@miragon/bpmn-modeler`](packages/bpmn-modeler/README.md) and [`@miragon/dmn-modeler`](packages/dmn-modeler/README.md).

## Contributing

How to build, test and change the project is in [CONTRIBUTING.md](CONTRIBUTING.md). Outside pull requests are not accepted at the moment; please open an issue instead.

## License

[Apache License 2.0](LICENSE). Made by [Miragon](https://www.miragon.io).
