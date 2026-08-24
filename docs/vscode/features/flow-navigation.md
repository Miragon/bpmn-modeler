# Flow Navigation (keyboard diagram traversal)

Navigate the BPMN diagram along sequence flows using the keyboard.

## Key bindings

| Key | Context | Action |
|---|---|---|
| **Tab** | Shape with 1 outgoing | Jump forward to the target shape |
| **Tab** | Shape with N outgoing (fan-out) | Select the first outgoing flow |
| **Tab** | Flow in a fan | Cycle to the next sibling flow (wraps) |
| **Shift+Tab** | Shape with 1 incoming | Jump backward to the source shape |
| **Shift+Tab** | Shape with N incoming (fan-in) | Select the first incoming flow |
| **Shift+Tab** | Flow in a fan | Cycle to the previous sibling flow (wraps) |
| **Shift+Tab** | Boundary event (0 incoming) | Jump to the host shape |
| **Enter** | Sequence flow | Follow the flow to its target |
| **Shift+Enter** | Sequence flow | Follow the flow to its source |
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

## Interaction with other keyboard features

- **Append menu** (`a`): flow navigation and append-menu are complementary —
  navigate to a shape, then press `a` to append a new element.
- **Canvas focus** (`Escape`): pressing Escape refocuses the canvas SVG from
  the properties panel. Once the canvas has focus, Tab/Shift+Tab navigate the
  diagram instead of cycling form fields.
- **Properties panel** (`p` / `Shift+P`): `p` on the canvas focuses the first
  field in the properties panel (expanding it if collapsed); `Shift+P` toggles
  panel visibility from anywhere except text fields; Escape returns to the
  canvas. The round-trip is `p` → edit properties → Escape → resume navigation.
  Tab inside the properties panel still performs native field traversal — flow
  navigation only fires while the canvas SVG has focus.

## Known limitations (v1)

- A flow whose source **and** target both fan always cycles the source fan.
- Subprocess drill-down/up is not wired — navigation stays within the current
  root plane (expanded inline subprocesses work normally).
- No visual affordance for "Enter will follow this flow" — a future iteration
  can reuse the `canvasFocusIndicator.ts` pattern.
- Tab on the canvas no longer escapes to the properties panel — use `p` to
  focus it, `Shift+P` to toggle visibility, and Escape to return to the canvas.
