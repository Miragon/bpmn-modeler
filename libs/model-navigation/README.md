# `@miragon/bpmn-model-navigation`

Adds a **Navigate to referenced model** action to the bpmn-js context pad
so the user can jump from a Call Activity to the referenced BPMN process,
from a Business Rule Task to the referenced DMN decision, or from a Camunda 8
User Task to a workspace `.form` file whose top-level `id` matches its `formId`.

## Why this lives in its own library

- **Two reference shapes per element type.** Camunda 7 stores the
  reference as an attribute on the BPMN element
  (`calledElement`, `camunda:decisionRef`); Camunda 8 wraps it in a
  `zeebe:calledElement` / `zeebe:calledDecision` extension element.
  Camunda 8 linked forms use `zeebe:formDefinition formId`.
  Resolving them belongs in one helper, not scattered through the
  modeler.
- **Resolution is workspace-driven.** The actual file lookup
  (`workspace.findFiles`, opening via `vscode.open`) only makes sense on
  the extension host.  Keeping the click target in a small webview-side
  library lets the modeler stay agnostic of VS Code APIs — it just calls
  the injected `ModelNavigationPort`.
- **Form actions are pessimistic.** The host sends the set of resolvable form
  IDs after scanning the workspace and keeps it current with ref-counted file
  watchers. A User Task never shows a link action until its form is known to
  exist, so the context pad cannot expose a broken navigation target.
- **Context-pad placement is opinionated.** The bpmn-js context pad
  wraps entries 3-per-row within each `data-group` div.  Putting the
  icon under the existing `connect` group avoids an orphan row; that
  choice is documented here so future readers don't move it back.

## Usage

```ts
import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";

new BpmnModeler({
    additionalModules: [
        createModelNavigationModule({
            openReference: ({ id, kind }) => {
                /* resolve id/kind to a file and open it */
            },
        }),
    ],
});
```

`createModelNavigationModule(port)` embeds the `ModelNavigationPort` as the
`modelNavigationPort` DI value, so the module can only be registered together
with its host capability. A consumer that has no host omits the module entirely
and the context-pad entry never appears.
