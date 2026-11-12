import type { Disposer } from "./disposableStore";

export interface FitViewportButtonOptions {
    /** The canvas container (`.djs-container`) the button floats in. */
    parent: HTMLElement;
    label: string;
    fit: () => void;
    focusCanvas: () => void;
    isCanvasFocused: () => boolean;
    /** Adapts diagram-js's deduplicated `canvas.focus.changed` event. */
    onCanvasFocusChanged: (listener: (focused: boolean) => void) => void;
}

// Material Symbols "fit_screen", viewBox 0 -960 960 960.
const FIT_SCREEN_SVG = `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M800-600v-120H680v-80h120q33 0 56.5 23.5T880-720v120h-80Zm-720 0v-120q0-33 23.5-56.5T160-800h120v80H160v120H80Zm600 440v-80h120v-120h80v120q0 33-23.5 56.5T800-160H680Zm-520 0q-33 0-56.5-23.5T80-240v-120h80v120h120v80H160Zm80-160v-320h480v320H240Zm80-80h320v-160H320v160Zm0 0v-160 160Z"/></svg>`;

/**
 * Mounts the canvas's "fit diagram to view" button, styled by `canvasOverlays.css`.
 * A pointer click hands the keyboard back to the canvas, so shortcuts keep
 * driving the diagram. While the canvas holds the keyboard the button carries
 * `data-canvas-focused`, which `canvasOverlays.css` draws as a dot: the canvas
 * shows its focus on the one control it owns instead of a frame of its own.
 */
export function installFitViewportButton({
    parent,
    label,
    fit,
    focusCanvas,
    isCanvasFocused,
    onCanvasFocusChanged,
}: FitViewportButtonOptions): Disposer {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fit-viewport-button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = FIT_SCREEN_SVG;
    button.addEventListener("click", (event) => {
        fit();
        const pressedByPointer = event.detail > 0;
        if (pressedByPointer) {
            focusCanvas();
        }
    });
    button.toggleAttribute("data-canvas-focused", isCanvasFocused());
    onCanvasFocusChanged((focused) => {
        button.toggleAttribute("data-canvas-focused", focused);
    });
    parent.append(button);
    return () => button.remove();
}
