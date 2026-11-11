# `@miragon/bpmn-modeler-layout`

**Format Diagram** and **Clean Up Diagram** for bpmn-js. Format lays a diagram out left to right and
reroutes its connections, changing only the diagram interchange (DI). Cleanup reports orphan DI,
dangling flows and invisible leftovers, then removes them after the user confirms. `@miragon/bpmn-modeler`
inlines it.

Internal workspace, not published on its own.

## How it works

- The layout comes from `bpmn-auto-layout` behind the `LayoutEngine` port, which returns shape bounds and
  waypoints, never XML. The engine rebuilds DI from scratch; reading only its geometry keeps the DI of
  everything it omits.
- Every `modeling.*` call runs in the `preExecute` of one `layout.apply` command, so one undo reverts the
  whole format.
- The preflight check (`preflight.ts`) decides what may be formatted, independently of the engine.
- Zero overlap and minimal crossings are not promised: the library does not assert bounds on the
  engine's output.

The full decision, outcome codes included, is in the
[Formatting and cleanup ADR](../../docs/adr/bpmn-modeler.md#formatting-and-cleanup).

## Layers

| Layer | Files | May import |
|---|---|---|
| Pure | `types`, `port`, `preflight`, `plan`, `cleanup/rules` | nothing |
| Engine | `engine/` | `bpmn-auto-layout`, `bpmn-moddle` |
| Applier | `apply/` | bpmn-js |

## Usage

```ts
import { createBpmnLayoutModule } from "@miragon/bpmn-modeler-layout";

const modeler = new BpmnModeler({ additionalModules: [createBpmnLayoutModule()] });

const outcome = await modeler.get("bpmnLayouter").format();
const report = modeler.get("bpmnCleanup").inspect();
```

`createBpmnLayoutModule(engine)` takes another `LayoutEngine`. `createBpmnLayoutServiceModule` and
`createBpmnLayoutUiModule` split the services from the palette and keyboard entries for hosts with their
own controls.
