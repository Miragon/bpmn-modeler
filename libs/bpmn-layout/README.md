# `@miragon/bpmn-modeler-layout`

Formats and cleans up a BPMN diagram — the modeler's equivalent of *Reformat
Code*. **Format** rearranges the diagram left to right and reroutes its
connections, touching only diagram interchange. **Cleanup** removes orphan DI,
dangling flows and invisible leftovers, after reporting what it found.

## Why this exists

The modeler had no layout automation at all: the only geometry it ever wrote
was align-to-origin, which translates the whole graph and nothing else. An
imported, generated or long-grown diagram had to be tidied by hand.

The layout itself comes from [`bpmn-auto-layout`](https://github.com/bpmn-io/bpmn-auto-layout).
What this library adds is everything around it:

- **A geometry-only port.** `LayoutEngine` returns absolute shape bounds and
  waypoints, never XML. That is not just swappability — it is what contains the
  engine's destructiveness. The engine clears `definitions.diagrams` and
  rebuilds DI from scratch; because we *read* geometry instead of writing its
  XML back, everything it omits or mislays keeps the DI it already has.
- **A single undo step.** The applier runs every `modeling.*` call from the
  `preExecute` of one `layout.apply` command. diagram-js's `CommandStack`
  hands nested commands the outer action's id, so one Ctrl+Z reverts the whole
  format.
- **Our own refusal taxonomy.** The pre-flight check decides what may be
  formatted independently of the engine, so it keeps holding when the engine
  starts accepting cases we refuse today.

## Usage

```ts
import { createBpmnLayoutModule } from "@miragon/bpmn-modeler-layout";

new BpmnModeler({ additionalModules: [createBpmnLayoutModule()] });
```

Then, from the modeler:

```ts
const outcome = await modeler.get("bpmnLayouter").format();
const report = await modeler.get("bpmnCleanup").inspect();
```

Pass your own `LayoutEngine` to `createBpmnLayoutModule(engine)` to replace the
layout implementation — the applier, the commands and the hosts are unaffected.

## Layout quality

Left-to-right layering and orthogonal routing come from the engine. Zero node
overlap and minimal edge crossings are *not* contractual here: crossings cannot
be driven to zero on a non-planar process graph, and this library does not
assert bounds on the engine's output.

## Structure

| Layer | Files | Imports |
|---|---|---|
| Pure | `types`, `port`, `preflight`, `plan`, `cleanup/rules` | nothing |
| Engine | `engine/` | `bpmn-auto-layout`, `bpmn-moddle` |
| Applier | `apply/` | bpmn-js |
