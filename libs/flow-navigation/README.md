# `@miragon/bpmn-modeler-flow-navigation`

Keyboard traversal of a diagram: `Tab` moves the selection forward along sequence flows, `Shift+Tab`
backward, `Enter` follows a selected flow. Without it there is no keyboard way back to a gateway to append
the next branch. `@miragon/bpmn-modeler` inlines it.

Internal workspace, not published on its own.

## Key bindings

| Key | Selection | Action |
|---|---|---|
| Tab | Nothing | Select the first start event (top left) |
| Tab | Shape with one outgoing flow and no boundary events | Jump to the target |
| Tab | Shape with several outgoing flows or boundary events | Select the first candidate of its fan |
| Tab | Shape with no outgoing flow and one boundary event | Commit the boundary event |
| Tab | Flow or boundary event in a fan | Next candidate |
| Tab | Committed boundary event | Step along its own outgoing flows |
| Shift+Tab | Nothing | Select the first end event |
| Shift+Tab | Shape with one or several incoming flows | Jump to the source of the first incoming flow (top left) |
| Shift+Tab | Flow in a source fan | Previous sibling flow |
| Shift+Tab | Boundary event without incoming flow | Jump to its host |
| Enter | Sequence flow | Jump to the target |
| Enter | Boundary event in a fan | Commit it and navigate from it |
| Shift+Enter | Sequence flow | Jump to the source |
| Enter | One collapsed subprocess | Drill into its plane, select the first start event |
| u | Inside a subprocess plane | Drill out one level, reselect the subprocess |
| g | Call activity, service, send or business-rule task | Jump to the referenced model or implementation |
| Ctrl/Cmd/Alt+Tab | Anything | Passed through to the host and OS |

The fan of a shape is its outgoing flows plus its boundary events, sorted by y, then x, of the flow's
target or the boundary event itself.

## Good to know

- `Tab` on the canvas no longer reaches the properties panel. `p` focuses the panel, `Shift+P` toggles
  it and `Escape` returns; those are wired in `libs/shared/src/lib/propertiesPanelFocus.ts`.
- There is no visual hint yet of which flow `Enter` follows.
