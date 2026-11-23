# `@miragon/bpmn-modeler-merge`

The three-way merge of a BPMN file: classify each element from Git's base, current and incoming
versions, decide what is left, and build one valid file. It runs in Node and in the browser.

Internal workspace, not published, not inlined into `@miragon/bpmn-modeler`.

## Usage

```ts
import {
    buildMerged,
    computeMerge,
    describeUnmetRequirement,
    hasNoShape,
    MergeDecisions,
    mergeNavigationOrder,
    mergePaneSteps,
    mergePaneView,
    prepareMergeSources,
} from "@miragon/bpmn-modeler-merge";

const versions = { base, current, incoming }; // base is optional
const decisions = MergeDecisions.from(await computeMerge(versions));

for (const conflict of decisions.openConflicts) {
    const outcome = decisions.pick(conflict.id, "incoming");
    if (!outcome.applied) {
        outcome.blockedBy.map(({ reason }) => describeUnmetRequirement(reason)); // or the view's own words
    }
}
decisions.unpick("Task_1"); // back to its automatic resolution or open, unless another pick needs it
decisions.originOf("Task_1"); // "automatic", "picked", "consequence", or undefined while open

// Keeping an element the other side removed: the flows and boundary events removed with it come back only on request.
const kept = decisions.pick("Task_Reject", "incoming"); // kept.connectionsLeftOut: ["Flow_No", …], kept.boundaryEventsLeftOut
decisions.pickWithRemoved("Task_Reject", "incoming"); // the element and those flows and boundary events, as one pick
decisions.unpickWithRemoved("Task_Reject"); // takes them back with it
decisions.pickWithContents("SubProcess_1", "current");
decisions.unpickWithContents("SubProcess_1"); // and everything inside picked on the same side
decisions.pickScoped("SubProcess_1", "current", "withContents"); // a view's reach: element, withContents, withRemoved
decisions.holds("Task_Reject", "current"); // false: a pick of current leaves it out

const sources = await prepareMergeSources(versions); // once per merge; keep it for every build
const { xml, notes } = await buildMerged(sources, decisions); // throws while conflicts are open

// What a merge view shows on each pane: its markers, the marked elements no canvas draws, its steps.
const { marks, shapeless } = mergePaneView(decisions, "current"); // takenFromThisSide, takenFromOtherSide, conflict
const { badges, consequences, pickable } = mergePaneView(decisions, "current"); // the user's picks
mergeElementNames(sources, decisions, ["Task_Reject"]); // { Task_Reject: "Reject order" }, alike on both panes
const order = mergeNavigationOrder(decisions.result, sources); // current's flow, incoming's own steps in it, then the rest
const { openConflicts, all } = mergePaneSteps(decisions, order, "current");
decisions.result.elements.filter(hasNoShape); // what a pane lists instead of drawing
```

An applied pick leaves the element on the picked side: an automatic element that clashes with it or
dangles on it reopens, and a pick that would change another pick, or leave an open conflict without a
choice that applies, is refused with its reasons.

`MergeResult` holds only ids, states, per-version facts and a fingerprint of each version's XML
(`versionKeys`), so it is JSON-serialisable. `computeMerge` refuses, naming the version: sides for
different engines, a version that parses with any warning, also under the merge's engine descriptor,
and a root element or lane without an id. `prepareMergeSources` refuses the same versions, and
`buildMerged` refuses sources of other versions than the result's, naming them, and a result
that fails its checks instead of repairing it.

## Rules

- Put a file in its stage (`kernel`, `classify`, `decide`, `sources`, `build`, `project`), the rule
  in `domain/` and what awaits a parse or a write in `service/`. A stage imports only `kernel/` and
  the stages before it, `build` and `project` not each other; `architecture.spec.ts` checks it. The
  core's `domain/` imports `@miragon/bpmn-modeler-merge/domain`, which re-exports only `domain/`
  modules.
- Keep it free of the DOM: the tsconfig compiles with `lib: ["ES2021"]` and the tests run in the
  `node` environment.
- Parse only through `@miragon/bpmn-modeler-diff`, which loads the parser and the engine descriptors
  lazily; a `domain/` file imports `@miragon/bpmn-modeler-diff/domain`. Import the engine rule from `@miragon/bpmn-modeler-types/engine` and the waypoint walk from
  `@miragon/bpmn-modeler-types/polyline`, never the barrel, whose modules are DOM-typed.
- `mergeDecisions.ts` and its helpers import no parser: `mergeDecisionsPurity.spec.ts` mocks the parser
  and loads them.
- Fixtures are generated in `src/__fixtures__/` from a plain model and must equal a moddle round trip
  with the descriptor of the engine the modeler detects (`executionEngineOf`).

Why the merge decides on its own set of elements and what a state compares is in the
[Merge ADR](../../docs/adr/merge.md), what the build writes and checks in the
[Merge build ADR](../../docs/adr/merge-build.md).
