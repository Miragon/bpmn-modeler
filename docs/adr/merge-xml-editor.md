# Merge XML editor

- Status: proposed
- Last reviewed: 2026-11-17

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
  the tab opens with an error. Base and both inputs may stay read-only virtual documents.
- *The result starts as Git's conflict text, not as the pick.* The editor keeps the output
  as given unless a line starts with `<<<<<<<`, and counts a range as handled when the
  result holds either side. Prefilled with the pick, every true conflict counts as
  resolved toward the pick, and accepting drops the other side's edit without a warning.
  From the marker text the editor merges the one-sided changes itself and leaves exactly
  the true conflicts open, as for any Git conflict.
- *Only for an element the base holds.* Without a base, 1.76 does not open, and from 1.99
  the whole element is one conflict block, which is no more than the whole pick. An
  element both sides added is picked whole.
- *Finishing is the tab closing.* The editor's result menus are proposed API and the Git
  extension's Complete Merge button is gated to its own files, so the extension adds its
  own editor title button that runs `mergeEditor.acceptMerge`. That command reports
  success even when the user cancels its second dialog and the tab stays open, so the
  extension takes the last text the editor wrote to the provider when the merge tab
  closes; a close without a write discards. The text then passes #2457's checks.
- *Placement.* The command takes no view column and opens in the active group, so the
  group below the diagrams is focused first, as for the [XML diff](diff.md#element-xml-diff).
- *Offered only where the command is.* A leading underscore marks a command VS Code may
  change without notice; this shape held from 1.69 to 1.146. The entry shows only when
  `commands.getCommands(false)` lists it (the filtered list hides it); otherwise the
  element is picked whole. The call cannot report a failed open: the command returns
  before the editor loads. Theia registers the command with the same arguments, but it
  has not run there and Theia's tab API reports the inputs swapped, so the standalone app
  does not offer the entry yet.

Rejected besides an own view: conflict markers in a virtual document get no CodeLens (the
merge-conflict extension serves `file`, `vscode-vfs`, `untitled` and `vscode-userdata`
only), and a two-way diff with an editable result has no base, so it cannot tell one
side's change from a conflict.

## Consequences

- The line-wise XML merge rests on an internal VS Code command; a change to its arguments
  or its prefill rule hides the entry or breaks the merge without a compile error.
- The marker text makes the result dirty from the start, so closing asks to save and
  accepting always writes. "Complete with Conflicts" keeps the base's text for every open
  conflict, which parses and passes the checks; only the editor's dialog warns.
- The second dialog can be switched off per profile, so the number of dialogs is not
  fixed. Ctrl+Enter and the palette's Complete Merge exist only from 1.100, and the title
  button shows only in the focused group unless `workbench.editor.alwaysShowEditorActions`
  is set.
- The hidden setting `mergeEditor.useWorkingCopy` switches the editor to a temp model that
  computes its own result; with the marker text it starts the same, but whether it writes
  back to the provider is read in the source only, not run.
