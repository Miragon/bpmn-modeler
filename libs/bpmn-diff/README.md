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
diff elements of their own, and a participant followed by its process. It is re-serialised, so it is
not the file's bytes. Each namespace takes one prefix from the declarations in the third argument
(default: the document itself); pass both versions on both calls so a prefix renamed between them is
no change. It loads no engine descriptor, so Camunda 7 and 8 extensions keep their XML as
written. Not exported from `@miragon/bpmn-modeler`.

## Rules

- Keep it free of the DOM: the tsconfig compiles with `lib: ["ESNext"]`, the tests run in the `node`
  environment, and `packages/bpmn-modeler/scripts/check-diff-node.mjs` imports the built subpath in Node.
- The parser (`loadBpmnModdle`), the `saxen` tokenizer that reads namespace declarations and both engine descriptors
  load through dynamic `import()`, so a consumer that never diffs never loads them.
- `DiffSide` and `DiffCounts` are defined here and re-exported type-only from
  `@miragon/bpmn-modeler-types`, which avoids an import cycle.

Why each version is parsed twice and how unknown attributes are compared is in the
[Diff ADR](../../docs/adr/diff.md#bpmn-diff).
