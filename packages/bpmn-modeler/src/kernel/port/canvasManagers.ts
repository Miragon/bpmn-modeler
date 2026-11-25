import type { ViewportData } from "../domain/viewState";

/**
 * Reads, restores, and subscribes to canvas viewbox changes.
 *
 * Deliberately an interface, not the implementing class: every subpath's d.ts
 * roll-up carries its own copy of this declaration, and a class with private
 * members is nominally typed — two copies would be mutually unassignable,
 * breaking the documented cross-subpath wiring (e.g. a `/viewer` handle passed
 * to a `/mode` session).
 */
export interface ViewportManager {
    /** Returns the current canvas viewbox (position and zoom level). */
    getViewport(): ViewportData;

    /**
     * Whether the host has laid the canvas out at a size worth fitting into.
     * An unlaid-out container yields a NaN transform, which SVG renders as
     * nothing.
     */
    isCanvasSized(): boolean;

    /**
     * Restores the canvas to a previously saved viewbox. Falls back to
     * {@link fitViewport} for a box that cannot be applied safely.
     *
     * @param viewport The viewbox to apply.
     * @returns `false` if nothing was applied, so the caller can retry.
     */
    setViewport(viewport: ViewportData): boolean;

    /**
     * The observer callback driving the initial fit.
     *
     * @returns `true` once the initial viewport is decided; `false` while the
     *   caller should keep retrying.
     */
    applyInitialViewportOnce(): boolean;

    /** Re-arms the initial-viewport decision for a fresh diagram. */
    resetInitialViewportDecision(): void;

    /**
     * Fits the diagram into the viewport on a fresh file open (no saved
     * viewbox), clearing the palette/controls chrome. Scale is capped at 1.0 —
     * never zoom in.
     *
     * @returns `false` if nothing was applied, so the caller can retry.
     */
    fitViewport(): boolean;

    /**
     * Centres the viewport on `id`, enforcing a minimum focus zoom. Like
     * {@link setViewport}, a focus decides the initial viewport, so a focus
     * right after `loadDiagram` survives the delayed initial fit. Returns
     * `false`, leaving the viewport untouched, when the element is not on the
     * canvas (e.g. a stale lint finding) or the canvas has no size yet.
     */
    centerOnElement(id: string): boolean;

    /**
     * Subscribes to canvas viewbox changes with a 100 ms debounce; only the
     * final position after a pan/zoom gesture is delivered.
     *
     * @param cb Callback invoked with the new {@link ViewportData} after each change.
     * @returns a disposer that unsubscribes the listener and cancels any pending
     *   debounced callback — call it when tearing the surface down.
     */
    onViewportChanged(cb: (viewport: ViewportData) => void): () => void;
}

/**
 * Reads, writes, and subscribes to element selection changes.
 *
 * An interface rather than the implementing class for the same reason as
 * `ViewportManager`: each subpath's d.ts roll-up duplicates the declaration,
 * and only a structural type keeps the copies mutually assignable.
 */
export interface SelectionManager {
    getSelectedElementIds(): string[];

    /**
     * Silently skips IDs that no longer exist in the diagram. An empty or
     * all-missing `ids` clears the selection, so a snapshot captured with
     * nothing selected restores faithfully.
     */
    selectElementsByIds(ids: string[]): void;

    /**
     * @returns a disposer that detaches the listener — call it when tearing the
     *   surface down so repeated subscribe cycles don't accumulate listeners.
     */
    onSelectionChanged(cb: (elementIds: string[]) => void): () => void;
}

/**
 * Reads, writes, and subscribes to the active canvas root element.
 *
 * The root element determines which plane is visible — the top-level
 * process or a collapsed sub-process drill-down.
 *
 * An interface rather than the implementing class for the same reason as
 * `ViewportManager`: each subpath's d.ts roll-up duplicates the declaration,
 * and only a structural type keeps the copies mutually assignable.
 */
export interface RootElementManager {
    /**
     * Returns the ID of the active canvas root, or `undefined` when the
     * canvas is on the implicit (top-level process) root — which should
     * not be persisted because its ID is regenerated on every import.
     */
    getRootElementId(): string | undefined;

    /**
     * Switches the canvas to the root element with the given ID.
     *
     * @returns `false` when the element does not exist or is already the
     *   current root, so the caller knows no plane switch occurred.
     */
    setRootElementById(id: string | undefined): boolean;

    /**
     * Subscribes to root element changes on the event bus.
     *
     * @param cb Callback invoked with the new root element's ID (or
     *   `undefined` for the implicit root) whenever the active plane changes.
     * @returns a disposer that detaches the listener — call it when tearing the
     *   surface down so repeated subscribe cycles don't accumulate listeners.
     */
    onRootChanged(cb: (rootElementId: string | undefined) => void): () => void;
}
