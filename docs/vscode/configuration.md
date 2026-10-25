# Configuration

Tune the modeler with settings under the `miragon.bpmnModeler` namespace. Edit them in the Settings UI (search for
"BPMN Modeler") or in `settings.json`.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `miragon.bpmnModeler.defaultMode` | `implement` | Mode a BPMN editor opens in when it has no remembered mode: `implement`, `design` or `view`. On an engine-neutral model, `implement` falls back to `design`. See [Editor modes](/vscode/features/modes). |
| `miragon.bpmnModeler.language` | `en` | UI language: `de`, `en`, `es`, `fr`, `it`, `ja`, `ko`, `nl-nl`, `pt-br`, `ru`, `zh-Hans`, `zh-Hant`. See [Language support](/vscode/features/language-support). |
| `miragon.bpmnModeler.colorTheme` | `automatic` | `automatic` follows the VS Code theme, `light` always uses the light canvas. |
| `miragon.bpmnModeler.configFolder` | `.camunda` | Folder searched from each BPMN file up to the workspace root. Element templates live in `<configFolder>/element-templates/`. |
| `miragon.bpmnModeler.favouriteBpmnElements` | Service task, user task, call activity, exclusive gateway | BPMN types pinned at the top of the [append menu](/vscode/features/append-menu), max 6 (for example `bpmn:ServiceTask`). |
| `miragon.bpmnModeler.alignToOrigin` | `false` | Move the diagram to the top-left origin when opening ([align-to-origin](https://github.com/bpmn-io/align-to-origin)). |
| `miragon.bpmnModeler.showTransactionBoundaries` | `true` | Show transaction boundaries on the canvas (Camunda 7 only). |
| `miragon.bpmnModeler.linting.enabled` | `true` | Run [linting](/vscode/features/linting). Also toggled by **Toggle Linting**. |
| `miragon.bpmnModeler.scripting.spin` | `true` | Offer Camunda SPIN completion in [inline scripts](/vscode/features/inline-scripting) (Camunda 7). |
| `miragon.bpmnModeler.persistCodeLinkMap` | `false` | Also write the map behind [Go to implementation](/vscode/features/code-navigation) to `<configFolder>/code-link/<file>.json`. |
| `miragon.bpmnModeler.c8ApiVersion` | `v2` | REST API version prefix for Camunda 8 endpoints. |
| `miragon.bpmnModeler.marketplaces` | `[]` | [Template marketplaces](/vscode/features/template-marketplace): GitHub or GitLab URLs, local folders, or objects for self-hosted instances. User and workspace entries are merged. |

## Example

```json
{
    "miragon.bpmnModeler.language": "de",
    "miragon.bpmnModeler.defaultMode": "design",
    "miragon.bpmnModeler.alignToOrigin": true,
    "miragon.bpmnModeler.favouriteBpmnElements": [
        "bpmn:ServiceTask",
        "bpmn:UserTask",
        "bpmn:CallActivity",
        "bpmn:ExclusiveGateway"
    ]
}
```

## Files and editors

`.bpmn` and `.dmn` files open in the modeler and are registered as their own BPMN and DMN languages (file icons,
language label). **Toggle Standard Text Editor** (`Ctrl+Shift+E`) shows the XML with full highlighting.

To open them in the text editor by default:

```json
"workbench.editorAssociations": {
    "*.bpmn": "default",
    "*.dmn": "default"
}
```

::: info XML extensions
Extensions that activate on the `xml` language (for example Red Hat XML) do not start on `.bpmn` and `.dmn` files.
Map the files to XML to get them back. You then lose the BPMN and DMN icons and language label.

```json
"files.associations": {
    "*.bpmn": "xml",
    "*.dmn": "xml"
}
```
:::

## Config folder

The `configFolder` walk also finds lint configs: at each level from the BPMN file up to the workspace root, the modeler
checks `<dir>/.bpmnlintrc`, then `<dir>/<configFolder>/.bpmnlintrc`. The nearest match wins. Element templates follow
the [Camunda element templates schema](https://github.com/camunda/element-templates-json-schema).

## Next steps

- [Element templates](/vscode/features/element-template-chooser): find and apply templates.
- [Linting](/vscode/features/linting): rules and `.bpmnlintrc`.
- [Get started](/vscode/getting-started): commands and first steps.
