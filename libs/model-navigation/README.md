# `@miragon/bpmn-model-navigation`

Adds a **Navigate to referenced model** action to the bpmn-js context pad
so the user can jump from a Call Activity to the referenced BPMN process,
or from a Business Rule Task to the referenced DMN decision.

## Why this lives in its own library

- **Two reference shapes per element type.** Camunda 7 stores the
  reference as an attribute on the BPMN element
  (`calledElement`, `camunda:decisionRef`); Camunda 8 wraps it in a
  `zeebe:calledElement` / `zeebe:calledDecision` extension element.
  Resolving them belongs in one helper, not scattered through the
  modeler.
- **Resolution is workspace-driven.** The actual file lookup
  (`workspace.findFiles`, opening via `vscode.open`) only makes sense on
  the extension host.  Keeping the click target in a small webview-side
  library lets the modeler stay agnostic of VS Code APIs — it just posts
  a `NavigateToReferencedModelCommand`.
- **Context-pad placement is opinionated.** The bpmn-js context pad
  wraps entries 3-per-row within each `data-group` div.  Putting the
  icon under the existing `connect` group avoids an orphan row; that
  choice is documented here so future readers don't move it back.

## Usage

```ts
import { NavigateToReferencedModelModule } from "@miragon/bpmn-model-navigation";

new BpmnModeler({ additionalModules: [NavigateToReferencedModelModule] });
```

The module expects a `vsCodeBridge` DI value with a `postMessage` method
so it never has to call `acquireVsCodeApi()` directly (which can only be
invoked once per webview).

## See also

- Issue [#973](https://github.com/Miragon/bpmn-modeler/issues/973) — original feature request.
- `apps/modeler-plugin/src/service/ModelNavigationService.ts` — the
  extension-host counterpart that resolves the id against the workspace.
