# `@miragon/bpmn-modeler-types`

The publishable half of the shared code: model types (engine, lint, settings, scripting, implementation,
diff, the diff legend's state), the flushable input debounce and pure rules that browser code and
`@miragon/bpmn-modeler-core` both apply (script-surface addressing, workspace definitions, the XML comment
and CDATA scan, process variables, canvas size) or that two browser workspaces apply (the polyline walk).
Nearly every workspace imports it; both npm packages inline it.

It compiles without the DOM (`tsconfig.lib.json` and `tsconfig.spec.json` set `lib: ["ES2021"]`). The DOM
widgets and helpers live in [`@miragon/bpmn-modeler-browser`](../modeler-browser/README.md).

Internal workspace, not published on its own.

## Layout

A `hexagonal` workspace without `port/` or `adapter/`: each file sits in a folder by concept with `domain/`
inside, and `src/architecture.spec.ts` checks which folder imports which
([role folders](../../docs/adr/role-folders.md#domain-imports)).

| Folder        | Holds                                                                                                             | Imports               |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------- |
| `engine/`     | the engines, their detection and namespaces, the execution-platform attributes, the engine versions               | no folder             |
| `documents/`  | a blank document, the empty DMN diagram, the XML comment and CDATA scan                                           | no folder             |
| `geometry/`   | the polyline walk, canvas size, the format and cleanup results                                                    | no folder             |
| `lint/`       | lint reports and the bpmnlint config                                                                              | no folder             |
| `merge/`      | the merge vocabulary, the build notes and their readers, Git's conflict markers                                   | no folder             |
| `scripting/`  | script identity, the script surface, process variables                                                            | no folder             |
| `lifecycle/`  | `service/` only: the async debounce, the flushable input debounce, the disposable store                           | no folder             |
| `surface/`    | settings, surface and theme modes, the mode-change event, `Translate`, the modeler errors, the plugin load report | `engine/`             |
| `diff/`       | the diff origin and viewport, vocabulary, legend and stepper                                                      | `surface/`            |
| `elements/`   | element templates, element id conventions, element type names                                                     | `engine/`, `surface/` |
| `references/` | reference kinds, implementation references, form previews, workspace definitions                                  | `documents/`          |

## Entries

```ts
import { type Engine, isUsableViewbox } from "@miragon/bpmn-modeler-types";
import { detectEngineWithNamespaceFallback } from "@miragon/bpmn-modeler-types/domain";
```

The root entry exports everything. `lifecycle/` waits on timers and holds disposers, so it is `service/`
and the root entry is not a [pure module](../../docs/adr/role-folders.md#domain-imports).
`@miragon/bpmn-modeler-types/domain` (`src/domain.ts`, a path in `tsconfig.base.json` and the `exports`
map) re-exports every `domain/` module: a `domain/` file in any workspace, and `libs/bpmn-merge`, whose
own domain entry must stay pure, import it instead of the root.

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

## Merge vocabulary and build notes

`merge/domain/mergeVocabulary.ts` holds the merge view's sides, markers, marker classes and caption roles.
`.github/release-lines.json` routes it like the rest of the library, to every line that ships it
(`docs/adr/merge.md`).

`merge/domain/mergeBuildNotes.ts` holds the notes a merge build returns, which `libs/bpmn-merge` builds
and the merge view's protocol carries as they are. It holds types only. `MergeBuildNoteContent` is what a
note says; `MergeBuildNote` adds the elements it names (`named`). A repair named for shifting or growing
carries its lists as `MergeNonEmptyIds`.

`merge/domain/mergeBuildNoteReaders.ts` holds the functions over those notes. `elementsNamedBy` gives
`named`: the merge sets it with it, and the webview's text spec checks that a note's text names no other
element. `elementsRedrawnBy` gives the subset of `named` whose drawing a layout repair changed; only the
build's specs read it. One table per kind and, for a repaired kind, per repair answers both, and
`noteVariantEntry` is the one lookup into such a table, which the webview's wording table uses too.
`shapesShiftedBy` and `framesGrownBy` give the shapes a repair shifted and the frames it grew, none for a
repair that did neither. `isNonEmpty` is the one check a producer narrows a list with before it picks a
repair named for shifting or growing.

`merge/domain/conflictMarkers.ts` is Git's conflict-marker grammar, which the core reads files with and
`libs/bpmn-merge` checks a hand-merged text with, so both read markers alike.

`geometry/domain/polyline.ts` gives a flow's segments, its midpoint and its longest segment, so
`libs/bpmn-merge` walks waypoints with the same arithmetic as the label follow and the merge view instead
of keeping its own copy.
