import { MIN_CANVAS_SIZE_PX } from "./canvasResize";

const FIT_MARGIN = 40;
// Keeps the former 50px palette + 20px margin when there is no palette to measure.
const UNMEASURED_PALETTE_EDGE = 30;

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The slice of diagram-js's `Canvas` a fit needs. */
export interface FittableCanvas {
    viewbox(): { inner: Box; outer: { width: number; height: number } };
    viewbox(box: Box): void;
    zoom(target: "fit-viewport"): void;
    getContainer(): HTMLElement;
}

/**
 * Whether the host has laid the canvas out at a size worth fitting into. An
 * unlaid-out container yields a NaN transform, which SVG renders as nothing.
 */
export function isCanvasSized(canvas: FittableCanvas): boolean {
    const { outer } = canvas.viewbox();
    return outer.width >= MIN_CANVAS_SIZE_PX && outer.height >= MIN_CANVAS_SIZE_PX;
}

/**
 * Fits the diagram into the canvas, centred in the area right of the palette.
 *
 * diagram-js's own `zoom("fit-viewport")` ignores the palette and the controls
 * painted on top of the canvas, so wide diagrams end up behind the palette.
 * The scale is capped at 1.0: a fit never zooms in.
 *
 * @returns `false` if nothing was applied, so the caller can retry.
 */
export function fitCanvasToContent(canvas: FittableCanvas): boolean {
    if (!isCanvasSized(canvas)) {
        return false;
    }
    const { inner, outer } = canvas.viewbox();

    if (!inner.width || !inner.height) {
        canvas.zoom("fit-viewport");
        return true;
    }

    // An unstyled palette can measure as full-width; cap insets so it cannot consume the viewport.
    const maxInsetX = outer.width / 4;
    const maxInsetY = outer.height / 4;
    const inset = {
        top: Math.min(FIT_MARGIN, maxInsetY),
        right: Math.min(FIT_MARGIN, maxInsetX),
        bottom: Math.min(FIT_MARGIN, maxInsetY),
        left: Math.min(paletteRightEdge(canvas.getContainer()) + FIT_MARGIN, maxInsetX),
    };

    const availableWidth = outer.width - inset.left - inset.right;
    const availableHeight = outer.height - inset.top - inset.bottom;

    const scale = Math.min(1, availableWidth / inner.width, availableHeight / inner.height);

    const marginX = inset.left + (availableWidth - inner.width * scale) / 2;
    const marginY = inset.top + (availableHeight - inner.height * scale) / 2;

    canvas.viewbox({
        x: inner.x - marginX / scale,
        y: inner.y - marginY / scale,
        width: outer.width / scale,
        height: outer.height / scale,
    });
    return true;
}

function paletteRightEdge(container: Element): number {
    const palette = container.querySelector(".djs-palette");
    if (!palette) {
        return UNMEASURED_PALETTE_EDGE;
    }
    return palette.getBoundingClientRect().right - container.getBoundingClientRect().left;
}
