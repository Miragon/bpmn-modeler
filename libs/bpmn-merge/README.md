# `@miragon/bpmn-modeler-merge`

The three-way merge of a BPMN file: classify each element from Git's base, current and incoming
versions and decide what is left. Building one valid file (#2452) follows. It runs in Node and in
the browser.

Internal workspace, not published, not inlined into `@miragon/bpmn-modeler`.

## Usage

```ts
import {
    computeMerge,
    describeUnmetRequirement,
    MergeDecisions,
} from "@miragon/bpmn-modeler-merge";

const decisions = MergeDecisions.from(await computeMerge({ base, current, incoming })); // base is optional

for (const conflict of decisions.openConflicts) {
    const outcome = decisions.pick(conflict.id, "incoming");
    if (!outcome.applied) {
        outcome.blockedBy.map(({ reason }) => describeUnmetRequirement(reason)); // or the view's own words
    }
}
decisions.unpick("Task_1"); // back to its automatic resolution or open, unless another pick needs it
const resolution = decisions.resolution(); // throws while conflicts are open
```

`MergeResult` holds only ids, states, per-version facts and a fingerprint of each version's XML
(`versionKeys`), so it is JSON-serialisable. `computeMerge` refuses, naming the version: sides for
different engines, a version that parses with any warning, also under the merge's engine descriptor,
and a root element or lane without an id.

## Rules

- Keep it free of the DOM: the tsconfig compiles with `lib: ["ESNext"]` and the tests run in the
  `node` environment.
- Parse only through `@miragon/bpmn-modeler-diff`, which loads the parser and the engine descriptors
  lazily. Import the engine rule from `@miragon/bpmn-modeler-types/engine`, never the barrel, whose
  modules are DOM-typed.
- `mergeDecisions.ts` and its helpers import no parser: `mergeDecisionsPurity.spec.ts` mocks the parser
  and loads them.
- Fixtures are generated in `src/__fixtures__/` from a plain model and must equal a moddle round trip
  with the descriptor of the engine the modeler detects (`executionEngineOf`).

Why the merge decides on its own set of elements, what a state compares and which references a
pick must keep is in the [Merge ADR](../../docs/adr/merge.md).
