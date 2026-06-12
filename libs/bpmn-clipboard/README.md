# `@miragon/bpmn-modeler-clipboard`

Makes copy/paste work inside the BPMN editor when it runs in a VS Code webview
iframe — both **diagram elements** (copy a shape/connection in one editor tab,
paste it into another) and **label text** while direct-editing an element name.
Inside a sandboxed webview `navigator.clipboard` is unusable (the iframe lacks
`clipboard-read`/`clipboard-write` permissions), so neither bpmn-js's native
copy-paste nor contenteditable's default clipboard handling can reach the
system clipboard on their own.

## How it works

The library routes every clipboard access through a `ClipboardBridge`
(`requestClipboard` / `writeClipboard`) that the host wires to `postMessage`,
so the real clipboard call (`vscode.env.clipboard`) happens on the extension
host, outside the iframe. It ships two DI modules:

- **`VsCodeClipboardModule`** disables bpmn-js's `NativeCopyPaste`
  (`nativeCopyPaste.toggle(false)`) and takes over at EventBus priority **2051**
  (just above the disabled layer's 2050): on `copyPaste.elementsCopied` it
  serialises the element tree to prefixed JSON and writes it through the bridge;
  on `copyPaste.pasteElements` it reads back and revives it. It also intercepts
  the DOM `copy` event in the **capture phase** so VS Code's own webview handler
  can't overwrite the serialised BPMN with stale DOM text.
- **`LabelClipboardModule`** attaches a capture-phase `keydown` listener to the
  contenteditable label on `directEditing.activate`, so Cmd/Ctrl+C/V/A are
  routed through the bridge *before* diagram-js's `DirectEditing._handleKey`
  calls `stopPropagation()`.

It binds two independent bridges, `elementClipboardBridge` and
`textClipboardBridge`, so element and label clipboards stay separate.

## Why this lives in its own library

- **The bridge indirection is the whole point.** The webview half (these
  modules) and the host half (`vscode.env.clipboard`) live on opposite sides of
  the iframe boundary; isolating the webview half behind a small `ClipboardBridge`
  interface keeps the diagram code free of webview message types and makes the
  modules trivially mockable.
- **It is opt-in per host.** In plain-browser dev mode the modules simply aren't
  loaded and bpmn-js's `NativeCopyPaste` handles the clipboard natively. That
  conditional wiring is cleaner as a separate package than as dead branches in
  the webview.

## Usage

```ts
import {
    VsCodeClipboardModule,
    LabelClipboardModule,
    type ClipboardBridge,
} from "@miragon/bpmn-modeler-clipboard";

const elementClipboardBridge: ClipboardBridge = {
    requestClipboard: async () => { /* postMessage → host, await reply */ },
    writeClipboard: (text) => { /* postMessage → host */ },
};
// ...a second bridge for label text...

new BpmnModeler({
    additionalModules: [
        VsCodeClipboardModule,
        LabelClipboardModule,
        { elementClipboardBridge: ["value", elementClipboardBridge] },
        { textClipboardBridge: ["value", textClipboardBridge] },
    ],
});
```
