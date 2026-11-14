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
  pane's top edge with only the categories that changed, icon buttons for stepping and
  the position, and markers in the CI status colours (tinted fills with a dark contour
  in light mode, the status colour on the stroke in dark mode). Where two webviews hold
  the panes, both draw the bar and only the after pane's half carries the changes, so
  the halves read as one across the sash; this holds for the DMN diff too, whose
  before pane still shows the card for a view it lacks. `DiffSideLabelView` names
  each pane's version, or its file on a compare-files pane, in both diffs. The bar covers its parent's top edge, so a
  consumer starts the canvas `--diff-legend-height` (40px unless it measures the bar)
  lower, as the webviews do. The look is held as defaults of the
  `--diff-legend-*` custom properties, which stay the theming hook for consumers. The VS Code tokens and
  body classes it reads are optional fallbacks, so the stylesheet stays host-agnostic.
  Neither the BPMN package nor the DMN pane sets a `--diff-legend-*` property, and a spec
  in each keeps it so. The published package adds no font; the webviews bundle Geist for
  their diff panes. The public `DiffMarkerClass` literals are pinned to the shared
  markers by a spec.

The [Node import check](../../packages/bpmn-modeler/scripts/check-diff-node.mjs) and the
[data-library tests](../../libs/bpmn-diff/src) guard the data/browser split.


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
