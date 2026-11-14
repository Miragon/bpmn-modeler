# BPMN diff

See what changed between two versions of a `.bpmn` file as two diagrams side by side, not as an XML diff.

<figure class="shot"><img src="/shots/bpmn-diff.png" alt="Two BPMN diagrams side by side with added, removed, changed and moved elements highlighted, each pane labelled with its version, and one bar of change counts and stepping arrows across the top"><figcaption>Before on the left, after on the right. Pan and zoom in one pane and the other follows.</figcaption></figure>

## Open a diff

**From Source Control.** Click a modified `.bpmn` file in the Source Control view, or open any Git diff of one (history, pull-request review). The left pane shows the old version, the right pane the new one.

**Compare two files.** In the Explorer:

- Select two `.bpmn` files, right-click, **Compare Selected (BPMN)**. The first selected file is the before side.
- Or right-click one file, **Select for Compare (BPMN)**, then right-click the other, **Compare with Selected (BPMN)**. The pick is kept until you compare or reload the window.

Each pane names its version in its top left corner: **Old version** on the left, **New version** on the right. File comparisons name each file there instead and add a ⇄ button that swaps the sides (its tooltip reads **Swap sides**).

If a Git diff still opens as XML, check `workbench.diffEditorAssociations` in your settings: a `*.bpmn` entry there overrides the modeler.

In IntelliJ, **Show Diff** and **Compare Files** open the same view.

## Read the highlights

| Highlight | Shown in | Meaning |
|---|---|---|
| Green | After pane | Added |
| Red | Before pane | Removed |
| Blue | Both panes | Changed attribute (name, condition, implementation, …) |
| Amber, dashed connections | Both panes | Moved: only the layout changed |

The bar above the panes counts the changes per type, leaving out types without a change. The arrows **‹** and **›** (tooltips **Prev change** and **Next change**) step through the changes in flow order, move both panes together and show which change of how many you are on; the current element glows blue. **Show all** takes both panes back to the whole diagram. Drilling into a collapsed subprocess on one side takes the other side into it too; if that version has no such subprocess, its label says **Not in this version**. A sequence flow or other connection that only moved along with its shapes is highlighted and counted, but not a step of its own. Both panes are read-only but you can pan, zoom and use the keyboard. Selecting an element in one pane selects it in the other; clicking the background clears both.

## See an element's XML changes

Blue only says that an element changed. To see what changed, such as an input mapping or a listener, select the element and click **Show XML changes** (the `</>` icon) on its context pad. VS Code opens a text diff of that element's XML from both versions in an editor group below the diagram diff. It leaves out the diagram layout and the elements inside it, such as a sub-process's tasks, so only the element's own configuration shows. Formatting, attribute order and a renamed namespace prefix never show as changes.

The tab names the element and the versions, as VS Code names its own diffs: for example `Activity_1 (XML): order.bpmn (Working Tree)` from Source Control, or `Activity_1 (XML): a.bpmn ↔ b.bpmn` for two compared files. An element that exists in one version only shows one empty side.

While the text diff is open, clicking another element in either pane moves it to that element; the pane you clicked in keeps the element in view, and the other pane follows. Once you close the text diff, selecting elements no longer opens it; click **Show XML changes** again. The text diff closes with the diagram diff.

The XML text diff is available in VS Code only; IntelliJ does not show it yet, and hosts without text diff tabs (some Theia versions) hide the entry.

The comparison uses [bpmn-js-differ](https://github.com/bpmn-io/bpmn-js-differ). The colours are Miragon's, as in [Diagit](https://github.com/Miragon/diagit).

## Next steps

- [DMN diff](/vscode/features/dmn-diff): the same view for decision models and their tables.
- [Linting](/vscode/features/linting): check the new version for errors.
- [Deployment](/vscode/features/deployment): ship the reviewed diagram.
