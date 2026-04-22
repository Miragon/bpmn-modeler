# Configuration

All settings live under the `miragon.bpmnModeler` namespace. Edit them in VS
Code's settings UI (search for "BPMN Modeler") or directly in `settings.json`.

## Settings reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `miragon.bpmnModeler.language` | enum | `en` | UI language for palette, context pad, and properties panel. One of `de`, `en`, `es`, `fr`, `nl-nl`, `pt-br`, `ru`, `zh-Hans`, `zh-Hant`. |
| `miragon.bpmnModeler.configFolder` | string | `.camunda` | Name of the config folder searched from each BPMN file up to the workspace root. Element templates live under `<configFolder>/element-templates/`. |
| `miragon.bpmnModeler.alignToOrigin` | boolean | `false` | Align the diagram to the top-left origin when opening. See [bpmn-io/align-to-origin](https://github.com/bpmn-io/align-to-origin). |
| `miragon.bpmnModeler.colorTheme` | enum | `automatic` | `automatic` follows the active VS Code theme; `light` always uses the default bpmn-js light theme. |
| `miragon.bpmnModeler.showTransactionBoundaries` | boolean | `true` | Show transaction boundaries on the canvas (Camunda 7 only). |
| `miragon.bpmnModeler.favouriteBpmnElements` | string[] | `["bpmn:ServiceTask","bpmn:UserTask","bpmn:CallActivity","bpmn:ExclusiveGateway"]` | BPMN element types pinned at the top of the append menu (max 6). |
| `miragon.bpmnModeler.c8ApiVersion` | string | `v2` | REST API version prefix for Camunda 8 endpoints. Change this if your cluster exposes a different API version. |

## Example `settings.json`

```json
{
    "miragon.bpmnModeler.language": "de",
    "miragon.bpmnModeler.configFolder": ".camunda",
    "miragon.bpmnModeler.alignToOrigin": true,
    "miragon.bpmnModeler.favouriteBpmnElements": [
        "bpmn:ServiceTask",
        "bpmn:UserTask",
        "bpmn:CallActivity",
        "bpmn:SubProcess",
        "bpmn:ExclusiveGateway",
        "bpmn:ParallelGateway"
    ]
}
```

## Commands

Beyond settings, the extension contributes several commands to the palette —
all prefixed `BPMN Modeler:`. See [Getting Started](/vscode/getting-started)
for the common ones.

## Element templates

Element templates follow the
[Camunda element-templates schema](https://github.com/camunda/element-templates-json-schema)
and are resolved by convention. No project config file required. See the
[Element Template Chooser](/vscode/features/element-template-chooser) page for
details on template discovery and the UI for applying them.
