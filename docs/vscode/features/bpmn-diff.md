# BPMN diff

See what changed between two versions of a `.bpmn` file as two diagrams side by side, not as an XML diff.

<figure class="shot"><img src="/shots/bpmn-diff.png" alt="Two BPMN diagrams side by side with added, removed, changed and moved elements highlighted and a change counter above each pane"><figcaption>Before on the left, after on the right. Pan and zoom in one pane and the other follows.</figcaption></figure>

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

The bar above the panes counts the changes per type, leaving out types without a change. The arrows **‹** and **›** (tooltips **Prev change** and **Next change**) step through the changes in flow order, move both panes together and show which change of how many you are on; the current element glows blue. **Show all** takes both panes back to the whole diagram. A sequence flow or other connection that only moved along with its shapes is highlighted and counted, but not a step of its own. Both panes are read-only but you can pan, zoom and use the keyboard.

The comparison uses [bpmn-js-differ](https://github.com/bpmn-io/bpmn-js-differ). The colours are Miragon's, as in [Diagit](https://github.com/Miragon/diagit).

## Next steps

- [DMN diff](/vscode/features/dmn-diff): the same view for decision models and their tables.
- [Linting](/vscode/features/linting): check the new version for errors.
- [Deployment](/vscode/features/deployment): ship the reviewed diagram.
