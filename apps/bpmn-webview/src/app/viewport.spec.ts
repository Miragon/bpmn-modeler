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
    const listeners: Record<string, (event: any) => void> = {};
    const eventBus = {
        on: (event: string, handler: (event: any) => void) => {
            listeners[event] = handler;
        },
    };
    const manager = new ViewportManager((name: string) => {
        if (name === "canvas") return canvas as any;
        if (name === "eventBus") return eventBus as any;
        throw new Error(`unexpected service: ${name}`);
    });
    /** Fires a `canvas.viewbox.changed` event at the manager's subscriber. */
    const emitViewboxChanged = (box: Partial<Rect>) =>
        listeners["canvas.viewbox.changed"]({ viewbox: box });
    return { manager, viewbox, zoom, emitViewboxChanged };
}

type Rect = { x: number; y: number; width: number; height: number };

/** Calls that *set* a viewbox, i.e. that passed a box to the accessor. */
function setterCalls(viewbox: ReturnType<typeof vi.fn>): unknown[] {
    return viewbox.mock.calls.filter((call) => call.length > 0 && call[0] !== undefined);
}

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

        expect(manager.fitViewport()).toBe(true);

        expect(zoom).toHaveBeenCalledWith("fit-viewport");
        // No manual viewbox is set in the degenerate case.
        expect(setterCalls(viewbox)).toHaveLength(0);
    });

    // Fitting against an unlaid-out container is what produced the NaN
    // transform that renders nothing.
    it.each([
        ["not laid out at all", { width: 0, height: 0 }],
        ["laid out at the IntelliJ pre-warm size", { width: 1, height: 1 }],
        ["too short to fit into", { width: 1200, height: 8 }],
    ])("applies nothing when the canvas is %s", (_case, outer) => {
        const { manager, zoom, viewbox } = setup({ x: 150, y: 80, width: 600, height: 300 }, outer);

        expect(manager.fitViewport()).toBe(false);

        expect(zoom).not.toHaveBeenCalled();
        expect(setterCalls(viewbox)).toHaveLength(0);
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

    // An unstyled palette is a full-width block; reserving it collapsed the
    // fit to an invisible diagram on a perfectly sized canvas.
    it("ignores an unstyled, full-width palette", () => {
        const palette = document.createElement("div");
        palette.className = "djs-palette";
        document.body.appendChild(palette);
        vi.spyOn(palette, "getBoundingClientRect").mockReturnValue({ width: 1000 } as DOMRect);

        const inner = { x: 0, y: 0, width: 1176, height: 537 };
        const { manager, viewbox } = setup(inner, { width: 1000, height: 800 });

        manager.fitViewport();

        const box = viewbox.mock.calls.at(-1)?.[0] as Rect;
        const scale = 1000 / box.width;
        // At least half the canvas stays available, so the diagram is visible.
        expect(inner.width * scale).toBeGreaterThan(400);
        palette.remove();
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

describe("ViewportManager.setViewport", () => {
    const inner = { x: 150, y: 80, width: 600, height: 300 };

    it("applies a usable saved viewbox verbatim", () => {
        const { manager, viewbox } = setup(inner, { width: 1000, height: 800 });
        const saved = { x: 10, y: 20, width: 500, height: 400 };

        expect(manager.setViewport(saved)).toBe(true);

        expect(setterCalls(viewbox)).toEqual([[saved]]);
    });

    // `JSON.stringify` writes NaN out as null, so this is the shape a viewbox
    // saved during a failed restore comes back in.
    it.each([
        [
            "null members from a poisoned persisted state",
            { x: null, y: null, width: null, height: null },
        ],
        ["NaN members", { x: NaN, y: NaN, width: NaN, height: NaN }],
        ["zero area", { x: 0, y: 0, width: 0, height: 0 }],
    ])("falls back to a fit for a saved viewbox with %s", (_case, saved) => {
        const { manager, viewbox } = setup(inner, { width: 1000, height: 800 });

        expect(manager.setViewport(saved as any)).toBe(true);

        // The fit ran instead: the applied box is computed, not the saved one.
        const applied = setterCalls(viewbox).at(-1) as [Rect];
        expect(applied[0]).not.toEqual(saved);
        expect(applied[0].width).toBeGreaterThan(0);
    });

    it("applies nothing while the canvas is unsized", () => {
        const { manager, viewbox } = setup(inner, { width: 0, height: 0 });

        expect(manager.setViewport({ x: 10, y: 20, width: 500, height: 400 })).toBe(false);

        expect(setterCalls(viewbox)).toHaveLength(0);
    });
});

describe("ViewportManager.onViewportChanged", () => {
    const inner = { x: 150, y: 80, width: 600, height: 300 };

    it("reports a usable viewbox after the debounce", () => {
        vi.useFakeTimers();
        const { manager, emitViewboxChanged } = setup(inner, { width: 1000, height: 800 });
        const cb = vi.fn();
        manager.onViewportChanged(cb);

        emitViewboxChanged({ x: 1, y: 2, width: 300, height: 200 });
        vi.advanceTimersByTime(100);

        expect(cb).toHaveBeenCalledWith({ x: 1, y: 2, width: 300, height: 200 });
        vi.useRealTimers();
    });

    // Persisting a NaN viewbox is what makes the blank canvas survive a reopen.
    it("never reports a degenerate viewbox", () => {
        vi.useFakeTimers();
        const { manager, emitViewboxChanged } = setup(inner, { width: 0, height: 0 });
        const cb = vi.fn();
        manager.onViewportChanged(cb);

        emitViewboxChanged({ x: 0, y: 0, width: NaN, height: NaN });
        vi.advanceTimersByTime(100);

        expect(cb).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});
