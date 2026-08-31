# @miragon/bpmn-modeler-diff

Host-agnostic, Node- and browser-safe data layer for BPMN diffing. Private
workspace lib; it is **inlined** into the publishable
`@miragon/bpmn-modeler` package under its `./diff` subpath and imported directly
by the extension engine (`@miragon/bpmn-modeler-core`) — layering forbids
`libs → packages`, so the computation lives here rather than in the package.

## API

```ts
import { computeDiff, sideView } from "@miragon/bpmn-modeler-diff";

const result = await computeDiff(beforeXml, afterXml);
// result: { added, removed, changed, layoutChanged, counts, navigationOrder }
// — every field is a plain array or number, so the whole value is JSON-serializable.

const before = sideView(result, "before"); // added blanked
const after = sideView(result, "after"); // removed blanked
```

`computeDiff` parses both documents with `bpmn-moddle`, compares them with
`bpmn-js-differ`, and sorts the id arrays by BPMN sequence-flow position (start
event → end event), anchoring removed elements next to a surviving neighbour.
The heavy `bpmn-moddle` parser loads through dynamic `import()`, so a consumer
that never diffs never pays for it. It touches no DOM — the Node-safety gate is mechanised
by the `node`-environment vitest suite and the package's `check-diff-node.mjs`
smoke test.

`computeDiff` **throws** on parse/diff failure; the extension host wraps it in
its own try/catch to log and drop.

The `DiffSide` / `DiffCounts` vocabulary types are defined here and re-exported
type-only from `@miragon/bpmn-modeler-types` so the private host protocol keeps
compiling without a runtime edge (no import cycle).

## Scripts

- `build` — `tsc --noEmit`; the tsconfig sets `lib: ["ESNext"]` (no DOM) as the
  compile-time Node-safety gate.
- `test` — `vitest run` in the `node` environment.
