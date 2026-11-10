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

## Rules

- Keep it free of the DOM: the tsconfig compiles with `lib: ["ESNext"]`, the tests run in the `node`
  environment, and `packages/bpmn-modeler/scripts/check-diff-node.mjs` imports the built subpath in Node.
- The parser and both engine descriptors load through dynamic `import()`, so a consumer that never diffs
  never loads them.
- `DiffSide` and `DiffCounts` are defined here and re-exported type-only from
  `@miragon/bpmn-modeler-types`, which avoids an import cycle.

Why each version is parsed twice and how unknown attributes are compared is in the
[Diff ADR](../../docs/adr/bpmn-modeler.md#diff).
