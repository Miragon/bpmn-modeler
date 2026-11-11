# `@miragon/dmn-modeler-diff`

The data layer of the DMN diff: which DRD elements were added, removed, changed or moved between
two versions of a file, and for each decision table both versions contain, which columns, rules and
cells changed. It runs in Node and in the browser. `@miragon/bpmn-modeler-core` imports it for the
VS Code diff panes.

Internal workspace, not published.

## Usage

```ts
import { computeDmnDiff, dmnSideView } from "@miragon/dmn-modeler-diff";

const result = await computeDmnDiff(beforeXml, afterXml);
const before = dmnSideView(result, "before");
const after = dmnSideView(result, "after");
```

The result holds only arrays, records and numbers, so it is JSON-serialisable. `computeDmnDiff`
throws on a parse failure and on content the parser would skip; the caller reports it.

## Rules

- Keep it free of the DOM: the tsconfig compiles with `lib: ["ESNext"]` and the tests run in the
  `node` environment.
- The parser and the Camunda descriptor load through dynamic `import()`.
- `DiffSide` and `DiffCounts` come from `@miragon/bpmn-modeler-diff`, type-only, so both diffs share
  one vocabulary.

Why it compares by id instead of using `bpmn-js-differ`, and how cells are matched to columns, is in
the [DMN modeler ADR](../../docs/adr/dmn-modeler.md#diff).
