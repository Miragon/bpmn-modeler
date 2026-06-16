import { afterEach, describe, expect, it, vi } from "vitest";

import { ViewportManager } from "./viewport";

/**
 * Builds a `ViewportManager` over a fake bpmn-js canvas whose `viewbox()`
 * getter reports the given diagram bounding box (`inner`) and canvas pixel
 * size (`outer`). The setter is a spy so the computed viewbox can be asserted.
 */
function setup(inner: Rect, outer: { width: number; height: number }) {
    const viewbox = vi.fn((box?: unknown) => (box ? undefined : { inner, outer }));
    const zoom = vi.fn();
    const canvas = { viewbox, zoom };
    const manager = new ViewportManager((name: string) => {
        if (name === "canvas") return canvas as any;
        throw new Error(`unexpected service: ${name}`);
    });
    return { manager, viewbox, zoom };
}

type Rect = { x: number; y: number; width: number; height: number };

/** Screen position of a diagram point under the viewbox the setter received. */
function project(point: number, boxOrigin: number, scale: number): number {
    return (point - boxOrigin) * scale;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ViewportManager.fitViewport", () => {
    it("falls back to bpmn-js fit for an empty diagram", () => {
        const { manager, zoom, viewbox } = setup(
            { x: 0, y: 0, width: 0, height: 0 },
            { width: 1000, height: 800 },
        );

        manager.fitViewport();

        expect(zoom).toHaveBeenCalledWith("fit-viewport");
        // No manual viewbox is set in the degenerate case.
        expect(viewbox).toHaveBeenCalledTimes(1);
    });

    it("clears the palette and never zooms in past 1.0", () => {
        // Diagram authored far from the origin, smaller than the viewport.
        const inner = { x: 5000, y: 4000, width: 400, height: 200 };
        const { manager, viewbox } = setup(inner, { width: 1000, height: 800 });

        manager.fitViewport();

        const box = viewbox.mock.calls.at(-1)?.[0] as Rect;
        const scale = 1000 / box.width;
        expect(scale).toBe(1); // fits comfortably → no zoom in

        // Left edge of the diagram must land to the right of the 50px palette
        // fallback (+20 margin), so no element hides behind it.
        const leftPx = project(inner.x, box.x, scale);
        expect(leftPx).toBeGreaterThanOrEqual(70);
        const topPx = project(inner.y, box.y, scale);
        expect(topPx).toBeGreaterThanOrEqual(40);
    });

    it("zooms out a diagram larger than the inset area to fit", () => {
        const inner = { x: 0, y: 0, width: 4000, height: 3000 };
        const { manager, viewbox } = setup(inner, { width: 1000, height: 800 });

        manager.fitViewport();

        const box = viewbox.mock.calls.at(-1)?.[0] as Rect;
        const scale = 1000 / box.width;
        expect(scale).toBeLessThan(1);
        // The whole diagram width fits within the inset-reduced viewport.
        const rightPx = project(inner.x + inner.width, box.x, scale);
        expect(rightPx).toBeLessThanOrEqual(1000);
    });
});
