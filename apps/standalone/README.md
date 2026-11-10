# BPMN Modeler for the desktop

[![Desktop app](https://img.shields.io/badge/Desktop_app-download-335DE5)](https://miragon.github.io/bpmn-modeler/download)
[![License: Apache 2.0](https://img.shields.io/github/license/Miragon/bpmn-modeler)](../../LICENSE)

![The same modeler in VS Code: appending the missing end event to "Ship order" clears the lint error and the modeler reports no issues](https://raw.githubusercontent.com/Miragon/bpmn-modeler/main/images/modeler-demo.gif)

**Model processes, decisions and forms without running an IDE.**

A desktop app for macOS, Windows and Linux that opens `.bpmn`, `.dmn` and `.form` files with the same modeler as the [VS Code extension](../vscode-plugin/README.md), in an [Eclipse Theia](https://theia-ide.org/) window. It is in preview, free and open source, with no account.

## What you get

- **The modeler of the VS Code extension:** the View, Design and Implement modes, the properties panel for Camunda 7 and Camunda 8, linting, token simulation, element templates, DMN, Camunda Forms and deployment. There is no Extensions view.
- **Source control built in.** Git, including the BPMN diff that shows what changed element by element.
- **Auto-save** one second after your last edit.

## Install

| System                | Package                                                     | Updates          |
| --------------------- | ----------------------------------------------------------- | ---------------- |
| macOS (Apple silicon) | Signed `.dmg`, or Homebrew                                  | In-app updater   |
| Windows               | `.exe` installer                                            | In-app updater   |
| Linux x86_64          | Flatpak from the Miragon repository, or a `.flatpak` bundle | `flatpak update` |

Get the package from the [Download page](https://miragon.github.io/bpmn-modeler/download) or [GitHub Releases](https://github.com/Miragon/bpmn-modeler/releases). On macOS:

```bash
brew install --cask miragon/tap/miragon-bpmn-modeler
```

The Flatpak repository commands are in the [desktop guide](https://miragon.github.io/bpmn-modeler/standalone/getting-started#linux-with-flatpak). Source control needs `git` on macOS and Windows; the Flatpak brings its own.

## Get started

1. Open a `.bpmn`, `.dmn` or `.form` file from the **File** menu, or drop it onto the window.
2. To work on a whole project, choose **Open Folder…** in the **File** menu.
3. Select an element and set its details in the properties panel; your changes save themselves.

## Help and feedback

- **Documentation:** the [desktop guide](https://miragon.github.io/bpmn-modeler/standalone/getting-started) and the [feature pages](https://miragon.github.io/bpmn-modeler/vscode/features/), which the app shares with VS Code.
- **Bugs and ideas:** [open an issue](https://github.com/Miragon/bpmn-modeler/issues).

## Contributing

How to build, run and package the app is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](../../LICENSE). Made by [Miragon](https://www.miragon.io).
