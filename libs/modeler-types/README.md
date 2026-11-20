# `@miragon/bpmn-modeler-types`

The publishable half of the shared code: model types (engine, lint, settings, scripting, implementation,
diff), browser utilities (canvas resize, the text-editing predicate, the flushable input debounce) and
pure rules that browser code and `@miragon/bpmn-modeler-core` both apply (`scriptSurface.ts`,
`workspaceDefinitions.ts`, `xmlMarkup.ts`, `processVariables.ts`) or that two browser workspaces apply
(`polyline.ts`). Nearly every workspace imports it; both npm packages inline it.

Internal workspace, not published on its own.

## The boundary

Everything here may ship in the npm packages. The webview ↔ host protocol (`Query`, `Command`, `HostApi`,
document flush) stays private in [`@miragon/bpmn-modeler-shared`](../shared/README.md).

- This package, the bpmn-js modules (`append-menu`, `bpmn-clipboard`, `code-link`, `definition-search`,
  `element-template-builder`, `element-template-chooser`, `flow-navigation`, `inline-scripting`,
  `model-navigation`, `properties-panel`) and both npm packages must never import
  `@miragon/bpmn-modeler-shared`. The ESLint rule `BND-PROTOCOL-PRIVATE` in `eslint.config.cjs` fails
  otherwise, and each npm package's `architecture.spec.ts` forbids naming the protocol.
- The webview apps are left out on purpose: they are the adapters that speak the protocol.
- A declaration here that a public type references ships in the published `.d.ts`, even unnamed. The
  `check-dts` scripts catch protocol symbols and private imports there, and `publicApi.spec.ts` pins the
  listed public names, but neither notices a changed declaration that still compiles. Treat such edits as
  public API changes.

## Usage

```ts
import { type Engine, isTextEditingSurface, observeCanvasSize } from "@miragon/bpmn-modeler-types";
```

### The `/engine` entry point

```ts
import {
    detectEngineWithNamespaceFallback,
    ENGINE_NAMESPACE,
} from "@miragon/bpmn-modeler-types/engine";
```

`@miragon/bpmn-modeler-types/engine` (a path in `tsconfig.base.json`) is `src/engine.ts` alone: the
engine vocabulary and its detection. It exists because the barrel also exports DOM helpers (`dom.ts`,
`canvasResize.ts`, …), which a workspace compiled without the DOM lib, such as the merge (#2450), cannot
type-check. `domFreeEntries.spec.ts` therefore reads every `@miragon/bpmn-modeler-types/<entry>`
path in `tsconfig.base.json` and fails on any runtime import in its file; `import type` is erased and
stays allowed. A new entry point is checked once its path is there.

### The `/mergeVocabulary` entry point

`@miragon/bpmn-modeler-types/mergeVocabulary` is `src/mergeVocabulary.ts` alone, for the same reason:
the merge view's sides, markers, marker classes and caption roles, which `libs/bpmn-merge` reads without
the DOM lib. `.github/release-lines.json`
routes it like the rest of the library, to every line that ships it (`docs/adr/merge.md`).

### The `/mergeBuildNotes` entry point

`@miragon/bpmn-modeler-types/mergeBuildNotes` is `src/mergeBuildNotes.ts` alone: the notes a merge
build returns, which `libs/bpmn-merge` builds and the merge view's protocol carries as they are.
`MergeBuildNoteContent` is what a note says; `MergeBuildNote` adds the elements it names (`named`),
which `elementsNamedBy` gives: the merge sets `named` with it, and the webview's text spec checks that
a note's text names no other element.

### The `/conflictMarkers` entry point

`@miragon/bpmn-modeler-types/conflictMarkers` is `src/conflictMarkers.ts` alone: Git's conflict-marker
grammar, which the core reads files with and `libs/bpmn-merge` checks a hand-merged text with, so both
read markers alike.

### The `/polyline` entry point

`@miragon/bpmn-modeler-types/polyline` is `src/polyline.ts` alone: a flow's segments, its midpoint and
its longest segment, so a DOM-free workspace such as `libs/bpmn-merge` walks waypoints with the same
arithmetic as the label follow and the merge view instead of keeping its own copy.
