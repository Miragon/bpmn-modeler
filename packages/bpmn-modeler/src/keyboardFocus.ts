/** @internal */

// Resolve services lazily because the guard can be wired before the modeler exists.
export interface KeyboardFocusDeps {
    // Include the sibling properties panel so its Escape events reach this canvas.
    roots: HTMLElement[];
    focusCanvas: () => void;
    isCanvasFocused: () => boolean;
    hasSelection: () => boolean;
    clearSelection: () => void;
    isSearchPadOpen: () => boolean;
    closeSearchPad: () => void;
    // Opt in only for single-instance hosts; body events cannot identify a modeler.
    handleGlobalEscape?: boolean;
}

// bpmn-js only receives shortcuts on the canvas SVG, so Escape must restore its focus.
export function installKeyboardFocus(deps: KeyboardFocusDeps): () => void {
    const handler = (event: KeyboardEvent): void => {
        if (event.key !== "Escape") return;

        const target = event.target;
        const isWithinInstance =
            target instanceof Node && deps.roots.some((root) => root.contains(target));
        const isGlobalBody = deps.handleGlobalEscape === true && target === document.body;
        if (!isWithinInstance && !isGlobalBody) return;

        // Let an editor consume Escape to close autocomplete before moving focus.
        if (event.defaultPrevented) return;

        // SearchPad closes on keyup; moving focus first would prevent it from receiving that event.
        if (deps.isSearchPadOpen()) {
            deps.closeSearchPad();
            deps.focusCanvas();
            return;
        }

        // Keep selection on the first Escape so returning from the panel preserves keyboard modeling.
        if (deps.isCanvasFocused() && deps.hasSelection()) {
            deps.clearSelection();
            return;
        }

        deps.focusCanvas();
    };
    // Bubble after overlays and label editors have had a chance to stop propagation.
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
}
