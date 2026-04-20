---
name: bpmn-js
description: bpmn-js modeler internals — EventBus, services, copy-paste architecture, clipboard polyfill, modeler lifecycle. Use when working on bpmn-webview, diagram interactions, copy-paste, clipboard, or element templates.
---

# bpmn-js Modeler Internals

This skill covers how the BPMN webview (`apps/bpmn-webview/`) uses the bpmn-js library to render and edit BPMN diagrams, including the copy-paste architecture and clipboard polyfill.

## Modeler Initialization

The modeler is encapsulated in `apps/bpmn-webview/src/app/modeler.ts` as a `BpmnModeler` class. It wraps the underlying `camunda-bpmn-js` modeler (which extends `bpmn-js`).

### Engine Variants

The modeler supports two Camunda engine variants, selected at initialization:

- **Camunda 7** — imports `BpmnModeler7` from `camunda-bpmn-js/lib/camunda-platform/Modeler`. Additional modules: `CreateAppendElementTemplatesModule`, `TransactionBoundariesModule`.
- **Camunda 8** — imports `BpmnModeler8` from `camunda-bpmn-js/lib/camunda-cloud/Modeler`. No extra modules beyond the common set.

Both variants share `TokenSimulationModule` and `ElementTemplateChooserModule` as common modules.

### Lifecycle

1. `window.onload` in `main.ts` registers the message listener, installs the select-all handler, and initialises the theme
2. `main.ts` sends `GetBpmnFileCommand` to the extension host and awaits the `BpmnFileQuery` response
3. `initializeModeler()` calls `BpmnModeler.create(engine)` to mount the modeler
4. `BpmnModeler.loadDiagram(xml)` imports the BPMN XML
5. Viewport is restored from `vscode.getState()` if available
6. Event listeners are installed for `commandStack.changed` and `canvas.viewbox.changed`
7. The clipboard interceptor and contenteditable polyfill are installed (production only — see below)
8. Element templates and modeler settings are requested from the extension host

### Modeler Options

The modeler is created with these configuration options (see `MODELER_OPTIONS` constant):
- `container`: `"#js-canvas"` — DOM element for the diagram canvas
- `propertiesPanel.parent`: `"#js-properties-panel"` — DOM element for the properties panel sidebar
- `alignToOrigin`: `{ alignOnSave: false, offset: 150, tolerance: 50 }` — configures the auto-align plugin
- `additionalModules`: Engine-specific modules (see Engine Variants above)

## Core bpmn-js Services

Services are accessed via `modeler.get('serviceName')`. Key services used:

| Service                  | Purpose                                                     |
|--------------------------|-------------------------------------------------------------|
| `eventBus`               | Pub/sub event system — all modeler events flow through this |
| `copyPaste`              | Handles element copy/cut/paste operations on the diagram    |
| `moddle`                 | BPMN model factory — used by the paste reviver to reconstruct typed objects |
| `canvas`                 | Diagram canvas — viewport management, zoom, scroll          |
| `elementTemplatesLoader` | Loads element templates from JSON into the modeler          |
| `alignToOrigin`          | Auto-aligns diagram to canvas origin (configurable)         |
| `transactionBoundaries`  | Shows/hides transaction boundary overlays (C7 only)         |

## EventBus Events

### Events This Project Listens To

| Event                      | Where        | Purpose                                                                                                          |
|----------------------------|--------------|------------------------------------------------------------------------------------------------------------------|
| `commandStack.changed`     | `modeler.ts` | Triggered after any modeler command. Exports XML and sends `SyncDocumentCommand` to host.                        |
| `canvas.viewbox.changed`   | `modeler.ts` | Triggered on scroll/zoom. Debounced (100ms), saves viewport to `vscode.setState()` for persistence.             |
| `copyPaste.elementsCopied` | `modeler.ts` | Triggered when elements are copied. Intercepted to write descriptor JSON to system clipboard via extension host. |
| `copyPaste.pasteElements`  | `modeler.ts` | Triggered when paste occurs. Intercepted to read descriptor JSON from system clipboard via extension host.       |
| `elementTemplates.errors`  | `modeler.ts` | Triggered when element template loading produces errors. Forwarded to a callback for error reporting.            |

### Event Priority System

bpmn-js events use a priority system. Higher priority listeners fire first and can prevent lower-priority listeners from executing by returning `false` or calling `event.stopPropagation()`.

- Default priority: `1000`
- This project's clipboard interceptors use priority: **`2051`** — intentionally above the internal `CopyPasteModule` (priority `2050`) to intercept before the default handler

## Copy-Paste Architecture (Three Layers)

Copy-paste in this project operates at three distinct layers. **Important**: Layers 1 and 2 are only installed in production (`process.env.NODE_ENV !== "development"`). In development mode (plain browser), `NativeCopyPaste` from bpmn-js handles clipboard natively.

### Layer 1: Diagram Elements (bpmn-js CopyPaste service)

Handles copying/pasting of BPMN shapes and connections on the canvas.

**Flow — Copy**:
1. User presses Cmd/Ctrl+C while diagram elements are selected
2. bpmn-js `CopyPaste` module serializes selected elements into a descriptor tree (plain JS objects)
3. `copyPaste.elementsCopied` event fires
4. Our priority-2051 listener intercepts → prefixes the JSON with `"bpmn-js-clip----"` and sends it to the extension host via `SetClipboardCommand`
5. Extension host writes to system clipboard via `vscode.env.clipboard.writeText()`

**Flow — Paste**:
1. User presses Cmd/Ctrl+V while canvas is focused
2. `copyPaste.pasteElements` event fires
3. If `context.tree` already exists (same-editor paste), the interceptor does nothing — bpmn-js handles it internally
4. Otherwise, the interceptor snapshots the current context, returns `false` to cancel the default paste, and sends `GetClipboardCommand` to the extension host
5. Extension host reads system clipboard → responds with clipboard text via `ClipboardQuery`
6. Listener checks for the `"bpmn-js-clip----"` prefix, strips it, and parses the JSON using `createReviver(moddle)` from `bpmn-js-native-copy-paste` — this reviver reconstructs typed BPMN model objects from plain JSON
7. Calls `copyPaste.paste()` with the deserialized tree and the snapshotted context

**Why snapshot the context?** The `return false` in step 4 sets `defaultPrevented: true` on the event context object. Without snapshotting first, the async paste callback would inherit this flag, causing `copyPaste.paste()` to silently abort.

**Why the interceptor?** The webview runs in an iframe without clipboard API access. The extension host mediates clipboard access via `vscode.env.clipboard`.

### Layer 2: Direct-Editing Label Overlays (ContentEditable Polyfill)

Handles copying/pasting text within contenteditable label overlays on the diagram canvas (e.g., when double-clicking a task to edit its name). Despite the filename `propertiesPanelClipboard.ts`, this targets diagram-js's **direct-editing overlays**, not properties panel inputs. Standard INPUT and TEXTAREA elements (used by the properties panel) work natively in VS Code webviews.

**Problem**: diagram-js's `DirectEditing._handleKey` calls `stopPropagation()` on every keydown from the contenteditable overlay. This prevents native clipboard handling from reaching the element. Additionally, VS Code webview iframes lack `clipboard-read`/`clipboard-write` permissions.

**Solution**: `propertiesPanelClipboard.ts` installs a **capture-phase** `keydown` listener on `document`. Capture phase fires before bubble phase, so it runs before diagram-js can stop propagation.

```
Capture phase (our listener) → Target → Bubble phase (diagram-js listener)
```

The polyfill:
1. Checks if the target element is `contenteditable`
2. If **Cmd/Ctrl+C**: reads `window.getSelection()`, writes to the system clipboard via the extension host's `writeClipboard` callback
3. If **Cmd/Ctrl+V**: prevents the default event, reads from the system clipboard via the extension host's `requestClipboard` callback, then dispatches a synthetic `ClipboardEvent("paste")`. Falls back to `document.execCommand('insertText')` if no handler consumes the paste event.

### Layer 3: Select-All in ContentEditable

**Problem**: Cmd/Ctrl+A while editing a label selects all diagram elements instead of all text in the focused input.

**Solution**: `main.ts` installs a capture-phase `keydown` listener that checks if the target element is `contenteditable`. If so, it uses the Selection API to select all text within that element:
```typescript
const range = document.createRange();
range.selectNodeContents(target);
selection.removeAllRanges();
selection.addRange(range);
```
This prevents diagram-js from receiving the event and selecting all shapes.

## Element Templates

Element templates are JSON files that define custom property configurations for BPMN elements. They are loaded by:

1. Extension host sends `ElementTemplatesQuery` with template JSON to webview
2. Webview calls `bpmnModeler.setElementTemplates(templates)` → `modeler.get('elementTemplatesLoader').setTemplates(templates)`

## Modeler Settings

Settings are sent from the extension host as `BpmnModelerSettingQuery`:

- `alignToOrigin`: boolean — enables/disables auto-align to origin on save
- `showTransactionBoundaries`: boolean — shows/hides transaction boundary overlays (C7 only)

Applied via `bpmnModeler.setSettings()`, which merges the partial settings and immediately applies transaction boundary visibility for C7 engines using `transactionBoundaries.show()` / `transactionBoundaries.hide()`.

## Theme Handling

The webview detects the VS Code theme (light/dark) and swaps stylesheets:
- Light: `lightTheme.css`
- Dark: `darkTheme.css`

Theme detection uses `document.body.classList` — checking for `vscode-dark` or `vscode-high-contrast` classes that VS Code injects on every webview's `<body>`. A `MutationObserver` on the body's `class` attribute reacts to live theme changes.

## Key Files

- **Modeler wrapper**: `apps/bpmn-webview/src/app/modeler.ts`
- **Webview entry**: `apps/bpmn-webview/src/main.ts`
- **Clipboard polyfill**: `apps/bpmn-webview/src/app/propertiesPanelClipboard.ts`
- **Barrel exports**: `apps/bpmn-webview/src/app/index.ts`
- **VS Code API mock**: `apps/bpmn-webview/src/app/vscode.ts`
