# Merge view

- Status: accepted
- Last reviewed: 2026-11-19

## Context

A conflicted `.bpmn` file holds Git's conflict markers, so the modeler cannot open it and the
BPMN diff cannot run on it. The merge view shows the file's two sides as diagrams in VS Code,
side by side, and later lets the user pick per element and build the result
([merge](merge.md) owns the library that decides). This record covers how the view opens from
Git, how its panes mark the merge and which hosts list it (epic #2459); how the user picks, by
mouse and by keyboard, and how the result reaches the working file are in
[merge view picking and building](merge-view-picking-and-building.md).

## Decision

### Opening from Git

**The Git extension's API, looked up at runtime.** The adapter reads stages and refs through
`extensions.getExtension("vscode.git")` and `getAPI(1)`, with no `extensionDependencies`: the
modeler must still activate where Git is disabled or missing. Its types are a type-only copy
of the members it reads from `git.d.ts` at 1.76.0, the engines floor, kept as a `.ts` module
(`vscodeGitApi.ts`), because `tools/repo-checks` resolves relative imports only to modules
that exist. `Status` is left out: its const enum numbers moved in 1.79 and 1.81, so no code
reads a change's status. A read waits a bounded time for Git to finish starting and for the
file's repository to open; the watch behind the context keys waits as long as it is wanted.

**Raw facts, rules in the core.** `ConflictVersionsSource` hands over stages and refs as Git
resolved them; the core's domain decides whether the view opens (`conflictReadingOf`), which
operation conflicted (`gitOperationOf`) and what each pane is called (`mergeSideCaptions`).
A rebase counts when the extension's own rebase state says so, or REBASE_HEAD resolves while
the repository's Git folder (a linked worktree's `gitdir:` too) holds `rebase-merge` or
`rebase-apply`: the extension looks only under `<root>/.git/` and so misses a rebase in a
linked worktree (from the source, not observed), and REBASE_HEAD alone outlives a finished
rebase, which only `--abort` deletes (observed with Git 2.54), so it would name a later merge a
rebase.
Nothing in this step writes: the core holds no write port, the working file and the index
stay as Git left them.

**An own read-only scheme, `bpmn-merge:`, not Git's `git:` stage URIs.** The core reads all
three stages up front, one consistent snapshot, serves current and incoming under its own
URIs and registers a merge diff session before `vscode.diff` runs, so both panes attach to it
and never reach SCM pairing, which pairs by path and would build a plain diff of two
unrelated texts. A `bpmn-merge:` pane always resolves as a diff pane, and
`MergeViewOpener.attachPane` decides what it shows: it joins its live view, or shows the core's
"this merge view has ended" text, as after a window reload. Rejected: closing restored tabs,
since a diff tab whose sides open in a custom editor carries no input to find it by; and
disposing the panel while it resolves, which is untested ground.

**Pane identity across restarts.** Each opening gets a random id in its URIs' query: a restored
tab keeps its URIs while the host restarts, so a counter or time stamp let a new opening hit the
restored tab, which VS Code focused instead of resolving new panes. Opening the same URIs again
focuses their tab, so the command on an open view opens its own URIs again instead of a second
session, but only while Git still holds the sides and names it opened with
(`showsSameConflict`): the command reads Git every time, and a file that conflicted again opens
a new view while the old tab keeps its sides until it closes. Every restored pane resolved twice
in every observed reload (cause unknown), so `attachPane` is idempotent: a pane already attached
joins nothing new; a pane of a live view whose sessions all hold its side (a split, a second
tab) gets a session of its own; any other pane is ended and recorded nowhere.

**A merge tab never makes the working file a diff pane.** The live title holds
`MERGE_TITLE_INFIX`, which `diffTabLabelNamesFile` ignores, and each pane's document is named
after its side (`order.current.bpmn`), so the label VS Code builds for a restored merge tab
does not name `order.bpmn` either. Without it, the working file opened from the Explorer or the
notice while a merge tab named it resolved as a diff pane that never paired: a viewer with no
palette and no offer. Rejected: refusing a `file:` URI whose path a merge pane has, which
cannot see restored tabs that have not resolved yet and would refuse the working-tree side of
a real SCM diff opened beside the view. Cost: the restored case relies on VS Code labelling a
restored diff tab from its two basenames, observed on 1.146 only.

**Fixed positions.** Current is the left pane and incoming the right one, during a rebase
too; one home, `mergeSideOfPane`, which `inPaneOrder` applies wherever sides are listed: the
tab and XML diff titles, the merge diff session, and `MergeSidesView.open(leftUri, rightUri)`,
so the adapter decides no position. Each pane's caption travels as data with a role that says
which side is the user's (during a rebase incoming is the user's own commit), and the webview
composes and translates the words; the tab title is host chrome, so the core builds it in
English. VS Code's merge editor swaps the sides during a rebase instead; a fixed mapping is one
rule less.

**Where the command shows.** "Resolve in BPMN Merge View" sits on Merge Changes rows while
`bpmn-modeler.hasResolvableBpmnConflicts` is true, which the core sets while
`ResolvableConflictsService` holds a resolvable `.bpmn`. Only the running extension sets the
key, so the manifest activates on `workspaceContains:**/*.bpmn`. The cost: the extension starts
in every workspace with a BPMN file, not only in one with a conflict, so the release notice,
the marketplace update offer, the plugin-copy prune and the rewrite of old approvals run when
such a window opens, not when its first editor does. VS Code matches the glob case-sensitively,
stops searching after seven seconds and searches only when the window opens or a workspace
folder is added, so a window that opened without a `.bpmn` (an add/add conflict of a new diagram, a branch that
brings the first one), an `Order.BPMN` or a `.bpmn` outside the workspace folders still needs a
BPMN editor opened first, whose conflict-marker notice then offers the view. No row can be told
apart: on a Source Control row `resourceExtname` is the active editor's, and VS Code caches the
row menu per `contextValue`, which Git leaves at the repository kind. So while one BPMN
conflict exists the entry shows on every Merge Changes row, and the command explains a row
it cannot open. It has no inline icon, which would sit on text rows too. The editor title and the palette use
`resource in bpmn-modeler.resolvableBpmnConflicts`, the list the core decides, so a deleted
side or a non-BPMN file never shows them. Rejected: the row entry on every Merge Changes row
unconditionally, which every project without BPMN would see; `resource in git.mergeChanges`,
which lists files one side deleted. The manifest contract spec pins the three `when` clauses
and the activation event, and rejects `resourceExtname` and `inline` on a row.

**The offer on conflict markers** is an editor-session participant in the core's `diff/`
context: once per editor, again only after the markers left and came back, not on every re-show
(`BpmnModelerService.display`). Only VS Code lists it.

**Known limits.** `Repository.buffer` runs `git show --textconv`, so a textconv driver or Git
LFS hands over converted text or a pointer file (from the source, not observed), which the
opener refuses; the core blames them only for a text the parser rejects. A user whose
`workbench.editorAssociations` maps `*.bpmn` to the text editor gets a text diff of the two
stages, and the pre-registered session waits out its 30-second TTL. The entries need the
extension active, which opening any `.bpmn` does, in any editor.

### Marking the merge

**Own markers beside the published diff's.** A merge pane marks three things: taken from this
side, taken from the other side (also when the other side removed the element) and conflict.
They are `MergeMarker` in `mergeVocabulary.ts`, not new `DiffMarker` values, which are a
semver contract of `@miragon/bpmn-modeler/diff`. A layout difference is never a conflict and
gets no marker; the build takes current's drawing unless only incoming changed it or the
element follows its container's side ([layout side](merge.md#decisions-and-reference-rules)),
and notes a layout both sides changed differently. Each marker has a cue that is no colour (a
heavy contour, a hatch, a dashed contour with a "!" badge) and a stroke of its own in the dark
theme, which tints no surface; a halo of the hatch's ground keeps the hatch behind the label.
`mergeMarksStyle.spec.ts` pins all three.

**One bar per pane in the diff legend's look, the rest in a "…" menu.** Each pane's `MergeBar`
is one line of one height (`--diff-legend-height`), so the diagrams stay level: caption and
counts on the left; on the right also ‹ n/N › (N counts shape-less conflicts too), "…" and
Build, whose disabled reason is its tooltip and description. A count's tooltip says a pane
counts only what its side has. The menu holds the step list, Show all, the shape-less rows, the
comparisons and the notes; "…" counts the open shape-less conflicts. A narrow bar drops the
caption's branch and commit, then the counts' labels, then moves Build to the top of the menu
and tightens its gaps, so one line fits VS Code's narrowest editor (`mergeBarFit`; CSS reads
only its effects). Rejected: extending `DiffLegendView`, which has no room for a caption or end
actions and would change main's diffs too; editor title actions, host work in each IDE; two rows
on a narrow pane, which shift one diagram. Cost: the bar copies the legend's CSS, not its code.

**Projections in the library, typed by modeler-types.** What a pane shows is a pure function of
the decisions in `libs/bpmn-merge`: `mergePaneView` (markers of the drawn elements, the
shape-less ones listed, the count of each marker over both, and `shapelessRows`, the menu's list
of the shape-less elements either pane marks with the user's pick and both sides' values),
`mergePaneSteps` (each step naming the sub-process plane that draws it and which panes hold it)
and `mergeNavigationOrder` (current's flow, an element only incoming's flow places after its
nearest predecessor there, both flow orders kept in `MergeSources`), `hasNoShape` (no version
drawn, or the process or collaboration that owns the root plane). The core's `domain/` cannot
import the library, so `MergeDecisionService` only maps them onto `ApplyMergeStatesQuery`, whose
step and shape-less copies a spec pins to the library's types. The webview paints and counts
what it gets: it skips an id its canvas lacks and decides no marker. The menu's own list gives a
row to a conflict only current holds, which incoming's counts, from the library, leave out.

**A shape-less row shows what each side holds:** each side's presence and name, the attributes
its snapshot's start tag writes whose values differ, as text (a reference as its target's id),
and whether more differs (a child, the parent, the lanes). They sit on `shapelessRows`, not on
the marks, which leave out what the pane's side lacks; whether a lacking side removed the
element or never had it is the row's `lackingSide`, which also decides its picks. The title is
current's name, else incoming's, so a pick changes neither the title nor the value lines; the
base's value is not shown. Rejected: per-side name maps (silent on an `errorCode`), values read
with the engine's descriptor (it drops an engine default the snapshot writes), the sides' XML
diffed in the webview. Cost: "and other content" says only that more differs, the `</>` shows what.

**A `"merge"` viewer mode.** diagram-js fixes a pane's modules when it is built, so the host
tells a merge pane what it is in its first `BpmnFileQuery`; the merge session is attached before
the page boots. Whether a pane is a merge pane is decided by the merge session store
(`MergeDecisionService.shows`): it picks the viewer mode, sends merge states instead of diff
highlights and lets a pane be the [keyboard commands'](merge-view-picking-and-building.md#picking)
target. `DiffSession.origin === "merge"` only picks the tab's titles and diff capabilities;
`registerMerge` sets both together and a merge view ends with its last diff session, so they
cannot disagree while a pane is open. `MergeMode` and `DiffMode` share `DiffPanePlumbing`
(viewport, plane and selection sync, the element XML pad, the plane missing) instead of a copy
of it; a merge pane names its side in its bar, not in the canvas's side label.

**The full projection on every ready.** A custom editor's webview is not retained, and a post
to a hidden pane is dropped, so a pane reloads after a tab switch with nothing. Each
`DiffReadyCommand` of a merge pane sends both panes the whole state again, never a change.
Cost: one projection per ready, cheap beside the import.

**Two step lists, cursor by id, kept by the core per tab.** Next and Previous walk the open
conflicts in flow order, or every element either pane marks, which the menu's radios switch;
both lists are the same on both panes, and a cursor travels as its index in the second. The core
keeps the list (`MergeStepListChangedCommand`) and the step a pane moved to per tab and sends
them with every `ApplyMergeStatesQuery`, so both panes walk one list and a pane that reloaded
after a tab switch goes back to the step. Rejected: relaying the toggle pane to pane, which a
reload loses; the webview's `setState`, which keeps one pane only. Each pane keeps its cursor by
element id, so a repaint or a pick keeps the user's place, also on an element the walked list
lacks. A shape-less step opens the right pane's menu at its row and leaves the focus on ‹ ›. A
step only the partner draws leaves the pane where it is, since a neighbour here would point at
something else, but the pane enters the plane the partner stepped into, or notes that its
version lacks it, which stops the viewport sync. The pane that draws such a step (`onOtherPane`
false) posts its viewport after the step, so the partner shows the same part of the diagram.

### Hosts

VS Code keeps `^1.76.0`. On 1.76.0 the Git API under `--disable-extensions`, both
`bpmn-merge:` panes in the custom editor, the working file opening into the modeler and the
element XML merge editor run in `test/e2e`, the Extension-Host suite that launches 1.76.0 and
stable. The menus, the comparison (the same `bpmn-merge:` diff) and the keyboard commands were
seen on stable only: they need the panes' DOM, and the Playwright smoke harness drives nothing
older than 1.78. Should a menu fail there, raising the minimum is the fallback. The standalone app ships `vscode.git` 1.95.3, so the
view is not gated there, and it is untested: no headless harness runs the Theia app. IntelliJ
opens no merge view: the bridge narrows `DiffOpenParams.origin` to the two diff origins and lists
no conflict-marker participant or keyboard command.

## Consequences

- The domain rules have table specs; `MergeViewOpener`, `ResolvableConflictsService` and the
  participant run against the test kit's fakes, and the contract suites
  (`describeConflictVersionsContract`, `describeMergeSidesViewContract`) hold every adapter.
- `mergePaneProjections.spec.ts` checks both panes over every merge scenario and 150 random
  versions, before and after random picks: no open conflict off both panes, no mark a side
  cannot hold, no step on neither pane, every element a flow reaches before the rest.
- `DiffController.spec.ts` keeps the working file an editable modeler beside a live and a
  restored merge tab, and a real SCM diff of it still a diff pane.
- `test/e2e` opens a merge and a rebase conflict on 1.76.0 and stable; the smoke test opens and
  marks through the DOM. What covers picking and building is in
  [merge view picking and building](merge-view-picking-and-building.md#consequences).
