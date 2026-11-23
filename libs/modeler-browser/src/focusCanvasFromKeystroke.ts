/**
 * Focuses the canvas from a key handler and keeps it focused through the rest
 * of that keystroke: a browser's own Escape handling may blur the focused
 * element after the page's handlers ran, even when they prevented the default,
 * which drops the focus the handler has just given the canvas.
 */
export function focusCanvasFromKeystroke(focusCanvas: () => void): void {
    focusCanvas();
    setTimeout(() => {
        const focusDroppedIntoNothing =
            document.activeElement === null || document.activeElement === document.body;
        if (focusDroppedIntoNothing) {
            focusCanvas();
        }
    });
}
