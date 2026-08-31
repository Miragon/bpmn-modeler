# `@miragon/bpmn-modeler-clipboard`

The **host-bridge override** for BPMN element and label-text copy/paste. By
default the modeler uses bpmn-js's own native browser clipboard — this package
is only registered when the modeler runs somewhere the system clipboard is out
of reach from the diagram (a sandboxed webview iframe lacking
`clipboard-read`/`clipboard-write`, e.g. VS Code / IntelliJ / Theia). It routes
copy/paste through a `ClipboardBridge` the host wires to its own clipboard.

## Polarity: native default, bridge override

Clipboard is on by default, one override away.

- **Native (default).** camunda-bpmn-js always registers bpmn-js's
  `NativeCopyPaste` (both C7 and C8). Registering **nothing** from this package
  leaves it in charge — zero extra code, full wire compatibility. This is what a
  plain browser (the demo, `serve`) gets.
- **Bridged (override).** A host that can't reach the system clipboard from its
  webview calls `createClipboardModules({ element, text? })` and adds the result
  to `additionalModules`. This disables `NativeCopyPaste`
  (`nativeCopyPaste.toggle(false)`) and takes over the same EventBus events at
  priority **2051** (just above the disabled layer's 2050).

The package exports exactly the factory and the bridge type; the DI value names
(`elementClipboardBridge` / `textClipboardBridge`) are an internal detail.

### What the override ships

`createClipboardModules` returns two DI modules plus their value bindings:

- **`BridgedClipboardModule`** — diagram elements. On `copyPaste.elementsCopied`
  it serialises the element tree to prefixed JSON and writes it through the
  bridge; on `copyPaste.pasteElements` it reads back and revives it. It also
  intercepts the DOM `copy` event in the **capture phase** so VS Code's own
  webview handler can't overwrite the serialised BPMN with stale DOM text, and
  re-focuses the canvas after keyboard selection changes (both are
  bridge-path-only repairs — never active on the native path).
- **`LabelClipboardModule`** — contenteditable label text. Attaches a
  capture-phase `keydown` listener on `directEditing.activate`, so Cmd/Ctrl+C/V/A
  are routed through the bridge *before* diagram-js's `DirectEditing._handleKey`
  calls `stopPropagation()`.

Two bridges are bound so element and label clipboards stay separate;
`createClipboardModules` defaults `text` to `element`, so the single-bridge
public API maps straight onto both channels.

## Usage

```ts
import { createClipboardModules, type ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

const bridge: ClipboardBridge = {
    requestClipboard: async () => {
        /* postMessage → host, await reply */
    },
    writeClipboard: (text) => {
        /* postMessage → host (may be async; the return is ignored) */
    },
};

new BpmnModeler({
    additionalModules: [
        // Omit this line entirely for the native browser clipboard.
        ...createClipboardModules({ element: bridge }),
    ],
});
```

## Wire format (public contract)

Both the native and bridged paths read/write the **same** `text/plain` payload,
which is why a webview copy pastes into a plain browser tab and vice-versa:

```
bpmn-js-clip----<JSON.stringify(copyTree)>
```

- `bpmn-js-clip----` — a fixed prefix (from upstream
  `bpmn-js-native-copy-paste`). Text without it is ignored on paste.
- `copyTree` — bpmn-js's copy tree: `{ [depth]: descriptor[] }`, each descriptor
  carrying a `businessObject` (and `di`) of moddle nodes tagged with `$type`.
  Paste revives it with `createReviver(moddle)` from
  `bpmn-js-native-copy-paste`.

A real payload for a Camunda-7 service task with `camunda:class` and a
`camunda:Properties` extension:

```
bpmn-js-clip----{"0":[{"businessObject":{"$type":"bpmn:ServiceTask","id":"ServiceTask_1","name":"Call","class":"com.acme.Handler","extensionElements":{"$type":"bpmn:ExtensionElements","values":[{"$type":"camunda:Properties","values":[{"$type":"camunda:Property","name":"foo","value":"bar"}]}]}},"id":"ServiceTask_1","name":"Call"}]}
```

### Versioning stance

The payload is **unversioned by design** — no marker, no schema field. It is
wire-compatible with `bpmn-js-native-copy-paste` 0.3.x, and adding a marker would
break webview↔browser paste (an explicit requirement). Paste is fail-soft: it
checks the prefix, `try/catch`es the parse, and revives with a reviver that drops
unknown `$type` nodes — unparseable text is logged and ignored, never thrown. A
future *breaking* change must use a **new prefix**, never a mutated payload under
the same one.

### Engine-mismatch policy: unsupported, fails soft

Pasting across engines (a Camunda-7 element into a Camunda-8 modeler or the
reverse) is not supported, but never corrupts or crashes. The reviver reconstructs
each node with the **target** moddle:

- The shared `bpmn:` base (tasks, events, gateways, flows) revives on both
  engines.
- An extension node whose `$type` the target moddle does not recognise
  (`camunda:*` in a C8 moddle, `zeebe:*` in a C7 moddle) is **silently dropped** —
  the reviver returns `undefined`, leaving a hole in the containing array (reads
  as `undefined`, re-serialises to `null`). No throw.

So a cross-engine paste lands the diagram shape and its execution-platform-specific
configuration is stripped. This is verified in `clipboardWireFormat.spec.ts`
(the executable statement of this policy).

## Browser caveats (documented, not solved)

The native path inherits the browser's clipboard-permission model:

- **Chrome** prompts for clipboard-read permission on the first paste.
- **Safari** restricts `navigator.clipboard.readText()` to transient user
  activation, so programmatic paste can be denied.
- **Firefox** prompt-gates `readText()`.
- Context-pad paste (mouse-only, no keyboard `paste` event) depends on
  `navigator.clipboard.readText()` rather than a `paste` DOM event, so it is
  subject to the same per-browser gating.

The bridged path sidesteps all of these by delegating to the host's clipboard.
