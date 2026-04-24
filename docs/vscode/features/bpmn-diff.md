# BPMN Diff View

The BPMN Modeler extension replaces VS Code's default text-based diff for `.bpmn` files with two side-by-side readonly BPMN canvases. Element-level changes are highlighted with colour-coded markers driven by [`bpmn-js-differ`](https://github.com/bpmn-io/bpmn-js-differ) — the same library that powers [demo.bpmn.io/diff](https://demo.bpmn.io/diff) — and panning/zooming in one pane is mirrored to the other.

The diff view opens from two entry points, which share the same UI:

- **Source Control / Git** — any place VS Code opens a text diff for a `.bpmn` file.
- **Explorer context menu** — pick two `.bpmn` files, either with a multi-selection or one right-click at a time.

## Usage — Source Control

1. Open the **Source Control** panel in VS Code.
2. Click any modified `.bpmn` file, or open a diff from `git diff`, `git log`, or a pull-request review.
3. VS Code opens the diff pair in a split editor; both sides render as BPMN canvases instead of XML text.

The left pane shows the **before** version (e.g. `HEAD` or the merge-base) and the right pane shows the **after** version (e.g. the working tree).

## Usage — Compare two files

### Pick both in one click

When the two files are visible side by side in the Explorer:

1. Hold <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> and click the two `.bpmn` files so both are selected.
2. Right-click either one → **BPMN Modeler: Compare Selected**.
3. A diff tab opens with two BPMN canvases — the first-selected file on the left (`before`), the second on the right (`after`).

### Pick them one at a time

Useful when the two files live in different Explorer folders, or when you want to pair a file you selected earlier against another one you find later.

1. Right-click the first `.bpmn` file → **BPMN Modeler: Select for Compare**. A status-bar note confirms the pick.
2. Right-click the second `.bpmn` file → **BPMN Modeler: Compare with Selected**.
3. The diff tab opens as above.

Selection is in-memory only; reloading the window or running the compare clears it. The menu mirrors VS Code's built-in compare UX: **Select for Compare** and **Compare with Selected** disappear while two files are multi-selected — **Compare Selected** takes their place.

The same viewport/cursor sync and highlight legend that ships for Git diffs applies here — the two origins are indistinguishable in the UI. Each pane is a `NavigatedViewer`: read-only but fully navigable with mouse wheel, drag, and keyboard.

## Highlights

`bpmn-js-differ` classifies every element into one of four categories. Each category has its own marker style:

| Category        | Stroke colour      | Visible on     | Meaning                                                            |
|-----------------|--------------------|----------------|--------------------------------------------------------------------|
| **Added**       | Green (`#52b415`)  | After pane     | Element does not exist in the before diagram.                      |
| **Removed**     | Red (`#cc0000`)    | Before pane    | Element was deleted in the after diagram.                          |
| **Changed**     | Blue (`#316fbe`)   | Both panes     | An attribute changed (name, condition, implementation, …).         |
| **Moved**       | Dashed stroke      | Both panes     | Only the layout (`x`, `y`, waypoints) changed — semantics are identical. |

Colours intentionally match the bpmn.io/diff demo so users familiar with that UI see the same visual cues. Sequence flows receive the same stroke colour on their path and arrowhead.

## Legend Chip

A floating legend sits at the top-centre of **both panes**:

- Four count slots — Added / Removed / Changed / Moved — each with its colour swatch.  Counts are symmetric across the two sides; both panes show the same numbers.
- A **Prev change** / **Next change** navigator that cycles through the shared change list in sequence-flow order.
- Clicking a nav button on either pane advances **both** cursors.  The pane that owns the current id paints a gold glow; the other pane anchors its viewport on the nearest neighbour that does exist locally and clears its own selection marker so the user is not misled.  For elements that exist on both panes, both will glow simultaneously.
- Buttons are disabled when there are no changes at all.

## Viewport and Cursor Sync

Pan or zoom in either pane and the other pane follows. Click **Prev** / **Next** in either legend and both panes advance together — keeping the same element (or its nearest neighbour) centred on both sides.

---

For implementation details, see [Contributing → BPMN Diff internals](/vscode/contributing/architecture/bpmn-diff).
