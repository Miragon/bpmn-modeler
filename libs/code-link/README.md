# `@miragon/bpmn-modeler-code-link`

The **Go to implementation** context-pad action: from a service, send or business-rule task to the
source file that implements it. The entry hides when the workspace has no such file. `@miragon/bpmn-modeler`
registers it when the host supplies `capabilities.codeLink`.

Internal workspace, not published on its own.

## How it works

- `extractImplementation` classifies the reference: `camunda:class`, `camunda:delegateExpression`,
  `camunda:expression` or `camunda:topic` on Camunda 7, the job type in `zeebe:taskDefinition` on
  Camunda 8. It ignores `camunda:decisionRef`, so the entry never conflicts with model navigation.
- `CodeLinkMapClient` sends the diagram's `(activityId, kind, reference)` list to the host through
  `CodeLinkPort.syncActivities` on `import.done` and, debounced and only when changed, on
  `commandStack.changed`. The host never parses BPMN XML.
- The host answers with a `key → resolved` map that goes to `applyStatus`. An unknown key shows the entry,
  a cached `false` hides it. The client never touches the model, so a status push cannot trigger another
  `commandStack.changed`.
- Both sides build the map key with `implementationStatusKey` from `@miragon/bpmn-modeler-types`.
- The entry sits in the `connect` group on purpose: the context pad wraps three entries per group, and a
  group of its own would start an orphan row.

## Usage

```ts
import { createCodeLinkModule } from "@miragon/bpmn-modeler-code-link";

new BpmnModeler({
    additionalModules: [
        createCodeLinkModule({
            navigateToImplementation: (reference, kind) => openSource(reference, kind),
            syncActivities: (entries) => resolveInHost(entries),
        }),
    ],
});
```

The module carries its `CodeLinkPort`, so it cannot be registered without a host. Without one, leave the
module out.
