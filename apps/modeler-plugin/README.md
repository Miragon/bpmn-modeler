<div align="center">
    <img src="https://raw.githubusercontent.com/Miragon/bpmn-vscode-modeler/main/images/miragon-logo.png" alt="Miragon" height="140">
    <h3>Camunda Modeler by Miragon</h3>
    <p>BPMN 2.0 and DMN modeling for Camunda 7 and Camunda 8 — directly in VS Code.</p>
    <p>
        <a href="https://miragon.github.io/bpmn-vscode-modeler/">Documentation</a>
        ·
        <a href="https://github.com/Miragon/bpmn-vscode-modeler/issues">Report Bug</a>
        ·
        <a href="https://github.com/Miragon/bpmn-vscode-modeler/pulls">Request Feature</a>
    </p>
</div>

## Why this extension

Model and maintain BPMN/DMN files where your code already lives. No context
switch into a separate desktop modeler, no detached tooling — diagrams are
versioned, reviewed, and edited in the same workflow as the rest of your
project.

> **Powered by [bpmn.io](https://bpmn.io/)** — built on
> [bpmn-js](https://github.com/bpmn-io/bpmn-js) and
> [dmn-js](https://github.com/bpmn-io/dmn-js).

## Features

- **BPMN modeling** — full BPMN 2.0 with Camunda 7 and Camunda 8 properties.
- **DMN modeling** — decision tables, decision requirements diagrams, literal
  expressions.
- **Element templates** — convention-based discovery: drop templates under
  `<configFolder>/element-templates/` anywhere between your BPMN file and the
  workspace root. No extra project config needed.
- **Deployment sidebar** — deploy diagrams and start process instances against
  Camunda 7 or 8. Supports no auth, Basic Auth, and OAuth2 Client Credentials.
  Payload files are discovered by convention from `<configFolder>/payloads/`.
- **BPMN diff view** — side-by-side readonly canvases for two `.bpmn` files
  with element-level colour coding (added / removed / changed / moved) via
  [`bpmn-js-differ`](https://github.com/bpmn-io/bpmn-js-differ), synchronized
  pan/zoom, and a prev/next change navigator.
- **Multi-language UI** — palette, context pad, and properties panel
  available in English, Deutsch, Español, Français, Nederlands,
  Português (Brasil), Русский, 简体中文, and 繁體中文.

![BPMN VS Code Modeler Preview](https://raw.githubusercontent.com/Miragon/bpmn-vscode-modeler/main/images/modeler-preview.png)

## Getting started

Install **Camunda Modeler by Miragon** from the VS Code Marketplace, then open
any `.bpmn` or `.dmn` file — the modeler opens automatically as a custom
editor.

### Settings

Search for "BPMN Modeler" in Settings (`Ctrl+,` / `Cmd+,`).

| Setting                                         | Default                     | Description                                                             |
|-------------------------------------------------|-----------------------------|-------------------------------------------------------------------------|
| `miragon.bpmnModeler.configFolder`              | `.camunda`                  | Folder name used for element template and payload file discovery        |
| `miragon.bpmnModeler.language`                  | `en`                        | UI language for the modeler (e.g. `de`, `fr`, `zh-Hans`)                |
| `miragon.bpmnModeler.colorTheme`                | `automatic`                 | Color theme for the BPMN canvas (`automatic` or `light`)                |
| `miragon.bpmnModeler.favouriteBpmnElements`     | `["bpmn:ServiceTask", ...]` | BPMN element types pinned at the top of the append menu palette (max 6) |
| `miragon.bpmnModeler.showTransactionBoundaries` | `true`                      | Show transaction boundaries in the BPMN canvas (C7 only)                |
| `miragon.bpmnModeler.c8ApiVersion`              | `v2`                        | REST API version prefix for Camunda 8 deployment endpoints              |
| `miragon.bpmnModeler.alignToOrigin`             | `false`                     | Align the diagram to the origin when opening a new diagram              |

### Commands

Search for "BPMN Modeler" in the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

| Command                                   | Keybinding     | Description                                                      |
|-------------------------------------------|----------------|------------------------------------------------------------------|
| BPMN Modeler: Change Modeler Language     |                | Change the UI language of the modeler                            |
| BPMN Modeler: Deploy Diagram              |                | Open the Deployment sidebar for the current BPMN/DMN diagram     |
| BPMN Modeler: Copy Diagram as SVG         |                | Copy the current diagram to the clipboard as SVG                 |
| BPMN Modeler: Save Diagram as SVG         |                | Save a SVG file of the current diagram next to the bpmn file     |
| BPMN Modeler: Change Engine Version       |                | Switch between engine versions (within a platform)               |
| BPMN Modeler: Migrate All BPMN Diagrams   |                | Switch the engine versions of all BPMN diagrams in the workspace |
| BPMN Modeler: Toggle Standard Text Editor | `Ctrl+Shift+E` | Open the XML text editor next to the BPMN modeler                |
| BPMN Modeler: Display Logging Information |                | Open a console showing modeler log output                        |

## Support and feedback

- Documentation: <https://miragon.github.io/bpmn-vscode-modeler/>
- Bugs / feature requests: <https://github.com/Miragon/bpmn-vscode-modeler/issues>
- Contact: [info@miragon.io](mailto:info@miragon.io)

## License

Distributed under the [Apache License 2.0](https://github.com/Miragon/bpmn-vscode-modeler/blob/main/LICENSE).
