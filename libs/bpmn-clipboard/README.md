# `@miragon/bpmn-modeler-clipboard`

Routes copy and paste of BPMN elements and label text through a `ClipboardBridge` the host provides.
`@miragon/bpmn-modeler` registers it only where the diagram cannot reach the system clipboard, such as
a sandboxed webview in VS Code, IntelliJ or the desktop app.

Internal workspace, not published on its own.

## How it works

- **Native by default.** Every editable surface registers `NativeCopyPaste` from
  `bpmn-js-native-copy-paste`. Registering nothing from this package leaves it in charge.
- **Bridged as an override.** `createClipboardModules({ element, text? })` turns `NativeCopyPaste` off and
  takes over the same EventBus events at priority 2051, just above its 2050. `text` defaults to `element`.
- `BridgedClipboardModule` serialises the copy tree through the bridge. It also catches the DOM `copy`
  event in the capture phase, so the VS Code webview handler cannot overwrite the payload with DOM text.
- `LabelClipboardModule` routes `Cmd/Ctrl+C/V/A` while a label is edited, in the capture phase, before
  `DirectEditing` stops propagation.

## Wire format

Both paths read and write the same `text/plain` payload, so a webview copy pastes into a browser tab and
back:

```
bpmn-js-clip----<JSON.stringify(copyTree)>
```

- The payload is unversioned on purpose: it must stay compatible with `bpmn-js-native-copy-paste` 0.3.x.
  A breaking change needs a new prefix, never a changed payload under the same one.
- Paste fails soft: text without the prefix is ignored, a parse error is logged, unknown `$type` nodes are
  dropped.
- Pasting across engines keeps the shared `bpmn:` shapes and silently drops `camunda:*` or `zeebe:*`
  extensions the target moddle does not know. `packages/bpmn-modeler/src/clipboardWireFormat.spec.ts` is
  the executable statement of this policy.

On the native path the browser's permission model applies: Chrome prompts on the first paste, Safari
and Firefox gate `navigator.clipboard.readText()`, which context-pad paste depends on. The bridged path
avoids all of it.

## Usage

```ts
import { createClipboardModules, type ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

const bridge: ClipboardBridge = {
    requestClipboard: async () => readFromHost(),
    writeClipboard: (text) => writeToHost(text),
};

new BpmnModeler({ additionalModules: [...createClipboardModules({ element: bridge })] });
```
