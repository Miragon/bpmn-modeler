# Merge view picking and building

- Status: accepted
- Last reviewed: 2026-11-23

## Context

The [merge view](merge-view.md) opens a conflicted `.bpmn` file's two sides as diagrams and
marks what the merge decided and what is open. This record covers how the user picks per
element in those panes, by mouse and by keyboard, and how the result reaches the working
file; the [merge](merge.md) record owns the library that decides each pick, the
[merge build](merge-build.md) record how it builds the file (epic #2459).

## Decision

### Picking

**The picks live in the core, for the merge view's life.** A pane posts `PickMergeSideCommand`
or `UnpickMergeCommand` with the element and a reach (the element, everything inside it, or the
flows and boundary events the other side removed with it); `BpmnDiffService` hands it, with the
pane's tab, to `MergeDecisionService`, which decides it on the session's `MergeDecisions`
(`pickScoped`, `unpickScoped`) and sends every pane of every tab the full state again. An
Undo of an element no longer picked, from a pad or menu not yet repainted, changes nothing.
The webview shows a pick only once the core made it and holds no rule: what an element allows
(`pickable`, with the user's `pick`, whose reach Undo takes back, `lackingSide`: the side that removed it
or never had it, named alike on both panes, and `takenSide`, the side the result takes it from), the
badges and the consequences all come from `mergePaneView`. The protocol declares the pick once
(`MergePanePick`) and what an element allows once (`MergePanePickable`): `pickable` holds every
element's entry, a menu row is a shape-less element's entry with what each side holds, and a badge
carries the pick of an element the pane draws. `mergePaneView` builds all three from the one entry,
so the pad, the menu and the cards read the same pick. The picks end with the session, so a window reload loses them. Rejected: picks in the webview's
`setState`, which keeps one pane only and would need the merge's rules to repaint. Picks take
the same way in as the step list: the router asks `BpmnDiffService.opensMergeViews` and ignores
all three merge commands without it, so IntelliJ routes them as ignored with one reason.

**The step selects; the pad decides a drawn element, a menu row a shape-less one.** A step onto an
element the pane draws enters its plane (`focusElement`), then selects it (`selectStep` selects
only on the plane shown and reports nothing), so diagram-js opens the pad where ‹ › land, on each
pane that draws it; any other step clears the selection. Which pane keeps it in view on resize is
the diff's rule (`diffStepSelection`, see [Diff](diff.md)): the stepping pane, or the partner when
only its side holds the element. The stepping pane then posts `DiffSelectionChangedCommand`, so an
open XML diff follows the step; a step without a shape posts none, since the partner's mirror could select
its process's root. A click on a pickable step makes it the step on both panes and keeps the
click's own selection, which the pane reported already, since selecting it again would rebuild its
pad. The pad's icons sit at diagram-js's place: "Show XML changes", keep
this pane's side, keep everything inside, "Leave out" (where `lackingSide` names the other pane's side), "Also keep what was
removed with it", "Merge XML" (`handMerge` and the host's `elementXmlMerge` offer; "Keep … and
merge XML" while no pick decides the element, "Edit merged XML" once merged by hand, see
[Merge XML editor](merge-xml-editor.md)) and "Undo pick", each left
out where the result has its outcome (`mergePadDecisions`, the rule's one home). Each names its side in `aria-label` and in the merge chrome's styled tooltip, with
no native `title`. A menu row offers the same rule's decisions for both sides (`mergeRowDecisions`):
keep where a side holds the element, leave out where it lacks it, Merge XML as on the pad (its own
pick keeps the pane's side), Undo while the user's pick holds;
a shape-less container adds the pad's keep-inside icon beside each Keep, pressed and inert, so only
Undo takes it back, while the pick keeps that side with everything inside; the library's `container`
reach words its tooltip (a collaboration's: every pool with its process). A pick names the side it
keeps (the sending pane's when it names none); naming a side that lacks the element leaves it out
("Left out"). diagram-js rebuilds an open pad only on a selection or element change, so the pane
reopens it after every state. Rejected: a separate leave-out command, a copy of that rule; worded
buttons, which covered flows on the pad and wrapped in the menu; a scored pad placement, which moved
on almost every step; the old header's actions beside the pad, two ways to do one thing.

**Keyboard commands run the pad, ‹ › and Build on the target pane**, as diagram-js's pad handles no
keys. The pane reports what its selection allows (`mergePaneCommands` of `mergePadDecisions`) and
runs a `RunMergePaneCommandQuery` as the pad, ‹ › or Build does, moving no focus; Build posts with
conflicts open, so the core's refusal answers it. The report reaches `MergePaneCommandService` as
the BPMN router's host extension, not through `BpmnDiffService`, which would only pass it on. The
service tracks the target pane and whether it has the focus, and shows both, with what the target
allows, through the `MergePaneCommandKeys` port. The host decides when a pane stops being the
target: VS Code's `MergeKeyboardController` follows `WebviewPanel.active`, which turns false
whenever another part of the window takes the focus, the Command Palette too, so a pane that turns
inactive while it stays visible stays the target; it stops when its tab hides, its panel is disposed
or the active editor group changes. The keys act on `mergePaneFocused`; the palette lists a command
on `mergePaneTargeted`, so the palette, which takes the focus, still reaches the pane, and with it
the terminal or a side bar while the merge tab shows in the active group, wider than #2514's "while
a merge pane has the focus". Each also needs its own key, set from what the target allows. Keys:
Alt+F5 and Shift+Alt+F5, the compare editor's; Ctrl+K (Cmd+K) with K, Shift+K, L, Shift+F, Backspace
or B, unused by VS Code 1.146's defaults, and X for Merge XML, unbound in the macOS and Linux default keybindings
of 1.76.0 and 1.146.0 (read from Open Default Keyboard Shortcuts; M, the obvious letter, is Change
Language Mode); no plain Alt+letter, which types on macOS. Rejected:
commands always on, which answer nothing; the palette on `mergePaneFocused`, which the palette
itself clears; a `resourceScheme` clause, which the result comparison shares; a `resource` clause
(its query names the side), not shown to name the focused side of a custom-editor diff and silent on
what the selection allows. Cost: a message per selection change.

**A badge names the user's picks.** Every shape the user picked carries a badge above its top
edge, clear of the type icon and of a collapsed sub-process's drilldown button: a check mark and
the kept side's word as the caption has it ("✓ Incoming"), its full words as `aria-label`,
filled on the side that kept it and outlined on the side whose version it replaced; a container
kept with everything inside adds a nested box; a version merged by hand adds a pen and "by hand",
and a flow's round badge shows the pen in place of the check. A flow gets the check alone
(`flowBadgePlace`). The element under such a badge is drawn woven on both panes, not by its
side's marker ([merge view](merge-view.md)).
diagram-js's overlays throw on an id the canvas lacks, so a pane badges only ids its registry
holds, and a pick it cannot draw (removed on its side, or shape-less) is undone in the pad of
the pane that draws it, or in its menu row. Consequences get a dotted outline and no badge;
automatic resolutions keep only their marker.

**The last outcome travels with the state; the acting pane shows it on a card.** The core keeps
what the last pick or undo did per merge view: what it pulled in, dropped and opened again (the
open conflicts before and after, since the merge names only what it newly decided), or why it
was refused, as the merge's obstacle kind with the two elements and whether the whole target or
a part is missing. It names the elements the menu lists and the outcome names as the side the
merge takes each from names them (a row's title takes the row's own names); the webview falls
back to its canvas, where an unnamed flow reads "Flow from A to B" (`mergeElementLabel`), then
to the id. The sending pane remembers its side, which the outcome lacks (`mergeOutcomeMemory`,
in `MergeOutcomes`), and shows the answer as a card below the element, its label, its boundary
events and the pad; a flow's goes below its label or middle, away from the pad
(`MergeCardTarget.placeCard`). It closes on the next step, another selection, × or the partner's
newer decision, told by the outcome with the picks, since it names no side; it shows again on
reselection and announces each outcome once, through live regions that exist before their text.
The partner shows none; a row says its own. A pick or undo that would move a version merged by
hand off its side is refused with `handMergesAtStake`, and the card asks before it resends the
decision with `dropsHandMerges` ("Drop it and pick", "Keep my XML"), so no path drops the XML
silently, another element's pick included. An undo after which the merge would apply the
sending pane's last blocked decision names it (`freed`, "Nothing blocks … now"): the core keeps
that refusal while its pane decides on and asks the merge (`MergeDecisions.wouldApply`). A
decision of any other pane forgets it, the same side in another tab included; the finish of a
merge editor keeps it, as it changes no pick, except a discard that takes back the pick the merge
made itself ([Merge XML editor](merge-xml-editor.md)), an undo no pane sent. No pane copies the
merge's obstacle rules. Rejected:
the outcome in the header, far from the element and uneven in height; the acting pane in
`lastOutcome`; a scored placement, which jumped from pick to pick; the pane reading the refusal's
blockers, which took a picked dependant for the only obstacle an undo clears and missed a pick
made after the refusal (#2699). Cost: a reload or tab switch loses the card; the badge and the pad's restore
offer stay, as the core projects them.

**Keeping a removed element offers what the other side removed with it.** The library's offer
(`removedWithLeftOut`, [merge](merge.md)) shows on the kept side's pane, on the card and the pad,
a shape-less element's on both panes; accepting is one `pickWithRemoved`, and Undo takes the
flows and boundary events back too. Not offered, as each would bring back what the user did not
ask for: a flow whose other end the removing side deleted too, a message flow whose message it
deleted, a boundary event that needs an error or a lane it deleted, and that event's flows.
Declining, or a plain pick, leaves the build note `restoredWithoutRemovedWith`, which names the
boundary events removed with the element that the result leaves out and every flow of the element
or of those events left out, so a kept activity never loses its timer silently; a kept boundary
event's flows get its own note. The offer and the note share `removedWith`, not one rule: the note
names all that stays out, the offer what it can bring back. Both texts count elements once they
name a boundary event.

### Building

**The working file is the trial run.** Build saves the merged BPMN over the conflicted file; the
user edits, compares, builds again and stages it when done. The extension never stages (the core
has no write port to Git; staging says the conflict is resolved), and `git checkout -m -- <file>`
brings the markers back. Rejected: an untitled editor or scratch file the user would copy over by
hand; staging on build, which takes the decision from the user.

**One port that reads and writes the open document.** `MergeWorkingFile.read` returns the text
with unsaved edits and whether there are any; `replace` edits and saves VS Code's text document,
so every editor follows (not `WorkspacePort.writeFile`, unchecked on a dirty document). Its
contract suite pins dirty reads, a clean replace and CRLF kept; a failed save puts the old text
back. The built file opens through `vscode.open`, which picks our editor on 1.76.0 and stable;
it lands in the editable modeler only because a merge tab names no file
([merge view](merge-view.md#opening-from-git)).

**Ask before replacing what the user may want.** `overwriteDecision` writes without asking over
Git's markers as the merge view read them when it opened, or over the last build as its save
left the file (line endings and save participants may change the text); `git checkout -m` or the
next build brings either back, and line endings never count as a change. It asks first over
unsaved changes (the save would lose them), over markers changed since the merge view opened (a
conflict resolved by hand there is not recoverable), over a file without markers that was never
built (resolved another way, or another merge tool filled it) and over a build the user edited.
A build the library refuses writes nothing and shows its reason, which names the elements; a
second Build while one runs is ignored, and one with open conflicts is refused. The core keeps
the last build and its notes in the merge session and sends them to the panes before it opens
the file, which hides the merge tab, so the panes show the notes when the user comes back.
Rejected: a command that picks one side for every open conflict, which decides for the user.

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

**A kept flow stays its source's default.** Removing a flow takes its source's `default` with it,
so keeping the flow against that removal means the default too. `restoredFlowDefaultsOf` derives
it from the final sides alone, however the flow came back: the build sets `default` on the
source's version in the result and keeps every other change of that side. A source whose version
in the result names another flow keeps it, since the removing side chose it, and the build note
`defaultFlowNotRestored` names that flow; a source whose type holds no default gets the note
without one. Rejected: picking the whole source from the keeping side, the only pick the library
has, which drops the other side's changes to it (a rename, a condition) and decides a conflict for
the user; a note alone, which leaves the offer promising more than it keeps; a field on the pick's
outcome, since a later pick of the source creates or lifts the clash and only the build sees the
final sides. Cost: the one attribute the build writes that no side's version of the element holds,
so the content check strips exactly that `default` before it compares.

**The modeler retries a failed first import**, so a tab open on the markers shows the build.

## Consequences

- `MergeDecisionService.spec.ts`, `MergeBuildService.spec.ts` and
  `MergePaneCommandService.spec.ts` cover picking, building, overwriting, comparing and the
  keyboard commands' target on fake ports; `MergeKeyboardController.spec.ts` covers when VS
  Code's pane stops being the target, and the manifest contract spec pins the keys' and the
  palette's `when` clauses. `test/e2e` builds a merge and a rebase conflict on 1.76.0 and
  stable; the smoke test picks (by pad and by key) and builds through the DOM.
- The bridge builds no `MergeDecisionService` or `MergeBuildService` and ignores the build
  commands, yet the merge library reaches its binary through the core's barrel.
