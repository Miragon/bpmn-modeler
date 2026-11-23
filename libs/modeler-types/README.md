# `@miragon/bpmn-modeler-types`

The publishable half of the shared code: model types (engine, lint, settings, scripting, implementation,
diff, the diff legend's state), the flushable input debounce and pure rules that browser code and
`@miragon/bpmn-modeler-core` both apply (`scriptSurface.ts`, `workspaceDefinitions.ts`, `xmlMarkup.ts`,
`processVariables.ts`, `canvasSize.ts`) or that two browser workspaces apply (`polyline.ts`). Nearly every
workspace imports it; both npm packages inline it.

It compiles without the DOM (`tsconfig.lib.json` and `tsconfig.spec.json` set `lib: ["ES2021"]`), which
makes it a pure module the core's `domain/` may import
([domain imports](../../docs/adr/role-folders.md#domain-imports)). The DOM widgets and helpers live in
[`@miragon/bpmn-modeler-browser`](../modeler-browser/README.md).

Internal workspace, not published on its own.

## The boundary

Everything here may ship in the npm packages. The webview ↔ host protocol (`Query`, `Command`, `HostApi`,
document flush) stays private in [`@miragon/bpmn-modeler-shared`](../shared/README.md).

- This package, `modeler-browser`, the bpmn-js modules (`append-menu`, `bpmn-clipboard`, `code-link`, `definition-search`,
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
import { type Engine, isUsableViewbox } from "@miragon/bpmn-modeler-types";
```

### The `/engine` entry point

```ts
import {
    detectEngineWithNamespaceFallback,
    ENGINE_NAMESPACE,
} from "@miragon/bpmn-modeler-types/engine";
```

`@miragon/bpmn-modeler-types/engine` (a path in `tsconfig.base.json`) is `src/engine.ts` alone: the
engine vocabulary and its detection. It was added while the barrel still exported DOM helpers, which a
workspace compiled without the DOM lib, such as the merge (#2450), could not type-check; they left for
`@miragon/bpmn-modeler-browser` (#2776), and the entry still loads one file instead of the barrel and its
runtime imports. `domFreeEntries.spec.ts` therefore reads every `@miragon/bpmn-modeler-types/<entry>`
path in `tsconfig.base.json` and fails on any runtime import in its file; `import type` is erased and
stays allowed. A new entry point is checked once its path is there.

### The `/mergeVocabulary` entry point

`@miragon/bpmn-modeler-types/mergeVocabulary` is `src/mergeVocabulary.ts` alone, for the same reason:
the merge view's sides, markers, marker classes and caption roles, which `libs/bpmn-merge` reads without
the DOM lib. `.github/release-lines.json`
routes it like the rest of the library, to every line that ships it (`docs/adr/merge.md`).

### The `/mergeBuildNotes` entry point

`@miragon/bpmn-modeler-types/mergeBuildNotes` is `src/mergeBuildNotes.ts` alone: the notes a merge
build returns, which `libs/bpmn-merge` builds and the merge view's protocol carries as they are. It
holds types only. `MergeBuildNoteContent` is what a note says; `MergeBuildNote` adds the elements it
names (`named`). A repair named for shifting or growing carries its lists as `MergeNonEmptyIds`.

`@miragon/bpmn-modeler-types/mergeBuildNoteReaders` is `src/mergeBuildNoteReaders.ts` alone: the
functions over those notes. `elementsNamedBy` gives `named`: the merge sets it with it, and the
webview's text spec checks that a note's text names no other element. `elementsRedrawnBy` gives the
subset of `named` whose drawing a layout repair changed; only the build's specs read it. One table per
kind and, for a repaired kind, per repair answers both, and `noteVariantEntry` is the one lookup into
such a table, which the webview's wording table uses too. `shapesShiftedBy` and `framesGrownBy` give
the shapes a repair shifted and the frames it grew, none for a repair that did neither. `isNonEmpty` is
the one check a producer narrows a list with before it picks a repair named for shifting or growing.

### The `/conflictMarkers` entry point

`@miragon/bpmn-modeler-types/conflictMarkers` is `src/conflictMarkers.ts` alone: Git's conflict-marker
grammar, which the core reads files with and `libs/bpmn-merge` checks a hand-merged text with, so both
read markers alike.

### The `/polyline` entry point

`@miragon/bpmn-modeler-types/polyline` is `src/polyline.ts` alone: a flow's segments, its midpoint and
its longest segment, so a DOM-free workspace such as `libs/bpmn-merge` walks waypoints with the same
arithmetic as the label follow and the merge view instead of keeping its own copy.
