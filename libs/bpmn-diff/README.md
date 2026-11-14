# `@miragon/bpmn-modeler-diff`

The data layer of the BPMN diff: which elements were added, removed, changed or moved between two
versions of a file. It runs in Node and in the browser. `@miragon/bpmn-modeler` inlines it as the
`./diff` subpath, and `@miragon/bpmn-modeler-core` imports it directly for the hosts' diff.

Internal workspace, not published on its own.

## Usage

```ts
import { computeDiff, sideView } from "@miragon/bpmn-modeler-diff";

const result = await computeDiff(beforeXml, afterXml);
const before = sideView(result, "before");
const after = sideView(result, "after");
```

The result holds only arrays and numbers, so it is JSON-serialisable. `computeDiff` throws on a parse
or diff failure; the caller reports it.

```ts
import { elementXml } from "@miragon/bpmn-modeler-diff";

const taskXml = await elementXml(afterXml, "Task_1", [beforeXml, afterXml]); // undefined for an unknown or diagram id
```

`elementXml` returns one element's XML for a text diff: no diagram interchange, no children that are
diff elements of their own (a child without an id stays), and a participant followed by its process. It is re-serialised, so it is
not the file's bytes. Each namespace takes one prefix from the declarations in the third argument
(default: the document itself); pass both versions on both calls so a prefix renamed between them is
no change. It loads no engine descriptor, so Camunda 7 and 8 extensions keep their XML as
written. Not exported from `@miragon/bpmn-modeler`.

```ts
import { elementSnapshots } from "@miragon/bpmn-modeler-diff";

const snapshots = await elementSnapshots(xml, { prefixSources: [base, current, incoming], isUnit });
const task = snapshots.get("Task_1"); // { type, parent, container, lanes, parts, plane, xml, content, references, layout }
```

`elementSnapshots` parses once and returns every element's snapshot in document order, with the same
text as `elementXml` for the default set of elements. `isUnit` chooses which elements stand on their
own, and only elements with an id can; the three-way merge (#2450) passes its own set.
`content` leaves out the derived references (`incoming`, `outgoing`, `flowNodeRef`,
`boundaryEventRefs`). `rejectWarnings: true` rejects any parse warning, such as an unresolved
reference; by default only skipped content rejects, as in `elementXml`.

## Rules

- Keep it free of the DOM: the tsconfig compiles with `lib: ["ESNext"]`, the tests run in the `node`
  environment, and `packages/bpmn-modeler/scripts/check-diff-node.mjs` imports the built subpath in Node.
- The parser (`loadBpmnModdle`), the `saxen` tokenizer that reads namespace declarations and both engine descriptors
  load through dynamic `import()`, so a consumer that never diffs never loads them.
- `DiffSide` and `DiffCounts` are defined here and re-exported type-only from
  `@miragon/bpmn-modeler-types`, which avoids an import cycle.

Why each version is parsed twice and how unknown attributes are compared is in the
[Diff ADR](../../docs/adr/diff.md#bpmn-diff).
