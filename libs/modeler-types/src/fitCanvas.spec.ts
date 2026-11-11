import { afterEach, describe, expect, it, vi } from "vitest";

import { type FittableCanvas, fitCanvasToContent, isCanvasSized } from "./fitCanvas";

type Rect = { x: number; y: number; width: number; height: number };

/**
 * A fake diagram-js canvas whose `viewbox()` getter reports the given diagram
 * bounding box (`inner`) and canvas pixel size (`outer`). The setter is a spy
 * so the computed viewbox can be asserted.
 */
function setup(inner: Rect, outer: { width: number; height: number }) {
    // The palette lookup is scoped to this canvas's own container, so the fake
    // canvas carries one; tests append their palette into it (or a decoy outside).
    const container = document.createElement("div");
    const viewbox = vi.fn((box?: unknown) => (box ? undefined : { inner, outer }));
    const zoom = vi.fn();
    const canvas = { viewbox, zoom, getContainer: () => container } as unknown as FittableCanvas;
    return { canvas, viewbox, zoom, container };
}

/** Calls that *set* a viewbox, i.e. that passed a box to the accessor. */
function setterCalls(viewbox: ReturnType<typeof vi.fn>): unknown[] {
    return viewbox.mock.calls.filter((call) => call.length > 0 && call[0] !== undefined);
}

function lastSetBox(viewbox: ReturnType<typeof vi.fn>): Rect {
    const calls = viewbox.mock.calls;
    return calls[calls.length - 1][0] as Rect;
}

/** Screen position of a diagram point under the viewbox the setter received. */
function project(point: number, boxOrigin: number, scale: number): number {
    return (point - boxOrigin) * scale;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("isCanvasSized", () => {
    it.each([
        [{ width: 0, height: 0 }, false],
        [{ width: 1, height: 1 }, false],
        [{ width: 1200, height: 8 }, false],
        [{ width: 1000, height: 800 }, true],
    ])("reports %o as sized: %s", (outer, sized) => {
        const { canvas } = setup({ x: 0, y: 0, width: 10, height: 10 }, outer);

        expect(isCanvasSized(canvas)).toBe(sized);
    });
});

describe("fitCanvasToContent", () => {
    it("falls back to the diagram-js fit for an empty diagram", () => {
        const { canvas, zoom, viewbox } = setup(
            { x: 0, y: 0, width: 0, height: 0 },
            { width: 1000, height: 800 },
        );

        expect(fitCanvasToContent(canvas)).toBe(true);

        expect(zoom).toHaveBeenCalledWith("fit-viewport");
        expect(setterCalls(viewbox)).toHaveLength(0);
    });

    // Fitting against an unlaid-out container is what produced the NaN
    // transform that renders nothing.
    it.each([
        ["not laid out at all", { width: 0, height: 0 }],
        ["laid out at the IntelliJ pre-warm size", { width: 1, height: 1 }],
        ["too short to fit into", { width: 1200, height: 8 }],
    ])("applies nothing when the canvas is %s", (_case, outer) => {
        const { canvas, zoom, viewbox } = setup({ x: 150, y: 80, width: 600, height: 300 }, outer);

        expect(fitCanvasToContent(canvas)).toBe(false);

        expect(zoom).not.toHaveBeenCalled();
        expect(setterCalls(viewbox)).toHaveLength(0);
    });

    it("clears the palette and never zooms in past 1.0", () => {
        // Diagram authored far from the origin, smaller than the viewport.
        const inner = { x: 5000, y: 4000, width: 400, height: 200 };
        const { canvas, viewbox } = setup(inner, { width: 1000, height: 800 });

        fitCanvasToContent(canvas);

        const box = lastSetBox(viewbox);
        const scale = 1000 / box.width;
        expect(scale).toBe(1);

        // Left edge of the diagram must land to the right of the 50px palette
        // fallback (+20 margin), so no element hides behind it.
        const leftPx = project(inner.x, box.x, scale);
        expect(leftPx).toBeGreaterThanOrEqual(70);
        const topPx = project(inner.y, box.y, scale);
        expect(topPx).toBeGreaterThanOrEqual(40);
    });

    // An unstyled palette is a full-width block; reserving it collapsed the
    // fit to an invisible diagram on a perfectly sized canvas.
    it("ignores an unstyled, full-width palette inside its own container", () => {
        const inner = { x: 0, y: 0, width: 1176, height: 537 };
        const { canvas, viewbox, container } = setup(inner, { width: 1000, height: 800 });

        const palette = document.createElement("div");
        palette.className = "djs-palette";
        container.appendChild(palette);
        vi.spyOn(palette, "getBoundingClientRect").mockReturnValue({
            left: 0,
            right: 1000,
            width: 1000,
        } as DOMRect);

        fitCanvasToContent(canvas);

        const box = lastSetBox(viewbox);
        const scale = 1000 / box.width;
        // At least half the canvas stays available, so the diagram is visible.
        expect(inner.width * scale).toBeGreaterThan(400);
    });

    // With two modelers on a page a bare document query would measure the
    // first (foreign) palette; scoping to the container ignores it entirely.
    it("ignores a palette that belongs to another modeler's container", () => {
        const inner = { x: 5000, y: 4000, width: 400, height: 200 };
        const { canvas, viewbox } = setup(inner, { width: 1000, height: 800 });

        const decoy = document.createElement("div");
        decoy.className = "djs-palette";
        document.body.appendChild(decoy);
        vi.spyOn(decoy, "getBoundingClientRect").mockReturnValue({ width: 1000 } as DOMRect);

        fitCanvasToContent(canvas);

        const box = lastSetBox(viewbox);
        const scale = 1000 / box.width;
        // The 50px fallback is used (our container has no palette), not the decoy.
        expect(scale).toBe(1);
        const leftPx = project(inner.x, box.x, scale);
        expect(leftPx).toBeGreaterThanOrEqual(70);
        decoy.remove();
    });

    // The palette floats inset from the canvas edge, so its width alone put the
    // first shape flush against it once the diagram filled the width.
    it("leaves the same gap to the palette as to the right edge", () => {
        const inner = { x: 0, y: 0, width: 2000, height: 400 };
        const { canvas, viewbox, container } = setup(inner, { width: 1000, height: 800 });
        const palette = document.createElement("div");
        palette.className = "djs-palette";
        container.appendChild(palette);
        vi.spyOn(palette, "getBoundingClientRect").mockReturnValue({
            left: 12,
            right: 60,
            width: 48,
        } as DOMRect);

        fitCanvasToContent(canvas);

        const box = lastSetBox(viewbox);
        const scale = 1000 / box.width;
        const gapToPalette = project(inner.x, box.x, scale) - 60;
        const gapToRightEdge = 1000 - project(inner.x + inner.width, box.x, scale);
        expect(gapToPalette).toBeCloseTo(40);
        expect(gapToRightEdge).toBeCloseTo(40);
    });

    it("zooms out a diagram larger than the inset area to fit", () => {
        const inner = { x: 0, y: 0, width: 4000, height: 3000 };
        const { canvas, viewbox } = setup(inner, { width: 1000, height: 800 });

        fitCanvasToContent(canvas);

        const box = lastSetBox(viewbox);
        const scale = 1000 / box.width;
        expect(scale).toBeLessThan(1);
        const rightPx = project(inner.x + inner.width, box.x, scale);
        expect(rightPx).toBeLessThanOrEqual(1000);
    });
});
