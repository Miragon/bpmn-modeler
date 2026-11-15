# Merge view

- Status: accepted
- Last reviewed: 2026-11-15

## Context

A conflicted `.bpmn` file holds Git's conflict markers, so the modeler cannot open it and the
BPMN diff cannot run on it. The merge view shows the file's two sides as diagrams in VS Code,
side by side, and later lets the user pick per element and build the result
([merge](merge.md) owns the library that decides). This record covers how the view opens from
Git; the sections for marking, picking and building join it with their changes (epic #2459).

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
too; one home, `mergeSideOfPane`. Each pane's caption travels as data with a role that says
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
`*.bpmn` hands over converted text and Git LFS its pointer file; such a pane shows the
webview's import error (from the source, not observed). A user whose
`workbench.editorAssociations` maps `*.bpmn` to the text editor gets a text diff of the two
stages, and the pre-registered session waits out its 30-second TTL. The entries need the
extension active, which opening any `.bpmn` does, in any editor.

### Hosts

VS Code keeps `^1.76.0`. On 1.76.0 the Git API under `--disable-extensions`, both
`bpmn-merge:` panes in the custom editor and the working file opening into the modeler run in
`test/e2e`; the menus were seen on stable only, because the smoke harness cannot launch 1.76.
Should a menu fail there, raising the minimum is the fallback. The standalone app ships
`vscode.git` 1.95.3, so the view is not gated there, and it is untested: no headless harness
runs the Theia app. IntelliJ opens no merge view: the bridge narrows `DiffOpenParams.origin`
to the two diff origins and lists no conflict-marker participant.

## Consequences

- The domain rules have table specs; `MergeViewOpener`, `ResolvableConflictsService` and the
  participant run against the test kit's fakes; `describeConflictVersionsContract` and
  `describeMergeSidesViewContract` hold every adapter, the fakes included.
- `DiffController.spec.ts` keeps the working file an editable modeler beside a live and a
  restored merge tab, and a real SCM diff of it still a diff pane.
- `test/e2e/merge.e2e.test.ts` opens a merge and a rebase conflict on 1.76.0 and stable; the
  smoke test's `open` steps cover merge, rebase, cherry-pick and stash pop, a non-BPMN row,
  the notice, the reload and the reopening, through the DOM only.
