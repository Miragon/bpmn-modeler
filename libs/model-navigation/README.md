# `@miragon/bpmn-model-navigation`

The **Navigate to referenced model** context-pad action: from a call activity to its BPMN process, from a
business-rule task to its DMN decision, from a Camunda 8 user task to the `.form` file whose `id` matches
its `formId`. It also shows the linked form preview. `@miragon/bpmn-modeler` registers it when the host
supplies `capabilities.modelNavigation`, on the modeler, `/design` and `/viewer`.

Internal workspace, not published on its own.

## How it works

- `extractReference` reads both shapes: `calledElement` and `camunda:decisionRef` on Camunda 7,
  `zeebe:calledElement`, `zeebe:calledDecision` and `zeebe:formDefinition formId` on Camunda 8.
- Finding and opening the file is the host's job; the library only calls `openReference` on the
  `ModelNavigationPort`.
- Form links are pessimistic where the host knows its forms: with `isReferenceAvailable` and
  `onReferenceAvailabilityChanged`, a user task shows no link until its form is known to exist. Without
  these hooks every valid reference counts as available.
- `formPreview` on the port opens the anchored form preview; `isAutomaticEnabled` and
  `onAutomaticChanged` control automatic previews. See the
  [Linked form previews ADR](../../docs/adr/bpmn-modeler.md#linked-form-previews).
- The entry sits in the `connect` group on purpose: the context pad wraps three entries per group, and a
  group of its own would start an orphan row.

## Usage

```ts
import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";

new BpmnModeler({
    additionalModules: [
        createModelNavigationModule({
            openReference: ({ id, kind }) => openModel(id, kind),
        }),
    ],
});
```

The module carries its port, so it cannot be registered without a host. Subscriptions return an
unsubscribe function, which the modeler calls when the diagram is destroyed.
