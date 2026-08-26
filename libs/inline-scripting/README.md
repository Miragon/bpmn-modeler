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
  deletion) and asks the host to overwrite or close the tab.
- **Model helpers** — `collectInlineScriptTasks` / `findListenerAt` read and
  address inline scripts consistently with the host-side rewrite fallback
  (`libs/modeler-core/src/scriptTask/service/ScriptXmlService.ts`).

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

Camunda-7 only — register the aggregate on the C7 modeler's `additionalModules`
(the C8 modeler leaves it unregistered):

```ts
import { createInlineScriptingModules } from "@miragon/bpmn-modeler-inline-scripting";

new BpmnModeler7({ additionalModules: [...createInlineScriptingModules(port)] });
```

`createInlineScriptingModules(port)` embeds the `InlineScriptingPort` as the
`inlineScriptingPort` DI value, so the cluster can only be registered together
with its host capability.

## Known coupling

`ScriptEditorButtons` hardcodes the `#js-properties-panel` DOM id (the app's
panel container) to observe where to inject its icons. That is an app-shell
assumption, not a bpmn-js one; extracting it into a config value is out of scope
for this relocation.
