# `@miragon/bpmn-modeler-code-link`

Adds a **Go to implementation** action to the bpmn-js context pad so the user
can jump from a service / send / business-rule task to the workspace source
file that implements it. The entry **hides automatically** when the task's
implementation does not exist in the workspace.

## The always-on activity→code map

`CodeLinkMapClient` (a bpmn-js DI service registered by `CodeLinkModule`) keeps
the host's activity→code map in sync with the live diagram so the context-pad
entry's visibility is correct without the user clicking:

- On `import.done` and after edits (`commandStack.changed`, debounced and
  skip-if-unchanged) it ships the diagram's `(activityId, kind, reference)` list
  to the host via `SyncActivitiesCommand`. **The host never parses the BPMN
  XML** — bpmn-js already parsed it, so the webview reads the model and sends
  cheap strings.
- The host resolves only the delta and pushes back a
  `key → resolved` lookup (`ImplementationStatusQuery`), which the modeler hands
  to `applyStatus`. The provider then asks `isResolved(element)` per element:
  unknown ⇒ shown optimistically (flash-free), cached `false` ⇒ hidden.

The client never mutates bpmn-js model state (forcing a context-pad re-render
does not run the command stack), so a status push cannot loop back into a
`commandStack.changed` event.

## Why this lives in its own library

- **Many reference shapes per binding.** Camunda 7 stores the implementation as
  attributes on the BPMN element (`camunda:class`,
  `camunda:delegateExpression`, `camunda:expression`, or external
  `camunda:topic`); Camunda 8 wraps a job type in a `zeebe:taskDefinition`
  extension element. Classifying them belongs in one helper
  (`extractImplementation`), not scattered through the modeler.
- **Resolution is workspace-driven and host-side.** Mapping a reference to a
  source file (`workspace.findFiles`, content search, `vscode.open`) only makes
  sense on the extension host. Keeping the click target in a small webview-side
  library lets the modeler stay agnostic of VS Code APIs — it just posts a
  `NavigateToImplementationCommand` carrying the reference string and its kind.
  Workspace paths never leave the host.
- **Context-pad placement is opinionated.** The bpmn-js context pad wraps
  entries 3-per-row within each `data-group` div. The icon sits under the
  existing `connect` group to avoid an orphan row; that choice is documented
  here so future readers don't move it back. A business-rule task may show both
  this entry and the model-navigation entry — they never conflict because
  `extractImplementation` ignores `camunda:decisionRef`.

## Usage

```ts
import { CodeLinkModule } from "@miragon/bpmn-modeler-code-link";

new BpmnModeler({ additionalModules: [CodeLinkModule] });
```

The module expects a `vsCodeBridge` DI value with a `postMessage` method so it
never has to call `acquireVsCodeApi()` directly (which can only be invoked once
per webview).
