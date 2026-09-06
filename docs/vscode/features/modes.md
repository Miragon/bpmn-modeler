# Editor Modes (View / Design / Implement)

Every BPMN editor runs in one of three modes. The mode decides which surface
you get on the canvas — from a plain readonly viewer up to the full Camunda
modeler — so you can dial the tooling up or down without leaving the tab.

## The three modes

- **View** — a readonly bpmn-js viewer. No palette, no editing; pan, zoom, and
  read the diagram. Good for reviewing a model you don't want to change.
- **Design** — an engine-neutral, editable surface. Model the process shape
  (tasks, gateways, flows, lanes) without any Camunda execution properties.
  This is what engine-neutral `.bpmn` files open in.
- **Implement** — the full Camunda modeler: the complete properties panel,
  element templates, linting, and inline script editing for the model's
  execution platform (Camunda 7 or Camunda 8).

## Availability

**View** and **Design** are always available. **Implement** requires a Camunda
execution platform stamped on the model — on an untagged (engine-neutral)
model there is nothing to implement against, so it is greyed out with an
explanatory tooltip.

| Model | View | Design | Implement |
|---|---|---|---|
| Untagged (engine-neutral) | ✅ | ✅ | ⛔ greyed out |
| Tagged (Camunda 7 / Camunda 8) | ✅ | ✅ | ✅ |

Implement stays greyed out for as long as the model carries no execution
platform. Opening an untagged model never stamps one on automatically — the
document is left exactly as it is.

## Switching modes

A segmented **mode strip** sits in the properties-panel header. Click **View**,
**Design**, or **Implement** to switch the current editor's surface. When the
properties panel is collapsed, the strip shrinks to a single-letter badge
(**V** / **D** / **I**) showing the active mode.

Switching between **Design** and **Implement** on a tagged model is a live
toggle — the model stays loaded and undo history survives. Any switch that
involves **View** recreates the surface, preserving the viewport and selection.

## Persistence and the default mode

Mode is remembered **per editor**: switch a tab to Design, move away, and it
reopens in Design when you come back.

An editor that has no remembered mode is seeded from the
[`miragon.bpmnModeler.defaultMode`](/vscode/configuration) setting
(`implement` | `design` | `view`, default `implement`). On an untagged model
`implement` is unavailable, so the seed falls back to **Design**.

## Creating an engine-neutral file

**BPMN Modeler: New BPMN Model** offers three choices: **Camunda 7**,
**Camunda 8**, and **Engine-neutral**. The Engine-neutral choice scaffolds an
untagged model, which opens directly in **Design**. Choose Camunda 7 or
Camunda 8 instead if you want Implement available from the start.
