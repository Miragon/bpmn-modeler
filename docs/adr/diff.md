# Diff

- Status: accepted
- Last reviewed: 2026-11-13

## Context

BPMN and DMN files are compared as models, not as XML text: in VS Code's Git diff and Compare
commands, in IntelliJ's diff viewer (BPMN only) and by npm consumers of `/diff`. Both diffs share
their vocabulary, their legend and their pane relay.

## Decision

### BPMN diff

`libs/bpmn-diff` owns `computeDiff(beforeXml, afterXml): Promise<DiffResult>` so the core
and the browser package share one implementation without a library importing a package.
Public `/diff` exposes it without DOM, CSS, viewer or i18n dependencies. The result is
serializable IDs, counts and navigation order; its shape is a semver contract, while
ordering heuristics are not. Failures throw and hosts own their error reporting.

- Parse each revision separately with the C7 and C8 descriptors, remove the other
  engine's extensions from each pair, then merge and deduplicate the comparisons:
  registering both descriptors together collides on `modelerTemplate` and can silently
  skip XML. Unknown namespaced attributes get a textual comparison under their nearest
  tracked BPMN owner; traversal follows containment, not references or parent links,
  and preserves the process-to-participant mapping. Skipped-content parser warnings are
  errors. The cost is four parses and two comparisons, and textual semantics for custom
  attributes. Descriptor JSON is inlined as lazy chunks; parser dependencies stay
  external.
- `navigationOrder` is the order a stepper walks. It leaves out a connection whose only
  change is layout: such a connection moves with its shapes, so it stays in
  `layoutChanged` and `counts` and is highlighted, but it is no stop of its own. The rule
  has one home, `layoutOnlyEdgeIds` in `libs/bpmn-diff`, which the
  [DMN diff](#dmn-diff) asks too. A consumer that read `navigationOrder` as
  every changed id sees fewer stops.
- Browser rendering lives on `/viewer` (`DiffViewer`, `DiffLegend`, `DiffNavigator`,
  `DiffPaneCoordinator`, `DiffSideLabel`); the root re-exports are deprecated aliases. `DiffNavigator`
  owns stepping for in-page coordination and host-relayed panes and walks
  `navigationOrder` as given; the older `setChanges(view, navigationOrder)` stays as a
  deprecated overload that still leaves out layout-only connections, so an order from an
  older `computeDiff` steps as before. The coordinator syncs in-page viewport and cursor,
  and the private host protocol handles separate webviews. Legends take presentation
  props, not host vocabulary.
- Both diffs share one vocabulary and one legend in `libs/modeler-types`: the categories
  in legend order, the canvas markers, the legend's i18n keys and the stepping rules
  (`canStep`), plus `DiffLegendView` with its stylesheet. Prev and Next are enabled only
  when there is a step; a consumer without a stepper may omit `canStep`, and the legend
  then enables them whenever a count is above zero, which overstates a diff of
  connections that only moved. The legend takes a translator instead of importing one,
  so the library stays free of the i18n package.
- Both legends wear one look, the Miragon one of Diagit's diff panel: a bar along the
  pane's top edge with only the categories that changed, icon buttons for stepping with
  the position and Show all, and markers in the CI status colours (tinted fills with a
  dark contour in light mode, the status colour on the stroke in dark mode; an added
  connection is dark with a green glow). Where two webviews hold the panes, both draw
  the bar and only the after pane's half carries the changes, so the halves read as one
  across the sash; this holds for the DMN diff too, whose before pane still shows the
  card for a view it lacks. `DiffSideLabelView` names each pane's version, or its file
  on a compare-files pane, in both diffs.
- The bar covers its parent's top edge. `DiffLegendView.reserveRoomOn` keeps its
  height in `--diff-legend-height` on a target, and a consumer starts its canvas that
  much lower (40px before the bar shows), as both webviews do. That one property is
  set at runtime; the look itself is held as defaults of the other `--diff-legend-*`
  custom properties, which stay the theming hook for consumers. The VS Code tokens and
  body classes it reads are optional fallbacks, so the stylesheet stays host-agnostic.
  Neither the BPMN package nor the DMN pane sets a look property in its stylesheet, and
  a spec in each keeps it so. The published package adds no font; the webviews bundle
  Geist for their diff panes. The public `DiffMarkerClass` literals are pinned to the
  shared markers by a spec.
- Show all takes both panes back to how they opened, out of a collapsed subprocess
  too: `DiffViewer.fitDiagram`, `DiffNavigator.reset` and `DiffPaneCoordinator.reset`
  in-page, and across webviews a `CursorChangedCommand` with `SHOW_ALL_CURSOR` (-1),
  which the partner reads as Show all. `DiffLegendCallbacks.onShowAll`,
  `DiffLegendContext.showChanges` and `position`, and
  `DiffPaneCoordinator.cycleLength` carry the bar's state.
- Each pane fits its own diagram when it opens and tells its partner nothing: an
  opening fit sent as a viewport could reach the partner while VS Code still laid one
  pane out and leave it off-centre. The panes sync from the user's first pan or zoom.
- Both BPMN panes show the same plane: a pane reports the plane the user enters
  (`DiffViewer.onPlaneChanged`, by the id of its subprocess or empty for the plane it
  opened on, so a process and a collaboration still meet; never a plane it entered
  itself) and its partner enters it (`showPlane`). Every plane the user enters is
  fitted, as bpmn-js would show it from its top-left corner. In-page the
  `DiffPaneCoordinator` relays it; across webviews `DiffPlaneChangedCommand` goes to
  the host, which forwards `SyncDiffPlaneQuery`, as for viewport and cursor. A
  version without that plane keeps its own and says so on its side label; until a
  step, Show all or another plane brings the panes together, no viewport is synced,
  since one plane's coordinates mean nothing on another.

The [Node import check](../../packages/bpmn-modeler/scripts/check-diff-node.mjs) and the
[data-library tests](../../libs/bpmn-diff/src) guard the data/browser split.

### Element XML diff

In VS Code's BPMN diff, the context pad of an element opens a text diff of that
element's XML from both versions, in an editor group below the diagram diff. While it is
open, it follows the selection, which both panes share. It is the first step toward
resolving merge conflicts on the diagram (#2459).

- *What an element's XML holds.* `elementXml(xml, elementId)` in `libs/bpmn-diff`
  returns the element's own attributes and configuration children, without `bpmndi` and
  without the children the diff reports under their own id; `incoming` and `outgoing`
  stay. Which elements the diff tracks, and that a pool's process counts for the first
  participant referencing it, is one rule, `trackedElementOf`, which `computeDiff` and
  `elementXml` share; a spec pins it to bpmn-js-differ's `ChangeHandler._isTracked`, so
  a process no participant references is untracked, as upstream has it. The text is
  re-serialized, not cut from the file: no engine descriptor is loaded (one parse, no
  `modelerTemplate` collision, extensions round-trip as generic elements), attributes
  without a descriptor are sorted, and each namespace gets one prefix shared by both
  versions, built from both documents' declarations, of which the snippet declares the
  ones it uses. Formatting, attribute order, comments and a renamed prefix therefore
  never show as changes; the cost is text that is not the file's bytes. It is not exported from `@miragon/bpmn-modeler/diff`.
- *No silent loss.* The declarations are read with saxen, the parser's own tokenizer,
  so comments, CDATA and text declare nothing and URIs are decoded as the parser decodes
  them. The prefixes go to the parser as moddle-xml's `nsMap`, set when the moddle
  instance is created and never changed. A guard still rejects a snippet that uses a
  prefix it cannot declare, and skipped content rejects as in `computeDiff`, since a
  dropped attribute would show a wrong diff. `nsMap` and the prefixes the serializer
  declares by itself are undocumented, so they sit behind the `moddleNamespaces`
  adapter (see [dependencies](dependencies.md#private-upstream-apis)); its spec, the
  guard and the namespace specs turn an upgrade that changes them into a failing
  build. A call builds two moddle instances and parses the whole document: about
  50 ms at 0.8 MB, two calls per selection.
- *One bpmn-moddle loader.* `loadBpmnModdle` in `libs/bpmn-diff` is the only production
  code outside bpmn-js that resolves bpmn-moddle's factory, and `moddleDescriptor`
  beside it unwraps a dynamically imported engine descriptor. `libs/bpmn-layout`, the
  Node linter and the script task service use the loader, so `bpmn-layout` depends on
  `bpmn-diff`; specs that import `BpmnModdle` statically do not go through it. The
  parser, saxen, the engine descriptors and bpmn-js-differ load lazily, so a bundle
  that imports the library for the loader loads none of them; a spec holds this. saxen
  is a direct dependency of `bpmn-diff` at moddle-xml's version and so a runtime
  dependency of `@miragon/bpmn-modeler`, which inlines the library. `computeDiff` reads
  the Camunda 7 and 8 prefixes and URIs from the descriptors; `BpmnDocument`'s copy is
  #2464.
- *The panes share one selection.* `DiffViewer` takes `DiffViewerOptions.additionalModules`,
  as `createViewer` does, so only the webview adds a context pad and an outline. The
  viewer reports the single selected element (`onSelectedElementChanged`, a BPMN id or
  `undefined` for an empty or multiple selection) and applies the partner's
  (`mirrorSelection`, which clears on `undefined`, on an absent element and on another
  plane, and reports nothing back). The names differ from
  `SelectionManager.onSelectionChanged`, which reports diagram ids such as `X_label` that
  do not name the same element in two versions; `bpmnElementIdOf` is the one rule that
  maps a label to its element, for the selection and the context pad. An import reports
  no selection, so a pane that loads late does not clear its partner's. Every background
  click posts an empty selection, which the core ignores for the XML diff.
- *Resize.* Opening the group below takes the panes' lower half. diagram-js's
  KeepSelectionVisible is replaced in every `DiffViewer` by its own rule in the pane the
  user selected in: when a resize cuts off a selected element that was fully in view,
  the pane centres it as a user pan, so the partner follows through the viewport sync;
  the mirroring pane never scrolls, since its own scroll posted a competing viewport. A
  selection the user panned away from, or one still in view, stays put. The rule runs
  on every viewbox, selection and size change instead of upstream's debounce. The cost:
  the partner follows after the viewport debounce, and the stepper's focus
  (`focusedId`) stays apart from the selection, so a resize after stepping keeps the
  selection in view, not the stepped change. The webview depends on diagram-js directly
  at the package's pin, because bpmn-js's context pad needs `modeling`, which a viewer
  lacks.
- *One switch per host.* `ApplyDiffHighlightsQuery.elementXmlChanges` tells the panes
  to offer the entry. No host sets it yet, so the entry stays hidden and every router
  ignores `ShowElementXmlChangesCommand`; every host mirrors the selection.


### DMN diff

`libs/dmn-diff` owns `computeDmnDiff(beforeXml, afterXml)`, safe in Node and the browser
and without DOM, like [`libs/bpmn-diff`](#bpmn-diff), whose `DiffSide` and
`DiffCounts` it reuses. Only the VS Code extension opens the DMN diff: IntelliJ has no
DMN editor and Orca no diff.

- *Comparison by id*: DRG elements, artifacts, requirements, input and output clauses,
  rules and their cells. bpmn-js-differ, which the BPMN diff uses, knows BPMN only, so
  the comparison costs its own code and tests. The layout-only `biodi:*` attributes are
  left out. A longest common subsequence over the shared rule ids finds moved rules,
  since order decides a FIRST or PRIORITY table. A copied rule gets a new id and shows
  as removed and added, as in the BPMN diff. Parser warnings about unparsable content
  are errors.
- *Stepping* follows the reading order of the DI; an edge whose only change is its
  layout is counted but not stepped to, by the BPMN diff's `layoutOnlyEdgeIds`. A
  table's attributes step is explicit (`attributesStep`), and readers take the field,
  not a position in the navigation order.
- *Panes.* The core's `DmnDiffService` computes the diff once both panes are ready and
  shares `DiffPaneRelay` with the BPMN diff, adding the open view and the table's
  scroll. The scroll is anchored on the topmost rule both versions share, so inserted
  or removed rows do not shift the partner.
- *Table highlights* are one scoped stylesheet per pane whose attribute selectors
  survive every re-render of the table. Classes on table cells, as the DRD markers are,
  would vanish whenever dmn-js renders the table again. The cost is a positional
  selector for output headers, which a browser spec checks against real dmn-js.
- *Vocabulary, legend and colours* are the ones both diffs share
  ([BPMN modeler](#bpmn-diff)); `diffPalette.spec.ts` keeps both stylesheets'
  colours equal.
- *The viewer is not public API.* `createDiffViewer` stays a runtime export of the main
  entry, which the webview imports lazily, but `@internal` trims it from the published
  declarations, and `check-dts` fails when the roll-up declares it. It is not on a
  subpath because it costs a consumer of `.` almost nothing, while a subpath would need
  its own lib entry, declaration roll-up and CSS build and would make the viewer look
  public. Should it become public, it gets `./viewer`; `./diff` stays reserved for a
  Node-safe `computeDmnDiff`.
- *The page is told it is a diff pane in its HTML*
  ([webview protocol](webview-protocol-and-sync.md#protocol)): a flag in the file query,
  as BPMN's viewer mode is, would arrive after the DMN bootstrap created its modeler.
  The pane's state is a pure reducer in the webview's domain.
