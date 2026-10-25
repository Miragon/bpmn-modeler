# `@miragon/bpmn-modeler-inline-scripting`

Lets the user edit a Camunda 7 script task's (or script-typed listener's) inline
script in a real host editor tab instead of the cramped properties-panel
textarea. It adds the entry points that open such a tab, arbitrates a
single writer per script surface, and keeps the panel field in sync while a tab
owns it.

## What's inside

- **Open entry points** — a context-pad edit icon on script tasks
  (`ScriptTaskContextPadModule`), a Script-group header icon plus a per-listener
  icon on the properties panel (`ScriptEditorButtonsModule`), and the `o`
  keyboard shortcut (`ScriptEditorKeyboardModule`). All four fire one event.
- **Single-writer lock** — `OpenScriptEditorsStore` tracks which surfaces a host
  tab currently owns; `ScriptLockPropertiesProviderModule` renders those panel
  fields read-only with a badge and a "click to focus the tab" hint.
- **Divergence watch** — `ScriptSourceWatcher` detects when an open script's
  model content changed underneath its tab (canvas undo/redo, reload, element
  deletion) and asks the host to overwrite or close the tab. A tab the host
  reports open for a surface the imported diagram no longer has (the task
  changed type while the webview was hidden) is closed the same way; before
  the first successful import no surface counts as gone.
- **Model helpers** — `collectInlineScriptTasks` / `findListenerAt` /
  `resolveScriptWriteTarget` read and address inline scripts. The host-side
  rewrite fallback mirrors the write addressing in
  `libs/modeler-core/src/scriptTask/domain/scriptBodyTarget.ts`; keep the two
  in step.

## Event contract

The modules never import host code; they communicate over the bpmn-js event bus.

| Event | Direction | Meaning |
| --- | --- | --- |
| `scriptEditor.open` | out | A surface requested its editor tab be opened. |
| `scriptEditor.sourceChanged` | out | An open script's model content diverged. |
| `openScriptEditors.changed` | internal | The open-editors set changed (lock refresh). |

`InlineScriptingPortForwarder` (registered by `createInlineScriptingModules`)
subscribes to the first two and calls the `InlineScriptingPort` the consumer
supplies. The library never imports the host protocol; in the VS Code webview
the port's implementation posts the corresponding protocol commands.

## Usage

Camunda-7 only. Consumers enable it through `@miragon/bpmn-modeler` by passing
the port as `capabilities.scripting`; C8 modelers ignore it:

```ts
import { createModeler } from "@miragon/bpmn-modeler";

const modeler = await createModeler(container, {
    engine: "c7",
    propertiesPanel: { parent: panelElement },
    capabilities: { scripting: port },
});
```

`packages/bpmn-modeler/src/capabilityModules.ts` then spreads
`createInlineScriptingModules(port)` into the modeler's modules; the factory is
package-internal wiring, not a consumer entry point.

`createInlineScriptingModules(port)` embeds the `InlineScriptingPort` as the
`inlineScriptingPort` DI value, so the cluster can only be registered together
with its host capability.

## Known coupling

`ScriptEditorButtons` observes the panel element given as the optional
`propertiesPanelRoot` DI value, which `@miragon/bpmn-modeler` registers per
instance so two modelers on one page each watch their own panel. Without it, the
buttons fall back to the `#js-properties-panel` DOM id — an app-shell
assumption, not a bpmn-js one.
