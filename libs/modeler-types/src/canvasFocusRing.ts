import type { Disposer } from "./disposableStore";

export interface CanvasFocusRingOptions {
    /** The canvas container (`.djs-container`). */
    container: HTMLElement;
    isFocused: () => boolean;
    /** Adapts diagram-js's deduplicated `canvas.focus.changed` event. */
    onFocusChanged: (listener: (focused: boolean) => void) => void;
}

/**
 * Rings the canvas whenever it holds the keyboard, however it got the focus;
 * `canvasOverlays.css` draws the ring.
 *
 * An element shown from the canvas focus event rather than a
 * `:has(svg:focus)` selector, which a browser need not restyle when a script
 * moves the focus.
 */
export function installCanvasFocusRing({
    container,
    isFocused,
    onFocusChanged,
}: CanvasFocusRingOptions): Disposer {
    const ring = document.createElement("div");
    ring.className = "canvas-focus-ring";
    ring.setAttribute("aria-hidden", "true");
    ring.hidden = !isFocused();
    container.append(ring);
    onFocusChanged((focused) => {
        ring.hidden = !focused;
    });
    return () => ring.remove();
}
