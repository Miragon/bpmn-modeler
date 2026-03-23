<div id="top"></div>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]
<!-- END OF PROJECT SHIELDS -->

<!-- PROJECT LOGO -->
<br />
<div align="center">
    <a href="#">
        <img src="https://raw.githubusercontent.com/Miragon/bpmn-vscode-modeler/main/images/miragon-logo.png" alt="Logo" height="180">
    </a>
    <h3>BPMN VS Code Modeler</h3>
    <p>
        <a href="https://github.com/Miragon/bpmn-vscode-modeler/issues">Report Bug</a>
        ·
        <a href="https://github.com/Miragon/bpmn-vscode-modeler/pulls">Request Feature</a>
    </p>
</div>

## About The Project

The BPMN VS Code Modeler is a VS Code extension for BPMN and DMN process modeling, built
on top of [bpmn-js](https://bpmn.io/toolkit/bpmn-js/). It targets teams working
with **Camunda 7 and Camunda 8** and integrates directly into your existing VS Code
workflow.

## Features

- **BPMN Modeling**: Create and edit BPMN 2.0 diagrams with full Camunda 7 and Camunda 8
  support.
- **DMN Modeling**: Create and edit DMN decision tables.
- **Element Templates**: Convention-based element template discovery — place templates
  under `<configFolder>/element-templates/` anywhere between your BPMN file and the
  workspace root. No extra project config file needed.
- **Copy & Paste**: Full clipboard support for BPMN elements within and across editor
  tabs, as well as text copy/paste inside diagram labels — working around VS Code
  webview clipboard restrictions.
- **Deployment**: Deploy BPMN/DMN diagrams and start process instances directly from a
  sidebar panel. Supports Camunda 7 and Camunda 8 with no auth, Basic Auth, and OAuth2
  Client Credentials. Payload files are discovered by convention from
  `<configFolder>/payloads/`.
- **Multi-Language UI**: The modeler UI (palette, context pad, properties panel) is
  available in English, Deutsch, Français, Nederlands, Português (Brasil), Русский,
  简体中文, and 繁體中文. Change the language via settings or the command palette.

## Getting Started (Users)

Install the extension from the VS Code Marketplace and open any `.bpmn` or `.dmn` file.
The modeler opens automatically as a custom editor.

### Configuration

| Setting                            | Default    | Description                                                        |
|------------------------------------|------------|--------------------------------------------------------------------|
| `miragon.bpmnModeler.configFolder` | `.camunda` | Folder name used for element template and payload file discovery   |
| `miragon.bpmnModeler.language`     | `en`       | UI language for the modeler (e.g. `de`, `fr`, `zh-Hans`)           |
| `miragon.bpmnModeler.c8ApiVersion` | `v2`       | REST API version prefix for Camunda 8 deployment endpoints         |

<p align="right">(<a href="#top">back to top</a>)</p>

## Contributing

Contributions are what make the open source community such an amazing place to learn,
inspire, and create. Any contributions are **greatly appreciated**.

For a full contributor guide including setup, project structure, development workflow,
code style, branching model, and CI/CD details, see
**[docs/README.md](docs/README.md)**.

### Quick Start

1. **Prerequisites**: Node.js v20+, `corepack enable`, VS Code
2. **Clone and install**:
   ```bash
   git clone https://github.com/Miragon/bpmn-vscode-modeler.git
   cd bpmn-vscode-modeler
   corepack yarn install
   ```
3. **Start watch mode**: `yarn dev`
4. **Launch the extension**: Open the **Run and Debug** panel in VS Code, select
   **"Run modeler-plugin"**, and press **F5**.

### Opening a Pull Request

1. Open an issue with the tag `enhancement` or `bug`
2. Fork the repository
3. Create a feature branch (`git checkout -b feat/my-feature`)
4. Use semantic commit messages scoped to the affected workspace:
   ```
   feat(bpmn): add token simulation toolbar
   fix(dmn): correct decision table rendering
   ```
5. Push and open a Pull Request

Please use semantic commit messages as described
in [here](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716).

<p align="right">(<a href="#top">back to top</a>)</p>

## Support

If you have questions or need support, reach out via
email ([info@miragon.io](mailto:info@miragon.io)).

## License

Distributed under the [Apache License Version 2.0](LICENSE).

<p align="right">(<a href="#top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[contributors-shield]: https://img.shields.io/github/contributors/Miragon/bpmn-vscode-modeler.svg?style=for-the-badge

[contributors-url]: https://github.com/Miragon/bpmn-vscode-modeler/graphs/contributors

[forks-shield]: https://img.shields.io/github/forks/Miragon/bpmn-vscode-modeler.svg?style=for-the-badge

[forks-url]: https://github.com/Miragon/bpmn-vscode-modeler/network/members

[stars-shield]: https://img.shields.io/github/stars/Miragon/bpmn-vscode-modeler.svg?style=for-the-badge

[stars-url]: https://github.com/Miragon/bpmn-vscode-modeler/stargazers

[issues-shield]: https://img.shields.io/github/issues/Miragon/bpmn-vscode-modeler.svg?style=for-the-badge

[issues-url]: https://github.com/Miragon/bpmn-vscode-modeler/issues

[license-shield]: https://img.shields.io/github/license/Miragon/bpmn-vscode-modeler.svg?style=for-the-badge

[license-url]: https://github.com/Miragon/bpmn-vscode-modeler/blob/main/LICENSE
