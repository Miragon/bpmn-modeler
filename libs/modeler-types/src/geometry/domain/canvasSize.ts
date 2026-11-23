/**
 * Smallest canvas box (px, both axes) worth fitting a diagram into. A host
 * that renders off-screen reports roughly one pixel rather than none, and a
 * fit against that succeeds arithmetically but scales the diagram to nothing.
 */
export const MIN_CANVAS_SIZE_PX = 40;

/**
 * Whether a viewbox can be applied without collapsing the diagram.
 *
 * Catches `NaN` from a box measured against an unlaid-out container, and the
 * `null` it turns into once persisted state has round-tripped through JSON.
 */
export function isUsableViewbox(
    viewbox: { x: number; y: number; width: number; height: number } | undefined,
): boolean {
    if (!viewbox) {
        return false;
    }
    const { x, y, width, height } = viewbox;
    return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(width) &&
        width > 0 &&
        Number.isFinite(height) &&
        height > 0
    );
}

/**
 * Whether the host has laid the canvas out at a size worth fitting into. An
 * unlaid-out container yields a NaN transform, which SVG renders as nothing.
 */
export function isCanvasSized(canvas: {
    viewbox(): { outer: { width: number; height: number } };
}): boolean {
    const { outer } = canvas.viewbox();
    return outer.width >= MIN_CANVAS_SIZE_PX && outer.height >= MIN_CANVAS_SIZE_PX;
}
