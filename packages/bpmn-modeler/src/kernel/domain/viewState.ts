/**
 * A canvas viewbox snapshot — the position and zoom {@link ViewportManager}
 * reads and restores. The host persists it (VS Code `setState`) alongside the
 * rest of its webview state.
 */
export interface ViewportData {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Persisted so the exact zoom survives a container-size change on restore. */
    scale?: number;
}

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
 *   An empty captured selection restores to "nothing selected".
 */
export interface ViewState {
    viewport: ViewportData;
    rootElementId?: string;
    selectedElementIds: string[];
}
