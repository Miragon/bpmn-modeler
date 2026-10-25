# Editor modes

Switch a BPMN editor between a read-only viewer, an engine-neutral editor and the full Camunda modeler.

## The three modes

| Mode | What you get |
|---|---|
| **View** | Read-only viewer. Pan, zoom and read; no palette, no editing. |
| **Design** | Editable, engine-neutral surface. Model tasks, gateways, flows and lanes without Camunda execution properties. Engine-neutral `.bpmn` files open here. |
| **Implement** | The full Camunda modeler: properties panel, element templates, linting and inline scripts for Camunda 7 or Camunda 8. |

View and Design are always available. Implement needs an execution platform (Camunda 7 or Camunda 8) on the model. On an engine-neutral model it is greyed out, and opening such a model never adds a platform on its own.

## Switch modes

The **mode chip** in the top-left corner of the canvas (right of the Token Simulation toggle) shows the active mode. Click it and pick **View**, **Design** or **Implement**. The chip stays reachable while the properties panel is collapsed.

- Design ↔ Implement keeps the model loaded and the undo history intact.
- Any switch to or from View rebuilds the canvas but keeps viewport and selection.

## Default mode

Each editor remembers its mode: leave a tab in Design and it reopens in Design. An editor without a remembered mode starts in the mode set by `miragon.bpmnModeler.defaultMode`.

| Setting | Values | Default |
|---|---|---|
| `miragon.bpmnModeler.defaultMode` | `implement`, `design`, `view` | `implement` |

On an engine-neutral model `implement` falls back to **Design**.

## Create an engine-neutral file

**Miragon BPMN Modeler: New BPMN Model** offers **Camunda 7**, **Camunda 8** and **Engine-neutral**. Engine-neutral creates a model without a platform, which opens in Design. Pick Camunda 7 or Camunda 8 if you want Implement from the start.

## Next steps

- [Append menu](/vscode/features/append-menu): add elements in Design and Implement.
- [Linting](/vscode/features/linting): the engine checks in Implement.
- [Configuration](/vscode/configuration): set the default mode.
