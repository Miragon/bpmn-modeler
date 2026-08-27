# Flow Navigation (keyboard diagram traversal)

Navigate the BPMN diagram along sequence flows using the keyboard.

## Key bindings

| Key | Context | Action |
|---|---|---|
| **Tab** | Shape with 1 outgoing | Jump forward to the target shape |
| **Tab** | Shape with N outgoing (fan-out) | Select the first outgoing flow |
| **Tab** | Flow in a fan | Cycle to the next sibling flow (wraps) |
| **Shift+Tab** | Shape with 1 incoming | Jump backward to the source shape |
| **Shift+Tab** | Shape with N incoming (fan-in) | Jump to the source of the first incoming flow (sorted top-left) |
| **Shift+Tab** | Flow in a source fan | Cycle to the previous sibling flow (wraps) |
| **Tab** | Shape with outgoing + boundary events (mixed fan) | Select the first candidate (flow or boundary) |
| **Tab** | Flow or boundary candidate in a mixed fan | Cycle to the next candidate (wraps) |
| **Tab** | Shape with 0 outgoing, 1 boundary | Jump to the boundary event (committed) |
| **Tab** | Committed boundary event | Step along its own outgoing flows |
| **Shift+Tab** | Boundary event (0 incoming) | Jump to the host shape |
| **Enter** | Sequence flow | Follow the flow to its target |
| **Enter** | Boundary event (candidate) | Commit the boundary (stay selected, resume navigation from it) |
| **Shift+Enter** | Sequence flow | Follow the flow to its source |
| **Enter** | Collapsed subprocess | Drill into the subprocess plane, select first start event |
| **u** | Inside a subprocess plane | Drill out one level, re-select the subprocess shape |
| **g** | Call activity / business-rule / service / send task with a link | Jump to the referenced model or implementation file |
| **o** | Script task, or task with execution/task listeners (Camunda 7) | Open the first script in an editor tab (same as the "Open script in editor" button) |
| **Tab** _(nothing selected)_ | Canvas | Select the first start event |
| **Shift+Tab** _(nothing selected)_ | Canvas | Select the first end event |
| **p** | Canvas | Focus the properties panel (expands if collapsed) |
| **Shift+P** | Anywhere (not text field) | Toggle properties panel visibility |
| **Escape** | Properties panel | Return focus to the canvas |

**Ctrl/Cmd+Tab** and **Alt+Tab** are deliberately passed through so VS Code
tab switching and OS window switching keep working.

## Gateway walkthrough

1. Model a gateway with two or three outgoing branches.
2. Select the gateway and press **Tab** — the first outgoing flow is selected.
3. Press **Tab** again to cycle to the next flow (wraps around at the end).
4. Press **Enter** to follow the selected flow into its branch.
5. Append elements with **a**, then press **Shift+Tab** to walk back to the
   gateway.
6. Repeat from step 3 for the next branch.

## Boundary-event walkthrough

1. Model a task with one outgoing sequence flow and one or two attached
   boundary events.
2. Select the task and press **Tab** — the first candidate in the mixed fan
   (sorted top-left by representative position) is selected. Boundary events
   show as *candidates*; flows show as normal fan entries.
3. Press **Tab** to cycle through the candidates (flows and boundary events
   together, wrapping at the end).
4. When a boundary event is highlighted, press **Enter** to *commit* — the
   boundary stays selected and subsequent Tab/Shift+Tab navigate from the
   boundary's own outgoing flows.
5. Press **Shift+Tab** on a boundary with no incoming flows to jump back to
   the host task.

**Behaviour change:** a 1-to-1 sequence flow whose source has attached
boundary events now cycles within the mixed fan on Tab instead of jumping
straight to its target. **Enter** still follows the flow. Diagrams without
boundary events behave identically to before.

## Interaction with other keyboard features

- **Append menu** (`a`): flow navigation and append-menu are complementary —
  navigate to a shape, then press `a` to append a new element.
- **Canvas focus** (`Escape`): pressing Escape refocuses the canvas SVG from
  the properties panel. Once the canvas has focus, Tab/Shift+Tab navigate the
  diagram instead of cycling form fields.
- **Go to linked file** (`g`): triggers the jump-to-file context-pad entry on
  the selected element — referenced model on call activities or implementation
  file on service/send tasks. When an element has no link (or the host reported
  the reference as unresolvable), the key does nothing. If both a referenced
  model and an implementation link exist (theoretically on a business-rule task),
  the referenced model takes precedence.
- **Properties panel** (`p` / `Shift+P`): `p` on the canvas focuses the first
  field in the properties panel (expanding it if collapsed); `Shift+P` toggles
  panel visibility from anywhere except text fields; Escape returns to the
  canvas. The round-trip is `p` → edit properties → Escape → resume navigation.
  Tab inside the properties panel still performs native field traversal — flow
  navigation only fires while the canvas SVG has focus.

## Subprocess walkthrough

1. Model a collapsed subprocess containing a start event.
2. Select the collapsed subprocess and press **Enter** — the view drills into
   the subprocess plane and auto-selects the first start event inside.
3. Navigate inside the subprocess with **Tab** / **Shift+Tab** as usual.
4. Press **u** to drill out — the view returns to the parent plane with the
   subprocess shape selected. Works from any selection state, and from nested
   subprocesses (one level per press). At the top-level process, **u** does
   nothing. Breadcrumbs stay in sync automatically.

## Known limitations

- No visual affordance for "Enter will follow this flow" — a future iteration
  can reuse the `canvasFocusIndicator.ts` pattern.
- Tab on the canvas no longer escapes to the properties panel — use `p` to
  focus it, `Shift+P` to toggle visibility, and Escape to return to the canvas.
