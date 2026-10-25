# Flow navigation

Walk a diagram along its sequence flows with the keyboard, without reaching for the mouse.

Flow navigation works while the canvas has focus. <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Tab</kbd> and <kbd>Alt</kbd>+<kbd>Tab</kbd> pass through, so tab and window switching keep working.

## Keys

### Move along flows

| Key | Selection | Action |
|---|---|---|
| <kbd>Tab</kbd> | Nothing | Select the first start event |
| <kbd>Shift</kbd>+<kbd>Tab</kbd> | Nothing | Select the first end event |
| <kbd>Tab</kbd> | Shape with one outgoing flow | Jump to the target |
| <kbd>Tab</kbd> | Shape with several outgoing flows or boundary events | Select the first candidate; press again to cycle (wraps) |
| <kbd>Tab</kbd> | Shape with no outgoing flow and one boundary event | Jump to the boundary event |
| <kbd>Shift</kbd>+<kbd>Tab</kbd> | Shape with one incoming flow | Jump to the source |
| <kbd>Shift</kbd>+<kbd>Tab</kbd> | Shape with several incoming flows | Jump to the source of the first one (top-left first) |
| <kbd>Shift</kbd>+<kbd>Tab</kbd> | Flow in a fan | Cycle to the previous flow (wraps) |
| <kbd>Shift</kbd>+<kbd>Tab</kbd> | Boundary event without incoming flow | Jump to its host |
| <kbd>Enter</kbd> | Sequence flow | Follow it to the target |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Sequence flow | Follow it to the source |
| <kbd>Enter</kbd> | Boundary event candidate | Commit it and continue from its outgoing flows |

### Sub-processes, links and panels

| Key | Selection | Action |
|---|---|---|
| <kbd>Enter</kbd> | Collapsed sub-process | Drill in and select its first start event |
| <kbd>U</kbd> | Inside a sub-process | Drill out one level and select the sub-process |
| <kbd>G</kbd> | Element with a model or code link (call activity, business rule, service, send or user task) | Open the referenced model, form or implementation file |
| <kbd>O</kbd> | Script task, or task with Camunda 7 listeners | Open the first script in an editor tab |
| <kbd>A</kbd> | Any shape | Open the [append menu](/vscode/features/append-menu) |
| <kbd>M</kbd> | Any shape | Open the element actions menu |
| <kbd>L</kbd> | Canvas | Format the diagram |
| <kbd>P</kbd> | Canvas | Focus the properties panel (expands it if collapsed) |
| <kbd>Shift</kbd>+<kbd>P</kbd> | Anywhere outside a text field | Show or hide the properties panel |
| <kbd>Esc</kbd> | Properties panel | Return focus to the canvas |

Inside the properties panel <kbd>Tab</kbd> moves between fields as usual. Use <kbd>P</kbd> to edit, <kbd>Esc</kbd> to come back and keep navigating.

## Walk a gateway

1. Select the gateway and press <kbd>Tab</kbd>: the first outgoing flow is selected.
2. Press <kbd>Tab</kbd> again to cycle to the next flow.
3. Press <kbd>Enter</kbd> to follow the selected flow into its branch.
4. Append with <kbd>A</kbd>, then press <kbd>Shift</kbd>+<kbd>Tab</kbd> to walk back to the gateway.

Tasks with boundary events work the same way: flows and boundary events are cycled together, and <kbd>Enter</kbd> on a boundary event continues from its outgoing flows.

## Limits

- Nothing on the canvas shows which flow <kbd>Enter</kbd> will follow.
- <kbd>Tab</kbd> no longer moves from the canvas into the properties panel; use <kbd>P</kbd>.
- <kbd>G</kbd> does nothing when the element has no resolvable link. If both a referenced model and an implementation exist, the model wins.

## Next steps

- [Append menu](/vscode/features/append-menu): what <kbd>A</kbd> opens.
- [Jump to code and models](/vscode/features/code-navigation): what <kbd>G</kbd> opens.
- [Inline scripts](/vscode/features/inline-scripting): what <kbd>O</kbd> opens.
