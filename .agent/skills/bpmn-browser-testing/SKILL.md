---
name: bpmn-browser-testing
description: >
  Interact with the BPMN modeler webview running in a browser using Playwright MCP tools.
  Use this skill whenever the user asks to test, inspect, or interact with the BPMN modeler
  in a browser — including adding/modifying BPMN elements, checking the properties panel,
  verifying UI behavior, or debugging the webview. Also trigger when the user mentions
  "serve:bpmn-webview", "open the modeler in a browser", "add a task/event/gateway",
  "check the properties panel", or any visual/interactive testing of the BPMN webview.
---

# BPMN Browser Testing with Playwright

This skill explains how to interact with the bpmn-js modeler webview in a real browser
using the Playwright MCP plugin. The webview is an SVG-based BPMN editor built on
[bpmn-js](https://github.com/bpmn-io/bpmn-js) with a Camunda properties panel.

## Starting the dev server

```bash
corepack yarn serve:bpmn-webview
```

This runs Vite on `http://localhost:5173`. In dev mode (`NODE_ENV=development`), the
webview skips the VS Code clipboard bridge and uses native browser clipboard instead.

## Page structure

The webview DOM has three main areas:

| Selector                   | Area              | Notes                                        |
|----------------------------|-------------------|----------------------------------------------|
| `#js-canvas`               | bpmn-js canvas    | SVG-based — mostly opaque to accessibility   |
| `#js-properties-panel`     | Properties panel  | Standard HTML — fully accessible via snapshot |
| `#js-panel-resizer`        | Resizer handle    | Between canvas and panel                     |

The palette (left toolbar) and context pad (icons around selected elements) are rendered
inside the canvas container but are accessible via `getByTitle()`.

## Key interaction patterns

### Placing elements from the palette (click-then-click)

bpmn-js palette entries do NOT work with standard HTML drag-and-drop. Use a two-step
click pattern:

1. **Click the palette entry** to activate "create mode"
2. **Click on the canvas** to place the element

```js
// Step 1: activate create mode
await page.getByTitle('Create task').click();
// Step 2: click on the canvas to place
await page.mouse.click(250, 350);
```

Drag-and-drop via `element.dragTo()` or manual `mouse.down/move/up` does NOT work
reliably because bpmn-js uses a custom drag implementation on an SVG canvas.

### Using the context pad

After placing/selecting an element, bpmn-js shows a context pad with action icons.
These ARE visible in accessibility snapshots via their `title` attributes:

- `Append end event`, `Append gateway`, `Append task`, `Append intermediate/boundary event`
- `Change element` — opens the type selection popup
- `Delete`, `Set color`, `Connect to other element`
- `Add text annotation`, `Append element`

Use `browser_snapshot` to discover the available context pad entries and their refs,
then click them directly.

### Changing element type

To convert a generic task to a specific type (e.g., Service Task):

1. Select the element (click on it)
2. Click `Change element` in the context pad
3. A popup appears with a searchable list — click the desired type

```
snapshot → find ref for "Change element" → click it
snapshot → find ref for "Service task" → click it
```

The properties panel updates immediately to show type-specific sections.

### Reading and interacting with the properties panel

The properties panel (`#js-properties-panel`) is standard HTML and fully accessible.
Use `browser_snapshot` to read its state — section headers, form fields, buttons.

Common panel sections for a Service Task:
- **General** — Name, ID
- **Task definition** — Job type, retries
- **Input mapping** / **Output mapping**
- **Headers**
- **Execution listeners**
- **Extension properties**
- **Example data**

Sections can be expanded/collapsed via "Toggle section" buttons.

### Selecting existing elements

Elements on the SVG canvas are not directly addressable via accessibility snapshots.
To select an existing element, use coordinate-based clicking:

```js
// Click at known canvas coordinates
await page.mouse.click(x, y);
```

Alternatively, use `browser_take_screenshot` to visually locate elements, then click
at the appropriate coordinates.

## When to use screenshots vs snapshots

| Tool                    | Best for                                              |
|-------------------------|-------------------------------------------------------|
| `browser_snapshot`      | Properties panel, palette, context pad, popups        |
| `browser_take_screenshot` | Canvas elements (tasks, events, gateways, flows)    |

The SVG canvas renders very little in the accessibility tree. Always use screenshots
to verify what's actually on the canvas (element positions, connections, labels).
Use snapshots for interacting with HTML-based UI (palette, panels, popups).

## Modeler API (not directly accessible)

The `BpmnModeler` class instance is NOT exposed on `window`, so you cannot call the
bpmn-js API via `page.evaluate()`. All interaction must go through the Playwright UI
tools (click, snapshot, screenshot).

## Console output

Expect these console messages in dev mode — they are not errors in your workflow:
- `[ERROR] Theme link element not found.` — Normal in browser (theme link is injected by VS Code)
- `[LOG] Missing translation [en]: ...` — Translation keys not yet added for the current locale
- `[LOG] development` — Confirms dev mode is active

## Common recipes

### Add a Service Task and configure it

```
1. browser_snapshot → find "Create task" ref → click it
2. browser_run_code → page.mouse.click(250, 350) to place on canvas
3. browser_snapshot → find "Change element" ref → click it
4. browser_snapshot → find "Service task" ref → click it
5. browser_snapshot → expand "Task definition" → fill in job type
```

### Connect two elements

```
1. Click source element on canvas
2. browser_snapshot → find "Connect to other element" → click it
3. Click target element on canvas
```

### Verify element was created

```
1. browser_take_screenshot → visually confirm element on canvas
2. browser_snapshot → check properties panel shows correct type and sections
```

## Troubleshooting

- **Element not placed after palette click**: Make sure you click on the canvas area
  (not the properties panel or palette). The canvas is `#js-canvas`, roughly the center
  of the viewport excluding the left palette bar and right properties panel.
- **Context pad not showing**: The element might not be selected. Click directly on
  the element's position on the canvas.
- **Properties panel empty**: Click somewhere on the canvas background to deselect,
  then click the element again.

## Reference

For deeper details on the webview architecture, read:
- `apps/bpmn-webview/src/main.ts` — Entry point and message routing
- `apps/bpmn-webview/src/app/modeler.ts` — BpmnModeler class (C7/C8 engine setup)
- `apps/bpmn-webview/index.html` — DOM structure
