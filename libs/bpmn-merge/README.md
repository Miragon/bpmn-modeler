# `@miragon/bpmn-modeler-merge`

The three-way merge of a BPMN file: classify each element from Git's base, current and incoming
versions. Deciding what is left (#2451) and building one valid file (#2452) follow. It runs in Node
and in the browser.

Internal workspace, not published, not inlined into `@miragon/bpmn-modeler`.

## Usage

```ts
import { computeMerge, isConflictState } from "@miragon/bpmn-modeler-merge";

const result = await computeMerge({ base, current, incoming }); // base is optional
const conflicts = result.elements.filter((element) => isConflictState(element.state));
```

`MergeResult` holds only ids, states and per-version facts, so it is JSON-serialisable.
`computeMerge` refuses a version that parses with any warning, naming it.

## Rules

- Keep it free of the DOM: the tsconfig compiles with `lib: ["ESNext"]` and the tests run in the
  `node` environment.
- Parse only through `@miragon/bpmn-modeler-diff`, which loads the parser and the engine descriptors
  lazily. Import the engine rule from `@miragon/bpmn-modeler-types/engine`, never the barrel, whose
  modules are DOM-typed.
- Fixtures are generated in `src/__fixtures__/` from a plain model and must equal a moddle round trip
  with the descriptor of the engine the modeler detects (`executionEngineOf`).

Why the merge decides on its own set of elements and what a state compares is in the
[Merge ADR](../../docs/adr/merge.md).
