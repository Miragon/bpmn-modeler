# Merge XML editor

- Status: accepted
- Last reviewed: 2026-11-20

## Context

An element whose sides changed different parts of its XML would otherwise be left to a
whole pick. This record covers the line-wise three-way text merge of one element's XML
(#2457) in VS Code's own merge editor; the [merge](merge.md) record owns the library that
decides the merge, the [merge view](merge-view.md) record the diagrams.

## Decision

The merge opens VS Code's merge editor through the internal command `_open.mergeEditor`
with `{ base, input1, input2, output }`, the call the Git extension makes. Spike #2449
checked it on VS Code 1.76.2 and 1.146.0. An own view would rebuild the three panes, the
conflict ranges and the accept flow; dropping the feature leaves an element whose sides
changed different parts to a whole pick.

- *The output lives on the extension's writable `FileSystemProvider`.* The editor keeps
  the result as a text file model, which a `TextDocumentContentProvider` document lacks:
  the tab opens with an error. Base and both inputs are served read-only under
  `bpmn-merge-xml:`, the result under `bpmn-merge-result:`, every path `/<id>.xml` under a
  fresh authority, as for the XML diff. Both schemes are activation events, so a tab a
  reload restored is closed: its texts are gone, and a save to a file the provider no
  longer serves is ignored. VS Code 1.147 brings the result back clean and unread, even
  when it was dirty, and closes it without asking, so the tab is closed unserved. The
  in-memory text views (the XML diff, this editor and the form's values; not the
  `bpmn-merge:` panes) share that sweep, which logs a close VS Code refuses, and their
  URIs (`apps/vscode-plugin/src/shared/adapter/out/`). Their two writable files, this
  result and the form's input, both ignore a save the provider no longer serves
  (`editorMayCreateFiles: false`), so the next in-memory view does not copy one of two
  answers.
- *The result starts as Git's conflict text, not as the pick.* The editor keeps the output
  as given unless a line starts with `<<<<<<<`, and counts a range as handled when the
  result holds either side. Prefilled with the pick, every true conflict counts as
  resolved toward the pick, and accepting drops the other side's edit without a warning.
  From the marker text the editor merges the one-sided changes itself and leaves exactly
  the true conflicts open, as for any Git conflict. The text has no base section and is
  labelled with each side's branch or commit (`writeConflictMarkers`, next to the reader
  in `@miragon/bpmn-modeler-types`, its output pinned to what the e2e runs). An element
  already merged by hand starts from its accepted text, which the editor keeps as given;
  Edit again starts from the text the merge refused last, kept until the next applied pick
  or undo, since that text was checked against decisions that no longer hold.
- *The core owns the lifecycle.* `ElementXmlMerges`, a domain object per merge view, keeps
  one editor per element (a second request brings the open one to the front), keys each
  opening apart, and reads a finish without a save as a discard.
  `ElementXmlMergeService` opens the render-only port `ElementXmlMergeEditor` only for an
  element the library's `handMergeableSide` names, takes a saved text through
  `acceptHandMerge` for the side the editor was opened for (so a pick changed meanwhile
  is refused as `notHandMergeable`), and shows the answer on every tab of the view. A
  refusal crosses the protocol as the library's data (`MergePaneHandMergeRefusal`, pinned
  to `HandMergeRefusal`), never its English sentence, so the pane names the elements and
  words it in the user's language. It
  closes its editors when the merge view ends and answers nothing for them. The editor
  reports a finish through a constructor callback straight to
  `ElementXmlMergeService.finish`; the panes' offers come from the source
  `MergeDecisionService` is built with. `describeElementXmlMergeEditorContract` holds the
  VS Code adapter and the test kit's fake.
- *Only for an element the base holds.* Without a base, 1.76 does not open, and from 1.99
  the whole element is one conflict block, which is no more than the whole pick. An
  element both sides added is picked whole.
- *Finishing is the tab closing.* The editor's result menus are proposed API and the Git
  extension's Complete Merge button is gated to its own files, so the extension adds its
  own editor title button that runs `mergeEditor.acceptMerge`. That command reports
  success even when the user cancels its second dialog and the tab stays open, so the
  extension takes the text the user's last manual save wrote to the provider when the
  last merge tab closes; a close without one discards. A save whose
  `onWillSaveTextDocument` reason is not `Manual` is no answer: the result is dirty once
  the editor merged a start with markers, so any `files.autoSave` mode would otherwise
  write the editor's own merge, base at every true conflict, before the user did anything.
  The accept's own save is unforced and writes nothing for a result an auto-save already
  wrote, so the button marks the merge as accepted while the command runs, and a close
  meanwhile answers with the last text written to the provider. The rule is the pure
  value `MergeTabAnswer`. The text then passes #2457's checks.
- *Placement.* The command takes no view column and opens in the active group, so the
  group below the diagrams is created and focused first, as for the
  [XML diff](element-xml-diff.md) (`editorGroupBelow.ts`); a later merge opens beside
  the merges already open. Bringing one to the front focuses its group by grid index
  (`workbench.action.focus…EditorGroup`, eight at most) and runs the command again, which
  shows the open editor instead of a second one.
- *Offered only where the command is.* A leading underscore marks a command VS Code may
  change without notice; this shape held from 1.69 to 1.146. The entry shows only when
  `commands.getCommands(false)` lists it (the filtered list hides it); otherwise the
  element is picked whole. The call cannot report a failed open: the command returns
  before the editor loads, and until it has loaded the editor drops a save and shows the
  marker text still. So `open` resolves only once the editor has loaded
  (`mergeEditorIsReady`): the merge tab shows and, for a start with a line that opens with
  `<<<<<<<`, reports dirty, which a merge tab does only once VS Code's own merge replaced
  the start. After ten seconds it logs and resolves anyway. The contract runs the adapter
  against a fake editor that merges the start as it loads, and names a save made right
  after `open` resolves. `close` waits for the same load: an editor still loading merges
  into the result after its tab closed and leaves it dirty with no tab, since the input
  model it registers on a disposed editor leaks. A merge whose editor never showed is
  finished without a text when the merge view closes it; a rejected call finishes it at
  once. Theia registers the command with the same arguments, but it has not run there and
  Theia's tab API reports the inputs swapped, so no Theia host offers the entry:
  `hostRunsElementXmlMergeEditor` rules out `env.appName` equal to the standalone app's
  `applicationName` (Theia 1.76's plugin host reports that value; a spec reads it from
  `apps/standalone/package.json`) and `env.uriScheme` `theia`, Theia's default, which the
  standalone app keeps. The panes are told through `MergeHostOffers.elementXmlMerge` once
  that answer is known. `MergeHostOffers` is one value on `ApplyMergeStatesQuery` that
  also carries the [element XML diff](element-xml-diff.md)'s offer, so a new offer
  adds a field rather than another positional flag; `MergeDecisionService` asks its source
  on every post, and VS Code reads the XML diff's support once, for the handler and the
  source alike. The router routes `OpenElementXmlMergeCommand` wherever an editor is
  wired, and an open the host cannot run, or of an element no hand merge may replace, is
  logged and ignored; the bridge has no editor, so its router ignores the command.

- *The panes offer it and word the answer.* The pad, a shape-less row and the keyboard
  command `bpmn-modeler.mergeXml` (Ctrl+K X, `mergePane.canMergeXml`) offer Merge XML where
  `handMergeable` and `MergeHostOffers.elementXmlMerge` both hold (`mergeElementPick`, which
  also reads the pick the pad, the row and the card's Edit again share);
  the badge marks a version merged by hand with a pen and "by hand", a cue no colour
  carries. The pane that asked words the finished merge on its card or row: one headline
  and one detail per refusal kind, composed and translated in the webview from the
  refusal's data, with Edit again while the pick still allows a merge by hand. It
  remembers each open request apart from its last decision, since the answer comes only
  when the editor closes, and takes a newly seen outcome of that element for the answer.
  The core counts the finishes in a row on the outcome (`finish`), so a finish that repeats
  the last one word for word is newly seen too, and no request waits on into the partner's
  next finish. Rejected: wording the refusal in the core, which knows no language; the
  answer on every pane, which would show twice; taking a repeated outcome for the answer in
  the webview, which cannot tell it from states the host sends again while the editor is
  still open.

Rejected besides an own view: conflict markers in a virtual document get no CodeLens (the
merge-conflict extension serves `file`, `vscode-vfs`, `untitled` and `vscode-userdata`
only), and a two-way diff with an editable result has no base, so it cannot tell one
side's change from a conflict.

## Consequences

- The line-wise XML merge rests on an internal VS Code command; a change to its arguments
  or its prefill rule hides the entry or breaks the merge without a compile error.
- The marker text makes the result dirty once the editor loaded, so closing asks to save.
  Accepting writes only a dirty result; the accept mark covers a clean one, and holds only
  because VS Code reports the tab closing before the command returns (e2e step 8).
  "Complete with Conflicts" keeps the base's text for every open conflict, which parses and
  passes the checks; only the editor's dialog warns.
- A Ctrl+S followed by a revert or by Don't Save still counts the saved text: the provider
  cannot tell it from a save followed by a close.
- A Ctrl+S in the moment the editor still loads (milliseconds, a few hundred for a very
  large element) is dropped by VS Code; closing then asks to save as usual. The tab API
  shows no load ending for a start without markers (Edit again), so its `open` resolves
  once the tab shows, before the editor has loaded. A user who closes the merge tab in
  that moment leaves the result dirty with no tab (it adds to the unsaved count, and Save
  All writes to a file the provider no longer serves); the extension cannot wait there.
- The title button (`bpmn-modeler.acceptElementXmlMerge`) shows where `resourceScheme` is
  `bpmn-merge-result`: VS Code sets that key for a merge editor from its result, which the
  `merge-xml` smoke suite clicks on 1.78.2 and stable.
- The outcome carries one field only merges by hand set, `finish`; it counts from one again
  after a pick or an undo, whose outcome already differs from the last finish.
- `merge-xml.smoke.test.ts` runs the pad, the key, the merge editor below the diagrams,
  accepting, Don't Save, a refusal with Edit again, the question before a pick drops a
  merge, and an XML diff that follows a step beside an open merge editor.
- `test/e2e/mergeXmlEditor.e2e.test.ts` runs the editor on 1.76.0 and stable through the
  core, on a picked element of a real merge view; the test API's `mergeXml` probe opens it
  through `ElementXmlMergeService` and reads the hand merge back.
- The second dialog can be switched off per profile, so the number of dialogs is not
  fixed. Ctrl+Enter and the palette's Complete Merge exist only from 1.100, and the title
  button shows only in the focused group unless `workbench.editor.alwaysShowEditorActions`
  is set.
- The hidden setting `mergeEditor.useWorkingCopy` switches the editor to a temp model that
  computes its own result and leaves the result clean, so `open` reads the setting and
  resolves once the tab shows, as for a start without markers. With the marker text it
  starts the same, but whether it writes back to the provider is read in the source only
  (VS Code 1.147), not run.
