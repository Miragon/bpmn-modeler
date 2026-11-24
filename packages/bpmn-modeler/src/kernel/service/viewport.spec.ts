import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasViewportManager, type ViewportData } from "./viewport";
import type { CoreServiceAccessor } from "./coreServices";

/**
 * Builds a `ViewportManager` over a fake bpmn-js canvas whose `viewbox()`
 * getter reports the given diagram bounding box (`inner`) and canvas pixel
 * size (`outer`). The setter is a spy so the computed viewbox can be asserted.
 */
function setup(inner: Rect, outer: { width: number; height: number }) {
    // The palette lookup is scoped to this canvas's own container, so the fake
    // canvas carries one; tests append their palette into it (or a decoy outside).
    const container = document.createElement("div");
    const viewbox = vi.fn((box?: unknown) => (box ? undefined : { inner, outer }));
    const zoom = vi.fn();
    const canvas = { viewbox, zoom, getContainer: () => container };
    const listeners: Record<string, ((event: unknown) => void)[]> = {};
    const eventBus = {
        on: (event: string, handler: (event: unknown) => void) => {
            (listeners[event] ??= []).push(handler);
        },
        off: (event: string, handler: (event: unknown) => void) => {
            const handlers = listeners[event];
            if (!handlers) return;
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        },
    };
    const manager = new CanvasViewportManager(((name: string) => {
        if (name === "canvas") return canvas;
        if (name === "eventBus") return eventBus;
        throw new Error(`unexpected service: ${name}`);
    }) as unknown as CoreServiceAccessor);
    const emit = (event: string, payload?: unknown) =>
        (listeners[event] ?? []).forEach((handler) => handler(payload));
    /** Fires a `canvas.viewbox.changed` event at the manager's subscriber. */
    const emitViewboxChanged = (box: Partial<Rect>) =>
        emit("canvas.viewbox.changed", { viewbox: box });
    const listenerCount = (event: string) => (listeners[event] ?? []).length;
    return { manager, viewbox, zoom, emitViewboxChanged, emit, listenerCount, container };
}

type Rect = { x: number; y: number; width: number; height: number; scale?: number };

/** Calls that *set* a viewbox, i.e. that passed a box to the accessor. */
function setterCalls(viewbox: ReturnType<typeof vi.fn>): unknown[] {
    return viewbox.mock.calls.filter((call) => call.length > 0 && call[0] !== undefined);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ViewportManager.fitViewport", () => {
    // The fit rules themselves are covered by fitCanvas.spec.ts in modeler-types.
    it("fits through the shared canvas fit", () => {
        const { manager, zoom } = setup(
            { x: 0, y: 0, width: 0, height: 0 },
            { width: 1000, height: 800 },
        );

        expect(manager.fitViewport()).toBe(true);
        expect(zoom).toHaveBeenCalledWith("fit-viewport");
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

        expect(manager.setViewport(saved as ViewportData)).toBe(true);

        // The fit ran instead: the applied box is computed, not the saved one.
        const applied = setterCalls(viewbox).at(-1) as [Rect];
        expect(applied[0]).not.toEqual(saved);
        expect(applied[0].width).toBeGreaterThan(0);
    });

    it("restores the same zoom when outer differs from save-time size", () => {
        const saveOuter = { width: 1200, height: 900 };
        const restoreOuter = { width: 800, height: 600 };
        const savedScale = 1.5;
        const saved = {
            x: 10,
            y: 20,
            width: saveOuter.width / savedScale,
            height: saveOuter.height / savedScale,
            scale: savedScale,
        };
        const { manager, viewbox } = setup(inner, restoreOuter);

        expect(manager.setViewport(saved)).toBe(true);

        const applied = setterCalls(viewbox).at(-1) as [Rect];
        const appliedScale = restoreOuter.width / applied[0].width;
        expect(appliedScale).toBeCloseTo(savedScale);
        expect(applied[0].x).toBe(saved.x);
        expect(applied[0].y).toBe(saved.y);
    });

    it("applies nothing while the canvas is unsized", () => {
        const { manager, viewbox } = setup(inner, { width: 0, height: 0 });

        expect(manager.setViewport({ x: 10, y: 20, width: 500, height: 400 })).toBe(false);

        expect(setterCalls(viewbox)).toHaveLength(0);
    });
});

describe("ViewportManager initial-viewport decision", () => {
    const inner = { x: 150, y: 80, width: 600, height: 300 };
    const saved = { x: 10, y: 20, width: 500, height: 400 };

    // A fake canvas whose outer size can grow between calls, to model a host
    // that mounts the container before laying it out.
    function setupResizable(initialOuter: { width: number; height: number }) {
        let outer = initialOuter;
        const container = document.createElement("div");
        const viewbox = vi.fn((box?: unknown) => (box ? undefined : { inner, outer }));
        const zoom = vi.fn();
        const canvas = { viewbox, zoom, getContainer: () => container };
        const manager = new CanvasViewportManager(((name: string) => {
            if (name === "canvas") return canvas;
            throw new Error(`unexpected service: ${name}`);
        }) as unknown as CoreServiceAccessor);
        const sizeCanvas = (next: { width: number; height: number }) => {
            outer = next;
        };
        return { manager, viewbox, zoom, sizeCanvas };
    }

    it("stashes a usable box while unsized and applies it on the next delivery once sized", () => {
        const { manager, viewbox, sizeCanvas } = setupResizable({ width: 0, height: 0 });

        expect(manager.setViewport(saved)).toBe(false);
        expect(setterCalls(viewbox)).toHaveLength(0);

        sizeCanvas({ width: 1000, height: 800 });
        expect(manager.applyInitialViewportOnce()).toBe(true);
        expect(setterCalls(viewbox)).toEqual([[saved]]);
    });

    it("makes applyInitialViewportOnce a no-op once the viewport is decided", () => {
        const { manager, viewbox, zoom } = setupResizable({ width: 1000, height: 800 });

        expect(manager.setViewport(saved)).toBe(true);
        const callsAfterSet = viewbox.mock.calls.length;

        expect(manager.applyInitialViewportOnce()).toBe(true);
        expect(viewbox.mock.calls.length).toBe(callsAfterSet);
        expect(zoom).not.toHaveBeenCalled();
    });

    it("fits when no viewport was stashed", () => {
        const { manager, viewbox } = setupResizable({ width: 1000, height: 800 });

        expect(manager.applyInitialViewportOnce()).toBe(true);
        expect(setterCalls(viewbox).length).toBeGreaterThan(0);
    });

    it("re-arms after resetInitialViewportDecision so the next delivery fits again", () => {
        const { manager, viewbox } = setupResizable({ width: 1000, height: 800 });

        expect(manager.applyInitialViewportOnce()).toBe(true);
        const before = setterCalls(viewbox).length;

        manager.resetInitialViewportDecision();
        expect(manager.applyInitialViewportOnce()).toBe(true);
        expect(setterCalls(viewbox).length).toBeGreaterThan(before);
    });

    it("settles the decision on centerOnElement so the delayed fit keeps the focus", () => {
        const { manager, viewbox, zoom } = setupFocus(
            { x: 0, y: 0, width: 1000, height: 800 },
            { width: 1000, height: 800 },
            { Task_1: { x: 100, y: 100, width: 100, height: 100 } },
        );

        expect(manager.centerOnElement("Task_1")).toBe(true);
        const settersAfterFocus = setterCalls(viewbox).length;

        expect(manager.applyInitialViewportOnce()).toBe(true);
        expect(setterCalls(viewbox)).toHaveLength(settersAfterFocus);
        expect(zoom).not.toHaveBeenCalled();
    });

    it("falls back to a fit for an unusable box and latches the decision", () => {
        const { manager, viewbox } = setupResizable({ width: 1000, height: 800 });

        expect(
            manager.setViewport({ x: NaN, y: NaN, width: NaN, height: NaN } as ViewportData),
        ).toBe(true);
        const callsAfterSet = viewbox.mock.calls.length;

        expect(manager.applyInitialViewportOnce()).toBe(true);
        expect(viewbox.mock.calls.length).toBe(callsAfterSet);
    });
});

describe("ViewportManager.onViewportChanged", () => {
    const inner = { x: 150, y: 80, width: 600, height: 300 };

    it("reports a usable viewbox with scale after the debounce", () => {
        vi.useFakeTimers();
        const { manager, emitViewboxChanged } = setup(inner, { width: 1000, height: 800 });
        const cb = vi.fn();
        manager.onViewportChanged(cb);

        emitViewboxChanged({ x: 1, y: 2, width: 300, height: 200, scale: 2.5 });
        vi.advanceTimersByTime(100);

        expect(cb).toHaveBeenCalledWith({ x: 1, y: 2, width: 300, height: 200, scale: 2.5 });
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

    it("cancels a pending debounce on diagram.destroy", () => {
        vi.useFakeTimers();
        const { manager, emitViewboxChanged, emit } = setup(inner, { width: 1000, height: 800 });
        const cb = vi.fn();
        manager.onViewportChanged(cb);

        emitViewboxChanged({ x: 1, y: 2, width: 300, height: 200, scale: 2.5 });
        emit("diagram.destroy");
        vi.advanceTimersByTime(100);

        expect(cb).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it("cancels a pending debounce when the disposer is called", () => {
        vi.useFakeTimers();
        const { manager, emitViewboxChanged } = setup(inner, { width: 1000, height: 800 });
        const cb = vi.fn();
        const dispose = manager.onViewportChanged(cb);

        emitViewboxChanged({ x: 1, y: 2, width: 300, height: 200, scale: 2.5 });
        dispose();
        vi.advanceTimersByTime(100);

        expect(cb).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it("detaches its listeners on dispose and tolerates a double dispose", () => {
        const { manager, listenerCount } = setup(inner, { width: 1000, height: 800 });

        for (let i = 0; i < 3; i++) {
            const dispose = manager.onViewportChanged(vi.fn());
            dispose();
            dispose();
        }

        expect(listenerCount("canvas.viewbox.changed")).toBe(0);
        expect(listenerCount("diagram.destroy")).toBe(0);
    });
});

// The viewbox getter reports the current box; the setter is a spy so the
// centred box can be asserted.
function setupFocus(
    current: { x: number; y: number; width: number; height: number },
    outer: { width: number; height: number },
    elements: Record<string, unknown>,
) {
    const inner = { x: 100, y: 100, width: 400, height: 200 };
    const viewbox = vi.fn((box?: unknown) => (box ? undefined : { ...current, inner, outer }));
    const zoom = vi.fn();
    const container = document.createElement("div");
    const canvas = { viewbox, zoom, getContainer: () => container };
    const registry = { get: (id: string) => elements[id] };
    const manager = new CanvasViewportManager(((name: string) => {
        if (name === "canvas") return canvas;
        if (name === "elementRegistry") return registry;
        throw new Error(`unexpected service: ${name}`);
    }) as unknown as CoreServiceAccessor);
    return { manager, viewbox, zoom };
}

describe("ViewportManager.centerOnElement", () => {
    it("centres a shape on the current zoom when already zoomed in enough", () => {
        const { manager, viewbox } = setupFocus(
            { x: 0, y: 0, width: 1000, height: 800 }, // scale 1.0 ≥ floor
            { width: 1000, height: 800 },
            { Task_1: { x: 100, y: 100, width: 100, height: 100 } },
        );

        expect(manager.centerOnElement("Task_1")).toBe(true);

        // Centre (150,150), box unchanged in size, positioned so the centre sits
        // in the middle of the viewport.
        expect(viewbox.mock.calls.at(-1)?.[0]).toEqual({
            x: 150 - 500,
            y: 150 - 400,
            width: 1000,
            height: 800,
        });
    });

    it("pulls in to the minimum zoom when far zoomed out", () => {
        const { manager, viewbox } = setupFocus(
            { x: 0, y: 0, width: 2000, height: 1600 }, // scale 0.5 < floor 0.75
            { width: 1000, height: 800 },
            { Task_1: { x: 100, y: 100, width: 100, height: 100 } },
        );

        manager.centerOnElement("Task_1");

        const box = viewbox.mock.calls.at(-1)?.[0] as Rect;
        // Widened to the floor: outer / 0.75.
        expect(box.width).toBeCloseTo(1000 / 0.75);
        expect(box.height).toBeCloseTo(800 / 0.75);
        // Still centred on the element centre (150,150).
        expect(box.x + box.width / 2).toBeCloseTo(150);
        expect(box.y + box.height / 2).toBeCloseTo(150);
    });

    it("centres a connection on its waypoint-bbox midpoint", () => {
        const { manager, viewbox } = setupFocus(
            { x: 0, y: 0, width: 1000, height: 800 },
            { width: 1000, height: 800 },
            {
                Flow_1: {
                    waypoints: [
                        { x: 100, y: 100 },
                        { x: 300, y: 300 },
                    ],
                },
            },
        );

        manager.centerOnElement("Flow_1");

        const box = viewbox.mock.calls.at(-1)?.[0] as Rect;
        expect(box.x + box.width / 2).toBeCloseTo(200);
        expect(box.y + box.height / 2).toBeCloseTo(200);
    });

    it("applies nothing and reports false while the canvas is unsized", () => {
        const { manager, viewbox } = setupFocus(
            { x: 0, y: 0, width: 0, height: 0 },
            { width: 0, height: 0 },
            { Task_1: { x: 100, y: 100, width: 100, height: 100 } },
        );

        expect(manager.centerOnElement("Task_1")).toBe(false);
        expect(setterCalls(viewbox)).toHaveLength(0);
    });

    it("leaves the viewport untouched for an unknown element", () => {
        const { manager, viewbox } = setupFocus(
            { x: 0, y: 0, width: 1000, height: 800 },
            { width: 1000, height: 800 },
            {},
        );

        expect(manager.centerOnElement("missing")).toBe(false);
        // Only the getter (if at all); never the setter.
        expect(viewbox.mock.calls.every((call) => call[0] === undefined)).toBe(true);
    });
});
