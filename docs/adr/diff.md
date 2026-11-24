# Diff

- Status: accepted
- Last reviewed: 2026-11-24

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
- One bpmn-moddle loader: `loadBpmnModdle` in `libs/bpmn-diff` is the only production
  code outside bpmn-js that resolves bpmn-moddle's factory, and `moddleDescriptor`
  beside it unwraps a dynamically imported BPMN engine descriptor. `bpmn-layout` parses
  through the loader, so it depends on `bpmn-diff`. The parser, saxen, the engine
  descriptors and bpmn-js-differ load lazily, so a bundle that imports the library for
  the loader loads none of them; a spec holds this. saxen is a direct dependency of
  `bpmn-diff` at moddle-xml's version and so a runtime dependency of
  `@miragon/bpmn-modeler`, which inlines the library. `computeDiff` reads the engines'
  prefixes and URIs from the descriptors; `ENGINE_NAMESPACE` in
  `@miragon/bpmn-modeler-types` copies them for the modeler and the merge, which load no
  descriptor. Its prefixes are typed as the diff's `ExecutionEngine`, which is why
  `modeler-types` depends on `bpmn-diff`, and a spec pins each entry to
  `loadExecutionPackage` (#2464). The primitives the merge builds on are in
  [Merge](merge.md#one-unpublished-library).
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
- Both diffs share one vocabulary and one legend: `libs/modeler-types` holds the categories
  in legend order, the canvas markers, the legend's i18n keys, its state and the stepping
  rules (`canStep`), `libs/modeler-browser` the `DiffLegendView` with its stylesheet. Prev and Next are enabled only
  when there is a step; a consumer without a stepper may omit `canStep`, and the legend
  then enables them whenever a count is above zero, which overstates a diff of
  connections that only moved. The legend takes a translator instead of importing one,
  so the library stays free of the i18n package.
- Both legends wear one look, the Miragon one of Diagit's diff panel: a bar along the
  pane's top edge with only the categories that changed, icon buttons for stepping with
  the position and Show all, and markers in the CI status colours (tinted fills with a
  dark contour in light mode, the status colour on the stroke in dark mode; an added
  connection is dark and heavier). Nothing else sits on the canvas: the DMN diff puts
  no counts on a decision whose table changed and draws dmn-js's drill-down as a dark
  outline icon. A marked edge is thickened with a tight shadow in its own colour, since
  a wider stroke would scale its arrowhead. Where two webviews hold the panes, both draw
  the bar and split it as Diagit's one bar reads: the before pane's half carries the
  changes (`showControls: false`), the after pane's stepping, Show all and swap
  (`showChanges: false`). Neither half wraps, so both keep one height and the bar runs
  through across the sash; a pane too narrow for the category words keeps the swatches
  and counts and names each on its slot's title. This holds for the DMN diff too. `DiffSideLabelView` names each pane's version, or its file
  on a compare-files pane, in both diffs.
- A Git diff's pane names which version it shows. "Old version" and "New version" told the
  sides apart but not what each is, which only the tab title said, and only for the newer
  side. The core names each pane's version as Git and VS Code's diff titles do
  (`revisionName`: Working Tree, Index, a ref or a commit; the element XML diff's title
  words its versions with it) and sends it as `paneVersion` of both highlight queries.
  The base of a working tree change is HEAD while the file has nothing staged and the
  index once it has, which is how the Git extension reads its `~` document
  (`sanitizeRef`); HEAD is the word users know, and "Index" for an unstaged file named a
  version they never made. The host tells which (`staged`): VS Code asks the Git API's
  `indexChanges` each time the pane's version is read, and where it cannot tell the name
  stays Index, whose text is the same then.
  Which diff names versions is an origin rule (`namesVersions`, an SCM diff only) that the
  label and the title both ask, and both webviews word the label with `diffPaneLabel` in
  `@miragon/bpmn-modeler-types`. Git's names stay as Git writes them, untranslated like a
  branch; the side's word is translated. A pane names its version on its own: beside a
  partner whose version the host does not tell it still names its own, since what it
  says is true, while the title needs both and names none. Only a host that tells a
  pane's version gets the addition: VS Code reads it from the document's `git:` URI,
  IntelliJ sends none, so its panes keep the side alone. The cost: the label reaches
  `DiffSideLabelView` as finished text through `showFilename`, as the result comparison's
  did, so each webview words it again when the language changes. Giving the view the
  version as a prop would change `DiffSideLabel` of the published
  `@miragon/bpmn-modeler/viewer` for a label's internals.
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
  too; across webviews it travels as a `CursorChangedCommand` with `SHOW_ALL_CURSOR`
  (-1), which the partner reads as Show all.
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

- VS Code resolves both sides of a diff through the custom editor, so `DiffController`
  decides per resolving document whether it is a diff pane: a session registered before
  `vscode.diff` awaits it (compare-files, merge); it is a merge side (`bpmn-merge:`), which
  joins its live merge view or shows that the view ended and never reaches pairing; it comes
  from Git (`git:`, `gitfs:`); or more diff tabs name the file than panes render it. The
  last rule reads tab labels, because a diff whose sides open in a custom editor is a tab
  without input; a merge tab names no file, live or restored
  ([merge view](merge-view.md#opening-from-git)), so the working file opens as an editor
  beside it. A file no rule claims opens as an editor.

The [Node import check](../../packages/bpmn-modeler/scripts/check-diff-node.mjs) and the
[data-library tests](../../libs/bpmn-diff/src) guard the data/browser split.

### Library folders

Decided 2026-11-23 (#2562): `libs/bpmn-diff` sorts its files into folders by concept, each with
`domain/` (the rules) and `service/` (what loads the parser, a descriptor or saxen, or awaits a
parse) inside and no `port/` or `adapter/`, as the [merge library](merge.md#stages) does.

| Folder | Holds | Imports |
| --- | --- | --- |
| `moddle/` | the bpmn-moddle loader, its parse result, the element model, the descriptor interop | no folder |
| `present/` | what a pane reads: `DiffResult` and its vocabulary, `sideView`, `layoutOnlyEdgeIds`, the flow order | no folder |
| `parse/` | namespace declarations and prefixes, the engine descriptors, the prefixed and document moddles, root tag names, the containment walk | `moddle/` |
| `compare/` | `computeDiff`, the tracked-element rule, the adapter over the differ's private keys | `moddle/`, `parse/`, `present/` |
| `snapshot/` | `elementSnapshots`, `elementXml`, `elementTexts` | `moddle/`, `parse/`, `compare/` for its default unit rule |

`architecture.spec.ts` checks the imports and that `domain/` imports only pure modules; the
`upstreamInternals/` adapters ([dependencies](dependencies.md#private-upstream-apis)) sit in their
callers' role folders.

- **Why:** the checks that read the core and the merge library read this library too; `moddle/`
  imports nothing else, so #2466's moddle library is a folder move, and `present/`, which the panes
  and `/diff` read, imports no parser code.
- **Domain entry:** the root barrel re-exports `service/` modules and is not pure, so
  `@miragon/bpmn-modeler-diff/domain` (`src/domain.ts`, a `tsconfig.base.json` alias) re-exports
  what pure importers use and no more: the merge's `domain/`, `dmn-diff`, and `modeler-types`
  (`engine.ts`, and `diff.ts`, whose types the DMN package's declarations carry). Every other
  consumer keeps the root entry, whose names did not change.
- **Cost:** API Extractor inlines the subpath into a package's declarations only through the
  `./domain` entry of this library's `exports` map; without it the DMN build cannot resolve
  `diff.ts`' types (#2776). Six modules that
  mixed awaiting code with what `domain/` needs were split; synchronous rules beside the parse they
  serve stay in `service/` (`computeDiff.ts`, `elementSnapshots.ts`, `elementTexts.ts`,
  `parsedUnits.ts`, `serialiseSnippet.ts`, `rootElements.ts`), where no rule finds them.

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
