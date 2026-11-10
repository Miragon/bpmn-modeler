# `@miragon/bpmn-modeler-inline-scripting`

Edits the inline script of a Camunda 7 script task or script listener in a host editor tab instead of
the properties-panel textarea. It adds the entry points, keeps one writer per script and keeps the panel
in sync while a tab owns the script. `@miragon/bpmn-modeler` registers it on Camunda 7 when the host
supplies `capabilities.scripting`; Camunda 8 ignores the port.

Internal workspace, not published on its own.

## How it works

- **Entry points.** A context-pad icon on script tasks (`ScriptTaskContextPadModule`), icons on the
  Script group and each listener (`ScriptEditorButtonsModule`) and the `o` shortcut
  (`ScriptEditorKeyboardModule`) all fire the same event.
- **One writer.** `OpenScriptEditorsStore` tracks which scripts a host tab owns;
  `ScriptLockPropertiesProviderModule` shows those panel fields read-only with a badge.
- **Divergence.** `ScriptSourceWatcher` notices when an open script changes under its tab (undo, reload,
  deletion) or its element disappeared while the webview was hidden, and asks the host to overwrite or
  close the tab. Before the first import no script counts as gone.
- **Addressing.** Which element and property a `(kind, listenerIndex)` pair means comes from the one
  table in `libs/modeler-types/src/scriptSurface.ts`, which the core's XML fallback uses too.
- `ScriptEditorButtons` watches the panel given as the `propertiesPanelRoot` DI value, which
  `@miragon/bpmn-modeler` registers per instance. Without it, it falls back to the `#js-properties-panel`
  DOM id.

## Events

The modules never import host code; they talk over the bpmn-js event bus.

| Event | Direction | Meaning |
| --- | --- | --- |
| `scriptEditor.open` | out | Open the editor tab for a script. |
| `scriptEditor.sourceChanged` | out | An open script changed in the model. |
| `openScriptEditors.changed` | internal | The set of open tabs changed; the lock refreshes. |

`InlineScriptingPortForwarder` turns the two outgoing events into calls on the host's
`InlineScriptingPort`.

## Usage

Hosts enable it through the npm package:

```ts
import { createModeler } from "@miragon/bpmn-modeler";

const modeler = await createModeler(container, {
    engine: "c7",
    propertiesPanel: { parent: panelElement },
    capabilities: { scripting: port },
});
```

`packages/bpmn-modeler/src/capabilityModules.ts` then adds `createInlineScriptingModules(port)`. The
factory carries the port, so the modules cannot be registered without a host.
