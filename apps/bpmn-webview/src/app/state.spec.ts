import { describe, expect, it, vi } from "vitest";

import { WebviewStateManager } from "./state";

/**
 * Builds a `WebviewStateManager` wired to spies for the collaborators
 * that `restoreViewport`, `captureViewState`, and `applyViewState` touch.
 */
function setup(savedState: unknown, applied = true) {
    const getState = vi.fn().mockReturnValue(savedState);
    const setViewport = vi.fn().mockReturnValue(applied);
    const fitViewport = vi.fn().mockReturnValue(applied);
    const getViewport = vi.fn().mockReturnValue({ x: 0, y: 0, width: 1000, height: 800 });
    const setRootElementById = vi.fn().mockReturnValue(true);
    const getRootElementId = vi.fn().mockReturnValue(undefined);
    const onRootChanged = vi.fn();
    const getSelectedElementIds = vi.fn().mockReturnValue([]);
    const selectElementsByIds = vi.fn();
    const host = { getState } as any;
    const modeler = {
        viewport: { setViewport, fitViewport, getViewport },
        rootElement: { setRootElementById, getRootElementId, onRootChanged },
        selection: { getSelectedElementIds, selectElementsByIds },
    } as any;
    return {
        manager: new WebviewStateManager(host, modeler),
        setViewport,
        fitViewport,
        setRootElementById,
        getRootElementId,
        getViewport,
        getSelectedElementIds,
        selectElementsByIds,
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

    it("restores root element before viewport on a tab-switch rebuild", () => {
        const viewport = { x: 10, y: 20, width: 800, height: 600 };
        const rootElementId = "SubProcess_1_plane";
        const { manager, setRootElementById, setViewport } = setup({
            viewport,
            rootElementId,
        });

        manager.restoreViewport();

        expect(setRootElementById).toHaveBeenCalledWith(rootElementId);
        expect(setViewport).toHaveBeenCalledWith(viewport);

        // Root must be set before the viewbox — viewbox coordinates are
        // plane-relative.
        const rootOrder = setRootElementById.mock.invocationCallOrder[0]!;
        const viewportOrder = setViewport.mock.invocationCallOrder[0]!;
        expect(rootOrder).toBeLessThan(viewportOrder);
    });

    it("skips root restore when no rootElementId is saved", () => {
        const viewport = { x: 10, y: 20, width: 800, height: 600 };
        const { manager, setRootElementById, setViewport } = setup({ viewport });

        manager.restoreViewport();

        expect(setRootElementById).not.toHaveBeenCalled();
        expect(setViewport).toHaveBeenCalledWith(viewport);
    });

    it("falls back to viewbox-only when the sub-process was removed", () => {
        const viewport = { x: 10, y: 20, width: 800, height: 600 };
        const { manager, setRootElementById, setViewport } = setup({
            viewport,
            rootElementId: "removed_plane",
        });
        setRootElementById.mockReturnValue(false);

        manager.restoreViewport();

        expect(setRootElementById).toHaveBeenCalledWith("removed_plane");
        expect(setViewport).toHaveBeenCalledWith(viewport);
    });
});

describe("WebviewStateManager.captureViewState / applyViewState", () => {
    it("round-trips the canvas view state", () => {
        const {
            manager,
            getRootElementId,
            getViewport,
            getSelectedElementIds,
            setRootElementById,
            setViewport,
            selectElementsByIds,
        } = setup(undefined);

        getRootElementId.mockReturnValue("SubProcess_1_plane");
        getViewport.mockReturnValue({ x: 100, y: 200, width: 500, height: 300 });
        getSelectedElementIds.mockReturnValue(["Task_1", "Task_2"]);

        const snapshot = manager.captureViewState();
        manager.applyViewState(snapshot);

        expect(setRootElementById).toHaveBeenCalledWith("SubProcess_1_plane");
        expect(setViewport).toHaveBeenCalledWith({ x: 100, y: 200, width: 500, height: 300 });
        expect(selectElementsByIds).toHaveBeenCalledWith(["Task_1", "Task_2"]);
    });

    it("applies root before viewbox in applyViewState", () => {
        const { manager, setRootElementById, setViewport, getRootElementId, getViewport } =
            setup(undefined);

        getRootElementId.mockReturnValue("SubProcess_1_plane");
        getViewport.mockReturnValue({ x: 0, y: 0, width: 1000, height: 800 });

        const snapshot = manager.captureViewState();
        manager.applyViewState(snapshot);

        const rootOrder = setRootElementById.mock.invocationCallOrder[0]!;
        const viewportOrder = setViewport.mock.invocationCallOrder[0]!;
        expect(rootOrder).toBeLessThan(viewportOrder);
    });

    it("handles capture with no drill-down (top-level process)", () => {
        const { manager, getRootElementId, setRootElementById } = setup(undefined);
        getRootElementId.mockReturnValue(undefined);

        const snapshot = manager.captureViewState();
        expect(snapshot.rootElementId).toBeUndefined();

        manager.applyViewState(snapshot);
        // setRootElementById(undefined) returns false — no plane switch
        expect(setRootElementById).toHaveBeenCalledWith(undefined);
    });
});
