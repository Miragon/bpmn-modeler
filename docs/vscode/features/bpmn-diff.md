# BPMN Diff

The BPMN Modeler extension replaces VS Code's default text-based diff for `.bpmn` files with two side-by-side readonly BPMN canvases. Element-level changes are highlighted with colour-coded markers driven by [`bpmn-js-differ`](https://github.com/bpmn-io/bpmn-js-differ) — the same library that powers [demo.bpmn.io/diff](https://demo.bpmn.io/diff) — and panning/zooming in one pane is mirrored to the other.

## Usage

1. Open the **Source Control** panel in VS Code.
2. Click any modified `.bpmn` file, or open a diff from `git diff`, `git log`, or a pull-request review.
3. VS Code opens the diff pair in a split editor; both sides render as BPMN canvases instead of XML text.

The left pane shows the **before** version (e.g. `HEAD` or the merge-base) and the right pane shows the **after** version (e.g. the working tree). Each pane is a `NavigatedViewer` — read-only but fully navigable with mouse wheel, drag, and keyboard.

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

- Four count slots — Added / Removed / Changed / Moved — each with its colour swatch. Counts are symmetric across the two sides.
- A **Prev change** / **Next change** navigator that cycles through the shared change list in sequence-flow order. The pane that owns the current element paints a gold glow; the other pane anchors its viewport on the nearest neighbour.
- Buttons are disabled when there are no changes at all.

## Viewport and Cursor Sync

Pan or zoom in either pane and the other pane follows. Click **Prev** / **Next** in either legend and both panes advance together — keeping the same element (or its nearest neighbour) centred on both sides.

---

For implementation details, see [Contributing → BPMN Diff internals](/vscode/contributing/architecture/bpmn-diff).
