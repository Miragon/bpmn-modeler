# `@miragon/bpmn-modeler-flow-navigation`

Adds keyboard-driven diagram traversal to the bpmn-js modeler: **Tab** moves
the selection forward along sequence flows, **Shift+Tab** backward. At a
fan-out (element with multiple outgoing flows) Tab cycles through the outgoing
flows and **Enter** follows the selected flow to its target.

## Why this exists

Keyboard-first modeling works well up to the point of branching: after
appending a task behind a gateway the selection sits on the new task and there
is no keyboard way back to the gateway to append the next branch. This module
adds the missing traversal so the user never has to reach for the mouse
mid-flow.

## Usage

```ts
import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";

new BpmnModeler({ additionalModules: [FlowNavigationModule] });
```

## Key bindings

| Key | Selection | Action |
|---|---|---|
| Tab | Shape (1 outgoing) | Jump to target shape |
| Tab | Shape (N outgoing) | Select first outgoing flow |
| Tab | Flow (in fan) | Cycle to next sibling flow |
| Shift+Tab | Shape (1 incoming) | Jump to source shape |
| Shift+Tab | Shape (N incoming) | Select first incoming flow |
| Shift+Tab | Flow (in fan) | Cycle to previous sibling flow |
| Shift+Tab | Boundary event (0 incoming) | Jump to host shape |
| Enter | Sequence flow | Jump to flow target |
| Shift+Enter | Sequence flow | Jump to flow source |
| Ctrl/Cmd+Tab | — | Pass through to VS Code / OS |

When nothing is selected, Tab picks the first start event (sorted top-left);
Shift+Tab picks the first end event.

## Known limitations (v1)

- A flow whose source **and** target both fan always cycles the source fan.
- Subprocess drill-down/up is not wired — navigation stays within the current
  root plane (expanded inline subprocesses work normally).
- No visual "Enter follows this" affordance yet — a future iteration can reuse
  the `canvasFocusIndicator.ts` pattern.
- Tab on the focused canvas no longer escapes to the properties panel — use
  `p` to focus it, `Shift+P` to toggle visibility, and Escape to return.
  Ctrl/Cmd/Alt+Tab are deliberately passed through; mouse focus is unaffected.

## Related shortcuts

`p` (focus panel), `Shift+P` (toggle panel), and Escape (return to canvas) are
wired in `libs/shared/src/lib/propertiesPanelFocus.ts`, not in this module.
