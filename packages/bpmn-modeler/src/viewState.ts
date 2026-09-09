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

export interface ViewStateManagers {
    viewport: ViewportManager;
    rootElement: RootElementManager;
    selection: SelectionManager;
}

export function captureViewState(managers: ViewStateManagers): ViewState {
    return {
        rootElementId: managers.rootElement.getRootElementId(),
        viewport: managers.viewport.getViewport(),
        selectedElementIds: managers.selection.getSelectedElementIds(),
    };
}

// Restore the root first: coordinates are plane-relative, and root.set scrolls the canvas.
// Applying the saved viewport afterward overrides that automatic centering.
export function applyViewState(managers: ViewStateManagers, state: ViewState): void {
    managers.rootElement.setRootElementById(state.rootElementId);
    managers.viewport.setViewport(state.viewport);
    managers.selection.selectElementsByIds(state.selectedElementIds);
}
