# Merge view

- Status: accepted
- Last reviewed: 2026-11-17

## Context

A conflicted `.bpmn` file holds Git's conflict markers, so the modeler cannot open it and the
BPMN diff cannot run on it. The merge view shows the file's two sides as diagrams in VS Code,
side by side, and later lets the user pick per element and build the result
([merge](merge.md) owns the library that decides). This record covers how the view opens from
Git, how its panes mark the merge, how the user picks and how the result reaches the working
file (epic #2459).

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

**Pane identity across restarts.** Each opening gets a random id in its URIs' query. A
restored tab keeps its URIs while the extension host starts afresh, so an id that restarts
with the host (a counter, a time stamp) let a new opening hit the restored tab, which VS Code
then focused instead of resolving new panes. Opening the same URIs again focuses their tab, so
the command on an open view opens its own URIs again instead of a second session, but only
while Git still holds the sides and names it opened with (`showsSameConflict`): the command
reads Git every time, and a file that conflicted again opens a new view while the old tab
keeps its sides until it closes. Every
restored pane resolved twice in every observed reload (cause unknown), so `attachPane` is
idempotent: a pane already attached joins nothing new; a pane of a live view whose sessions
all hold its side (a split, a second tab) gets a session of its own; any other pane is ended
and recorded nowhere. The contract suite pins distinct URIs across two adapter instances.

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
`ResolvableConflictsService` holds a resolvable `.bpmn`. No row can be told apart: on a Source
Control row `resourceExtname` is the active editor's, and VS Code caches the row menu per
`contextValue`, which Git leaves at the repository kind. So while one BPMN conflict exists the
entry shows on every Merge Changes row, and the command explains a row it cannot open. It has
no inline icon, which would sit on text rows too. The editor title and the palette use
`resource in bpmn-modeler.resolvableBpmnConflicts`, the list the core decides, so a deleted
side or a non-BPMN file never shows them. Rejected: the row entry on every Merge Changes row
unconditionally, which every project without BPMN would see; `resource in git.mergeChanges`,
which lists files one side deleted. The manifest contract spec pins the three `when` clauses
and rejects `resourceExtname` and `inline` on a row.

**The offer on conflict markers** is an editor-session participant in the core's `diff/`
context: once per editor, and again only after the markers left and came back. Not in
`BpmnModelerService.display`, which runs on every re-show and host update. Only the VS Code
composition lists it; IntelliJ gets no new notification.

**Known limits.** `Repository.buffer` runs `git show --textconv`, so a textconv driver for
`*.bpmn` hands over converted text and Git LFS its pointer file (from the source, not
observed); the opener merges the stages before it serves a pane, so such a file is refused
and opens nothing. The core words each `MergeRefusal` itself and blames Git LFS or a textconv
driver only for a text the parser rejects; any other failure shows as a failed opening. A user whose
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
theme, which tints no surface; `mergeMarksStyle.spec.ts` pins both.

**One legend component.** The merge legend is the diff's `DiffLegendView` with the three
markers as its count slots and the merge's controls in its extension element: the open
conflicts, the list Next and Previous walk and the marked elements no canvas draws. Rejected:
a second legend, whose chrome and themes would drift from the diff's.

**Projections in the library, typed by modeler-types.** What a pane shows is a pure function
of the decisions in `libs/bpmn-merge`: `mergePaneView` (markers of the drawn elements, the
shape-less ones listed, and the count of each marker over both), `mergePaneSteps` (each step
naming the sub-process plane that draws it) and `mergeNavigationOrder` (current's flow, an
element only incoming's flow places after its nearest predecessor there, both flow orders
kept in `MergeSources`), `hasNoShape` (no version drawn, or the process or collaboration that
owns the root plane). The core's `domain/` cannot import the library, so
`MergeDecisionService` only maps them onto `ApplyMergeStatesQuery`, whose step and shape-less
copies a spec pins to the library's types. The webview paints and counts what it gets: it
skips an id its canvas lacks and decides no marker. A shape-less entry names its type through
`elementTypeName`, the one table of type names with the shared dictionary's keys.

**A `"merge"` viewer mode.** diagram-js fixes a pane's modules when it is built, so the host
tells a merge pane what it is in its first `BpmnFileQuery`; the merge session is attached
before the page boots. Whether a pane is a merge pane is decided by the merge session store
(`MergeDecisionService.shows`): it picks the viewer mode and sends merge states instead of
diff highlights. `DiffSession.origin === "merge"` only picks the tab's titles and diff
capabilities; `registerMerge` sets both together and a merge view ends with its last diff
session, so they cannot disagree while a pane is open. `MergeMode` and `DiffMode` share `DiffPanePlumbing` (viewport, plane
and selection sync, the element XML pad, the side label) instead of a copy of it.

**The full projection on every ready.** A custom editor's webview is not retained, and a post
to a hidden pane is dropped, so a pane reloads after a tab switch with nothing. Each
`DiffReadyCommand` of a merge pane sends both panes the whole state again, never a change.
Cost: one projection per ready, cheap beside the import.

**Two step lists, cursor by id, kept by the core per tab.** Next and Previous walk the open
conflicts in flow order, or every element either pane marks, which a legend toggle switches;
both lists are the same on both panes, and a cursor travels as its index in the second. The
core keeps the list (`MergeStepListChangedCommand`) and the step a pane moved to per tab and
sends them with every `ApplyMergeStatesQuery`, so both panes walk one list and a pane that
reloaded after a tab switch goes back to the step. Rejected: relaying the toggle pane to
pane, which a reload loses; the webview's `setState`, which keeps one pane only. Each pane
keeps its cursor by element id, so a repaint leaves it in place and a decided conflict's
successor is found from its place. On an element the walked list lacks, the counter counts
it at that place, one more than the list holds, so a pick keeps the user's place. A
shape-less step selects its legend entry; a step only the partner draws leaves the pane
where it is, since a neighbour here would point at something else, but the pane enters the
plane the partner stepped into, or notes that its version lacks it, which stops the viewport
sync.

### Picking

**The picks live in the core, for the merge view's life.** A pane posts `PickMergeSideCommand`
or `UnpickMergeCommand` with the element and a reach (the element, everything inside it, or the
flows the other side removed with it); `BpmnDiffService` hands it, with the pane's tab, to
`MergeDecisionService`, which decides it on the session's `MergeDecisions` (`pickScoped`,
`unpickScoped`) and sends every pane of every tab the full state again. An Undo of an element
no longer picked, from a pad or legend not yet repainted, changes nothing. The webview shows a
pick only once the core made it and holds no rule: what an element allows (`pickable`, with the
reach Undo takes back and `otherSideLacks`: the other side removed it, or never had it), the
badges, the picks a pane cannot draw and the consequences all come from `mergePaneView`. The
picks end with the session, so a window reload loses them. Rejected: picks in the webview's
`setState`, which keeps one pane only and would need the merge's rules to repaint. Picks take
the same way in as the step list: the router asks `BpmnDiffService.opensMergeViews` and ignores
all three merge commands without it, so IntelliJ routes them as ignored with one reason.

**Two ways in: the context pad for the mouse, the legend for the keyboard.** diagram-js's
context pad has no keyboard handling, so the pad's group beside "Show XML changes" ("Keep this
version", "Keep everything inside" on a container, "Undo pick") is mirrored by the legend's
actions for the element the stepper is on: "Keep current" on the left pane, "Keep incoming" on
the right one. A shape-less element is reached by its legend entry, a decided one or an
automatic resolution through the "All merged elements" list, so Undo and override work by
keyboard too. A pick names the side it keeps, the sending pane's side when it names none, and
naming a side whose version lacks the element leaves it out, which the core reports as "Left
out", so one pane can offer both outcomes. Rejected: a separate leave-out command, which would
copy that rule. The legend's action buttons stay in place across repaints, so the focus stays
on the one pressed; where a repaint hides or removes the focused control (Undo of the stepped
element, an undone entry of "Your picks"), the focus moves to the Keep action or to the last
outcome's headline. diagram-js rebuilds an open pad only on a selection or element change, so
the pane reopens it after every state.

**A badge names the user's picks.** Every element the user picked carries a badge over its
top-left corner, a check mark and the kept side's letter, its full words as `aria-label`, filled
on the side that kept it and outlined on the side whose version it replaced; a container kept
with everything inside adds a nested box. Top left, because a collapsed sub-process's
drilldown button sits bottom right. diagram-js's overlays throw on an id the canvas lacks, so a
pane badges only ids its registry holds, and a pick it cannot draw (removed on its side, or
shape-less) is listed under "Your picks" with its undo. Consequences get a dotted outline and
no badge; automatic resolutions keep only their marker.

**The last outcome travels with the state.** The core keeps what the last pick or undo did per
merge view: what it pulled in, dropped and opened again (the open conflicts before and after,
since the merge names only what it newly decided), or why it was refused, as the merge's
obstacle kind with the two elements and whether the whole target or a part of it is missing.
The core sends the names of the elements the legend names (the picks it lists and the last
outcome's), as the side the merge takes each from names it, so both panes name an element alike
and a pane names one it does not draw; the webview falls back to its canvas, then to the id.
The status line is rebuilt only when the outcome changes, so a step does not announce it
again. Keeping an element the other side removed offers its flows on the pane of the kept side;
accepting is one `pickWithConnections`, so a reload shows the offer again and declining leaves
the build's `restoredWithoutConnections` note. Undo of such a pick takes the flows back with it.

### Building

**The working file is the trial run.** Build replaces the conflicted file with the merged BPMN
and saves it; the user edits it in the normal modeler, compares it, builds again after another
pick, and stages it when done. The extension never stages: the core has no write port to Git,
and staging is the user's statement that the conflict is resolved. Until then
`git checkout -m -- <file>` brings the markers back. Rejected: building into a new untitled
editor or a scratch file, which the user would have to copy over the working file by hand, and
staging on build, which takes the decision from the user.

**One port that reads and writes the open document.** `MergeWorkingFile.read` returns the text
with unsaved edits and whether there are any; `replace` goes through VS Code's text document
(`WorkspaceEdit` and `save`), so every editor of the file follows. Not `WorkspacePort.writeFile`,
whose behaviour with a dirty open document nobody checked. The contract suite pins that a read
sees unsaved edits as dirty, that a replace leaves nothing dirty and keeps a CRLF file's line
endings, run by the fake and the VS Code adapter; a failed save puts the old text back. The
built file opens through `NotifierPort.openDocument` (`vscode.open`), which
picks our editor on 1.76.0 and stable, also after a text tab of the file; it lands in the
editable modeler only because a merge tab names no file (see "Opening from Git").

**Ask before replacing what the user may want.** `overwriteDecision` writes without asking over
Git's markers as the merge view read them when it opened, or over the last build as its save
left the file (line endings and save participants may change the text); `git checkout -m` or
the next build brings either back, and line endings never count as a change. It asks first
over unsaved changes (the save would lose them), over markers changed since the merge view
opened (a conflict resolved by hand there is not recoverable), over a file without markers
that was never built (resolved another way, or another merge tool filled it) and over a build
the user edited. A build the library refuses writes nothing and shows its reason, which names
the elements; a second Build while one runs is ignored, and one with open conflicts is refused.
The core keeps the last build and its notes in the
merge session and sends them to the panes before it opens the file, which hides the merge tab,
so the panes show the notes when the user comes back. Rejected: a command that picks one side
for every open conflict, which decides for the user.

**The comparison is a plain BPMN diff of copies.** "Compare with current/incoming" reads the
working file as it is open, unsaved edits included, and serves it as `order.result.bpmn` beside
the stages under fresh `bpmn-merge:` URIs, then registers a `merge-result` session of the stage
against that copy. `computeDiff` marks every element of the stage missing from the result as
removed, one a pick dropped as a consequence too. The tab title holds `MERGE_TITLE_INFIX`, so it
names no file; `MergeViewOpener.attachPane` joins both panes to the session registered for
them, and a restored one shows that the merge view ended. The panes learn the side and the
switch's target from `ApplyDiffHighlightsQuery.comparison`; the switch opens the other side's
comparison, then closes this one, and goes once the merge view closed. Cost: it does not follow
later edits. Rejected: the `file:` URI on the right, which a restored, unresolved comparison
turned into a pending diff half, so the working file opened as a dead viewer.

**The modeler retries a failed first import.** A modeler tab open on the conflicted file failed
its first import on the markers and used to drop every later host file. It now waits for the
host's next file and opens that, so it shows the built diagram.

### Hosts

VS Code keeps `^1.76.0`. On 1.76.0 the Git API under `--disable-extensions`, both
`bpmn-merge:` panes in the custom editor and the working file opening into the modeler run in
`test/e2e`; the menus and the comparison (the same `bpmn-merge:` diff) were seen on stable
only, because the smoke harness cannot launch 1.76. Should a menu fail there, raising the
minimum is the fallback. The standalone app ships `vscode.git` 1.95.3, so the view is not
gated there, and it is untested: no headless harness runs the Theia app. IntelliJ opens no
merge view: the bridge narrows `DiffOpenParams.origin` to the two diff origins and lists no
conflict-marker participant.

## Consequences

- The domain rules have table specs; `MergeViewOpener`, `ResolvableConflictsService` and the
  participant run against the test kit's fakes; `describeConflictVersionsContract` and
  `describeMergeSidesViewContract` hold every adapter, the fakes included.
- `mergePaneProjections.spec.ts` checks what both panes show over every merge scenario and
  150 random versions, before and after random picks: no open conflict off both panes, no
  mark a side cannot hold, no step on neither pane, and every element a flow reaches before
  the rest of the order.
- `DiffController.spec.ts` keeps the working file an editable modeler beside a live and a
  restored merge tab, and a real SCM diff of it still a diff pane.
- `test/e2e/merge.e2e.test.ts` opens a merge and a rebase conflict on 1.76.0 and stable; the
  smoke test's `open` and `marks` steps cover each Git operation, a non-BPMN row, the notice,
  the reload, the reopening and both panes' markers, through the DOM only.
- `MergeDecisionService.spec.ts` covers picks, the side a pick names, Undo, a refused pick and
  the restore offer on fake panes; the smoke test's `pick` steps decide by keyboard only.
- `MergeBuildService.spec.ts` covers building, overwriting and comparing on fake ports;
  `test/e2e` builds on 1.76.0 and stable and checks the index and that no diff pane holds the
  built file; the smoke test's `build` steps build, compare, reload and let Git continue.
- The bridge builds no `MergeDecisionService` or `MergeBuildService` and ignores the build
  commands, yet the merge library reaches its binary through the core's barrel.
