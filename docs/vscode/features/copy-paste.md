# Copy & Paste

Copy and paste BPMN elements between open `.bpmn` tabs, and copy/paste text
inside diagram labels, using the usual `Cmd/Ctrl+C` and `Cmd/Ctrl+V`.

## What works

| Action | Shortcut | Works across tabs? |
|---|---|---|
| Copy selected elements (shapes + connections) | `Cmd/Ctrl+C` | Yes |
| Paste elements onto the canvas | `Cmd/Ctrl+V` | Yes |
| Cut elements | `Cmd/Ctrl+X` | Yes |
| Copy text from a label (while editing) | `Cmd/Ctrl+C` | Yes |
| Paste text into a label (while editing) | `Cmd/Ctrl+V` | Yes |
| Select all text in a label (while editing) | `Cmd/Ctrl+A` | — |
| Select all elements on the canvas | `Cmd/Ctrl+A` | — |

Copy/paste uses VS Code's system clipboard, so it also works with other
applications — pasting BPMN elements elsewhere gives you the raw serialized
tree (prefixed with `bpmn-js-clip----`), which you can paste back into any
`.bpmn` tab later.

---

For implementation details, see [Contributing → Copy & Paste internals](/vscode/contributing/architecture/copy-paste).
