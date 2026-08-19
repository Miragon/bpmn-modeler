import { describe, expect, it, vi } from "vitest";

import { isUsableViewbox, observeCanvasSize } from "./canvasResize";

/**
 * Wires `observeCanvasSize` to a fake canvas and an observer the test fires by
 * hand. The factory is injected because jsdom ships no `ResizeObserver`.
 */
function setup(applyInitialViewport?: () => boolean) {
    const resized = vi.fn();
    const observe = vi.fn();
    const disconnect = vi.fn();
    let fireResize = () => undefined as void;

    const container = {} as Element;
    const dispose = observeCanvasSize({ resized }, container, {
        createObserver: (onResize) => {
            fireResize = onResize;
            return { observe, disconnect };
        },
        applyInitialViewport,
    });

    return { resized, observe, disconnect, dispose, container, fireResize: () => fireResize() };
}

describe("observeCanvasSize", () => {
    it("observes the container it was given", () => {
        const { observe, container } = setup();

        expect(observe).toHaveBeenCalledWith(container);
    });

    it("invalidates the cached viewbox on every resize", () => {
        const { resized, fireResize } = setup();

        fireResize();
        fireResize();

        expect(resized).toHaveBeenCalledTimes(2);
    });

    // `resized()` only drops the cache, so a fit running first would still
    // measure the stale box.
    it("invalidates the viewbox before applying the initial viewport", () => {
        const calls: string[] = [];
        const applyInitialViewport = vi.fn(() => {
            calls.push("apply");
            return true;
        });
        const { resized, fireResize } = setup(applyInitialViewport);
        resized.mockImplementation(() => void calls.push("resized"));

        fireResize();

        expect(calls).toEqual(["resized", "apply"]);
    });

    // The canvas rejects the box while the host has not laid it out, so the
    // apply has to keep retrying.
    it("retries the initial viewport until it is applied, then stops", () => {
        const applyInitialViewport = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
        const { fireResize } = setup(applyInitialViewport);

        fireResize();
        fireResize();
        fireResize();

        expect(applyInitialViewport).toHaveBeenCalledTimes(2);
    });

    it("stops observing when disposed", () => {
        const { disconnect, dispose } = setup();

        dispose();

        expect(disconnect).toHaveBeenCalledOnce();
    });

    it("degrades to a no-op without a ResizeObserver", () => {
        const resized = vi.fn();
        const applyInitialViewport = vi.fn();

        // No `createObserver` and no global — the jsdom/exotic-host case.
        const dispose = observeCanvasSize({ resized }, {} as Element, { applyInitialViewport });
        dispose();

        expect(globalThis.ResizeObserver).toBeUndefined();
        expect(resized).not.toHaveBeenCalled();
        expect(applyInitialViewport).not.toHaveBeenCalled();
    });
});

describe("isUsableViewbox", () => {
    it.each([
        ["a plain box", { x: 0, y: 0, width: 800, height: 600 }, true],
        ["negative origins", { x: -100, y: -50, width: 800, height: 600 }, true],
        ["undefined", undefined, false],
        // The shape a persisted NaN viewbox comes back in after JSON.
        ["null members", { x: null, y: null, width: null, height: null }, false],
        ["NaN members", { x: NaN, y: NaN, width: NaN, height: NaN }, false],
        ["an infinite scale", { x: 0, y: 0, width: Infinity, height: Infinity }, false],
        ["zero area", { x: 0, y: 0, width: 0, height: 0 }, false],
        ["a negative extent", { x: 0, y: 0, width: -800, height: 600 }, false],
    ])("returns %s -> %s", (_case, viewbox, expected) => {
        expect(isUsableViewbox(viewbox as any)).toBe(expected);
    });
});
