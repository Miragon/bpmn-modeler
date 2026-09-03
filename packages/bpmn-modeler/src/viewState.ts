import type { ViewportData, ViewportManager } from "./viewport";
import type { RootElementManager } from "./rootElement";
import type { SelectionManager } from "./selection";

/**
 * A snapshot of everything about *where the user is looking* — the drill-down
 * plane, the viewbox, and the selection — captured from a live instance and
 * re-applied to another after an instance switch (View ↔ Design ↔ Implement) or
 * a destructive re-import (undo/redo host push, language switch).
 *
 * The point of a switch is to land the user back on the same plane, at the same
 * viewbox and selection, on the freshly created instance. Capture on the old
 * handle, `destroy()` it, create the new one, `loadDiagram(...)`, then apply.
 *
 * - `rootElementId` is the active canvas root (a collapsed sub-process
 *   drill-down). It is `undefined` when the canvas is on the top-level process
 *   plane: the implicit root's id is regenerated on every import, so it is never
 *   captured and applying `undefined` leaves the canvas on the top-level plane.
 * - `selectedElementIds` that no longer exist on apply are silently skipped, so
 *   a snapshot taken against a since-edited diagram still degrades gracefully.
 */
export interface ViewState {
    viewport: ViewportData;
    rootElementId?: string;
    selectedElementIds: string[];
}

/**
 * The three managers the capture/apply composition reads and writes. Kept
 * module-internal — consumers reach this through the composed
 * `captureViewState` / `applyViewState` handle methods, never the managers
 * directly.
 */
export interface ViewStateManagers {
    viewport: ViewportManager;
    rootElement: RootElementManager;
    selection: SelectionManager;
}

/**
 * Reads the live plane, viewbox, and selection off the managers into a plain
 * {@link ViewState}.
 */
export function captureViewState(m: ViewStateManagers): ViewState {
    return {
        rootElementId: m.rootElement.getRootElementId(),
        viewport: m.viewport.getViewport(),
        selectedElementIds: m.selection.getSelectedElementIds(),
    };
}

/**
 * Re-applies a captured {@link ViewState}, in the one order that works:
 * **root → viewport → selection**. Viewbox coordinates are plane-relative, so
 * the root must switch first; and the drill-down centring handler scrolls on
 * `root.set`, which the subsequent viewbox apply must overwrite — reversing the
 * two would leave the canvas centred on the plane rather than at the saved
 * viewbox. A missing root id (top-level plane) or missing element ids degrade
 * gracefully rather than throwing.
 */
export function applyViewState(m: ViewStateManagers, state: ViewState): void {
    m.rootElement.setRootElementById(state.rootElementId);
    m.viewport.setViewport(state.viewport);
    m.selection.selectElementsByIds(state.selectedElementIds);
}
