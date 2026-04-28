<div id="top"></div>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<br />
<div align="center">
    <a href="#">
        <img src="https://raw.githubusercontent.com/Miragon/bpmn-vscode-modeler/main/images/miragon-logo.png" alt="Miragon" height="160">
    </a>
    <h3>BPMN VS Code Modeler — monorepo</h3>
    <p>A family of BPMN/DMN modeling tools built around a shared modeler core.</p>
    <p>
        <a href="https://miragon.github.io/bpmn-vscode-modeler/">Documentation</a>
        ·
        <a href="https://github.com/Miragon/bpmn-vscode-modeler/issues">Issues</a>
        ·
        <a href="https://github.com/Miragon/bpmn-vscode-modeler/pulls">Pull requests</a>
    </p>
</div>

## What this repo ships

This repository hosts more than one product. They share a common BPMN/DMN
modeling core (built on [bpmn-js](https://bpmn.io/) and
[dmn-js](https://github.com/bpmn-io/dmn-js)) and target different surfaces:

- **BPMN/DMN modeling for Camunda 7 and Camunda 8** — full BPMN 2.0 and DMN
  editing with engine-aware properties.
- **Deployment workflows** — deploy diagrams and start instances against C7
  or C8 from inside the editor.
- **BPMN diff** — element-level visual diff across two `.bpmn` files.
- **Multi-language UI** — modeler localised into 9 languages.
- **Multiple delivery surfaces** — VS Code extension today, standalone
  desktop app target in progress, more extensions planned.

Each product has its own README with its own pitch, feature list, and (where
applicable) marketplace listing. Start there.

## Modules

| Module | What it is | Status |
|---|---|---|
| [`apps/modeler-plugin`](apps/modeler-plugin/README.md) | VS Code extension — the public BPMN/DMN modeler. | Published on the [VS Code Marketplace][marketplace-url] |
| [`apps/standalone`](apps/standalone/README.md) | Theia/Electron desktop shell wrapping the same modeler. | Build-from-source, unreleased |
| [`apps/bpmn-webview`](apps/bpmn-webview/README.md) | BPMN canvas webview embedded in the extension host. | Internal |
| [`apps/dmn-webview`](apps/dmn-webview/README.md) | DMN canvas webview embedded in the extension host. | Internal |
| [`apps/deployment-webview`](apps/deployment-webview/README.md) | Deployment sidebar webview. | Internal |
| [`libs/shared`](libs/shared/README.md) | Shared message types and webview utilities. | Internal |

> Internal modules are not published separately — they are bundled into the
> distributables above.

## For users

You probably want **[`apps/modeler-plugin`](apps/modeler-plugin/README.md)** —
install *Camunda Modeler by Miragon* from the VS Code Marketplace and open
any `.bpmn` or `.dmn` file.

## For contributors

- Development setup, PR flow, and commit conventions:
  [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Architecture, build system, testing, and contributor walkthroughs:
  [`docs/`](docs/) (also published at
  <https://miragon.github.io/bpmn-vscode-modeler/>)

Quick orientation:

```bash
corepack enable
corepack yarn install
corepack yarn build      # build everything
corepack yarn watch      # F5 in VS Code → "Run modeler-plugin"
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full setup.

## Support

Questions or commercial support: [info@miragon.io](mailto:info@miragon.io).

## License

Distributed under the [Apache License 2.0](LICENSE).

<!-- MARKDOWN LINKS & IMAGES -->

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
[marketplace-url]: https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler
