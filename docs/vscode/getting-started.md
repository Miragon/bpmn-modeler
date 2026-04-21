# Getting Started

The Miragon BPMN Modeler is a VS Code extension for editing BPMN 2.0 and DMN
diagrams with full Camunda 7 and Camunda 8 support.

## Install

Install from the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler),
or from the command line:

```bash
code --install-extension miragon-gmbh.vs-code-bpmn-modeler
```

## Open a diagram

Create or open any `.bpmn` or `.dmn` file in your workspace — the modeler opens
automatically as the default editor for that file type. You can also use the
command palette:

- **BPMN Modeler: Toggle Standard Text Editor** — switch between the graphical
  modeler and the raw XML view (`Ctrl+Shift+E`).
- **BPMN Modeler: Copy Diagram as SVG** / **Save Diagram as SVG** — export the
  current diagram as a vector image.
- **BPMN Modeler: Change Modeler Language** — pick the modeler UI language at
  runtime.

## Element templates

Drop Camunda element templates into a `.camunda/element-templates/` folder next
to your diagrams (or anywhere up the path to the workspace root). The modeler
auto-discovers them and surfaces them in the
[Element Template Chooser](/vscode/features/element-template-chooser) and the
[Append Menu](/vscode/features/append-menu) — no extra config needed.

The folder name is configurable via the
[`miragon.bpmnModeler.configFolder`](/vscode/configuration) setting.

## Deploy

Open the **Deploy Diagram** view in the VS Code activity bar to push the current
diagram directly to a Camunda 7 or Camunda 8 cluster — no CLI, no separate tool.
See the [Deployment](/vscode/features/deployment) page for details on engine
credentials and one-click publish.

## Switch language

The modeler supports 9 languages (English, German, French, Spanish, Dutch,
Brazilian Portuguese, Russian, Simplified and Traditional Chinese). Set
`miragon.bpmnModeler.language` in your VS Code settings, or run **BPMN Modeler:
Change Modeler Language** from the command palette. See
[Language Support](/vscode/features/language-support) for the full list.

## Next steps

- Tune the modeler to your workflow in [Configuration](/vscode/configuration).
- Explore the individual [Features](/vscode/features/append-menu) for
  architecture notes and deep dives.
- Contributing? See the [Development](/vscode/contributing/development) guide.
