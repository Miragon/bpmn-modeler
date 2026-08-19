import { describe, expect, it, vi } from "vitest";

import { WebviewStateManager } from "./state";

/**
 * Builds a `WebviewStateManager` wired to spies for the only collaborators
 * `restoreViewport` touches: `host.getState` (the saved-state source that
 * discriminates fresh open from tab-switch rebuild) and the viewport methods.
 */
function setup(savedState: unknown, applied = true) {
    const getState = vi.fn().mockReturnValue(savedState);
    const setViewport = vi.fn().mockReturnValue(applied);
    const fitViewport = vi.fn().mockReturnValue(applied);
    const host = { getState } as any;
    const modeler = { viewport: { setViewport, fitViewport } } as any;
    return {
        manager: new WebviewStateManager(host, modeler),
        setViewport,
        fitViewport,
    };
}

describe("WebviewStateManager.restoreViewport", () => {
    it("restores the saved viewbox on a tab-switch rebuild", () => {
        const viewport = { x: 10, y: 20, width: 800, height: 600 };
        const { manager, setViewport, fitViewport } = setup({ viewport });

        manager.restoreViewport();

        expect(setViewport).toHaveBeenCalledWith(viewport);
        expect(fitViewport).not.toHaveBeenCalled();
    });

    it("fits the diagram on a fresh open with no saved viewport", () => {
        const { manager, setViewport, fitViewport } = setup(undefined);

        manager.restoreViewport();

        expect(fitViewport).toHaveBeenCalledOnce();
        expect(setViewport).not.toHaveBeenCalled();
    });

    it("fits the diagram when saved state exists but carries no viewport", () => {
        const { manager, setViewport, fitViewport } = setup({ selectedElementIds: ["a"] });

        manager.restoreViewport();

        expect(fitViewport).toHaveBeenCalledOnce();
        expect(setViewport).not.toHaveBeenCalled();
    });

    it("applies the viewbox only once across repeated calls", () => {
        const { manager, fitViewport } = setup(undefined);

        expect(manager.restoreViewport()).toBe(true);
        expect(manager.restoreViewport()).toBe(true);

        // Re-fitting on every later resize would discard the user's own zoom.
        expect(fitViewport).toHaveBeenCalledOnce();
    });

    it("keeps retrying while the canvas is still unsized", () => {
        const { manager, fitViewport } = setup(undefined, false);

        expect(manager.restoreViewport()).toBe(false);
        expect(manager.restoreViewport()).toBe(false);

        expect(fitViewport).toHaveBeenCalledTimes(2);
    });
});
