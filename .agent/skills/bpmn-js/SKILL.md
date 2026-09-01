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
- The element-clipboard interceptor in `BridgedClipboardModule` uses priority
  **`2051`** — intentionally above bpmn-js's `NativeCopyPaste` (priority `2050`)
  to intercept `copyPaste.elementsCopied` / `copyPaste.pasteElements` before the
  default handler runs

## Copy-Paste Architecture (Three Layers)

Copy-paste in this project operates at three distinct layers. The **default is
the native browser clipboard** — camunda-bpmn-js always registers bpmn-js's
`NativeCopyPaste`, so a plain browser (the demo, `serve`) needs nothing extra
(#1374). The first two layers below are the **host-bridge override**: bpmn-js DI
modules in the shared `libs/bpmn-clipboard` package
(`@miragon/bpmn-modeler-clipboard`), built by its `createClipboardModules({
element, text? })` factory and registered only when the webview can't reach the
system clipboard; the third is a webview-local polyfill. `apps/bpmn-webview/src/bootstrap.ts`
selects between them (native for dev / `clipboard: "native"`, otherwise the
protocol bridge). The two DI modules receive their host bridges through didi
value injection — `elementClipboardBridge` (element JSON) and
`textClipboardBridge` (plain text), each a `{ requestClipboard, writeClipboard }`
pair the factory binds; `text` defaults to `element`. When registered, the
override disables `NativeCopyPaste` (`nativeCopyPaste.toggle(false)`) and takes
over inside the sandboxed VS Code / IntelliJ webview, where the iframe has no
clipboard access.

> Two separate host round-trips: **element** clipboard uses
> `GetClipboardCommand` / `SetClipboardCommand` → `ClipboardQuery`; **text**
> clipboard (labels, FEEL editor) uses `GetTextClipboardCommand` /
> `SetTextClipboardCommand` → `TextClipboardQuery`.

### Layer 1: Diagram Elements (`BridgedClipboardModule`)

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

### Layer 2: Direct-Editing Label Overlays (`LabelClipboardModule`)

Handles copying/pasting text within contenteditable label overlays on the diagram canvas (e.g., when double-clicking a task to edit its name). This targets diagram-js's **direct-editing overlays**, not properties panel inputs — standard INPUT and TEXTAREA elements work natively in VS Code webviews.

**Problem**: diagram-js's `DirectEditing._handleKey` calls `stopPropagation()` on every keydown from the contenteditable overlay. This prevents native clipboard handling from reaching the element. Additionally, VS Code webview iframes lack `clipboard-read`/`clipboard-write` permissions.

**Solution**: `LabelClipboardModule` is a bpmn-js DI module that attaches a **capture-phase** `keydown` listener **on the label element, only while direct editing is active** (scoped tighter than the old document-wide listener). Capture phase fires before bubble phase, so it runs before diagram-js can stop propagation.

```
Capture phase (our listener) → Target → Bubble phase (diagram-js listener)
```

For Cmd/Ctrl+C it reads `window.getSelection()` and writes via the injected `textClipboardBridge.writeClipboard`; for Cmd/Ctrl+V it prevents default, reads via `textClipboardBridge.requestClipboard`, then dispatches a synthetic `ClipboardEvent("paste")`, falling back to `document.execCommand('insertText')` if no handler consumes it.

### Layer 3: FEEL Editor Polyfill + Select-All Guard (`propertiesPanelClipboard.ts`)

The C8 properties panel's FEEL expression editor is **CodeMirror 6**, which lives *outside* the bpmn-js DI context — so the two DI modules above can't reach it. `installContentEditableClipboardPolyfill(requestTextClipboard, writeTextClipboard)` (still webview-local in `apps/bpmn-webview/src/app/propertiesPanelClipboard.ts`, installed from `main.ts`) fills that gap: a capture-phase `keydown` listener that bridges Cmd/Ctrl+C/V on any contenteditable/text-editing surface through the host **text** clipboard.

It also guards **Cmd/Ctrl+A**: without it, bpmn-js's `Keyboard` service steals Ctrl+A in a text field and selects all diagram shapes. The polyfill lets Ctrl+A select text within the focused editable element (canvas Ctrl+A stays owned by bpmn-js's `SelectionKeyBindings`).

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

The BPMN webview themes each modeler **instance** through `@miragon/bpmn-modeler`
(ADR 0012), not by swapping a page stylesheet. The theme CSS (unscoped light base
+ `[data-bpmn-theme="dark"]`-scoped dark overrides) ships inside the main bundle,
and the package toggles a `data-bpmn-theme` attribute on the instance's container
+ properties-panel parent. `apps/bpmn-webview/src/hostTheme.ts` resolves the IDE
kind from the VS Code body classes (`vscode-dark` / `vscode-high-contrast`,
watched by a `MutationObserver`) and drives both the page-level scope and the
instance's `setTheme`. (DMN still swaps `lightTheme.css` / `darkTheme.css` via
`#theme-link` — its dmn-js CSS is not in the package.)

## Key Files

- **Modeler wrapper**: `apps/bpmn-webview/src/app/modeler.ts`
- **Webview entry** (installs the clipboard modules): `apps/bpmn-webview/src/main.ts`
- **Element clipboard module** (priority 2051, `createReviver`): `libs/bpmn-clipboard/src/BridgedClipboardModule.ts` (built via `createClipboardModules`)
- **Label overlay clipboard module**: `libs/bpmn-clipboard/src/LabelClipboardModule.ts`
- **FEEL editor + Ctrl+A polyfill**: `apps/bpmn-webview/src/app/propertiesPanelClipboard.ts`
- **Barrel exports**: `apps/bpmn-webview/src/app/index.ts`
- **Host API wrapper + dev mock** (`getHostApi`/`MockHost`): `apps/bpmn-webview/src/app/host.ts`
