import { describe, expect, it, vi } from "vitest";

import { WebviewStateManager } from "./state";

/**
 * Builds a `WebviewStateManager` wired to spies for the collaborators
 * that `restoreViewport`, `captureViewState`, and `applyViewState` touch.
 */
function setup(
    savedState: unknown,
    applied = true,
    panelRoot: HTMLElement = document.createElement("div"),
) {
    const getState = vi.fn().mockReturnValue(savedState);
    const updateState = vi.fn();
    const setState = vi.fn();
    const setViewport = vi.fn().mockReturnValue(applied);
    const fitViewport = vi.fn().mockReturnValue(applied);
    const getViewport = vi
        .fn()
        .mockReturnValue({ x: 5, y: 10, width: 400, height: 300, scale: 1.2 });
    const setRootElementById = vi.fn().mockReturnValue(true);
    const getRootElementId = vi.fn().mockReturnValue(undefined);
    const onRootChanged = vi.fn();
    const onViewportChanged = vi.fn();
    const onSelectionChanged = vi.fn();
    const getSelectedElementIds = vi.fn().mockReturnValue([]);
    const selectElementsByIds = vi.fn();
    const host = { getState, updateState, setState } as any;
    const modeler = {
        viewport: { setViewport, fitViewport, getViewport, onViewportChanged },
        rootElement: { setRootElementById, getRootElementId, onRootChanged },
        selection: { getSelectedElementIds, selectElementsByIds, onSelectionChanged },
    } as any;
    return {
        manager: new WebviewStateManager(host, modeler, panelRoot),
        setViewport,
        fitViewport,
        setRootElementById,
        getRootElementId,
        getViewport,
        getSelectedElementIds,
        selectElementsByIds,
        updateState,
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

describe("WebviewStateManager panel scoping", () => {
    /** A panel host with a scroll container, plus a decoy panel elsewhere. */
    function panels() {
        const panelRoot = document.createElement("div");
        const scroll = document.createElement("div");
        scroll.className = "bio-properties-panel-scroll-container";
        panelRoot.appendChild(scroll);
        document.body.appendChild(panelRoot);

        const otherPanel = document.createElement("div");
        const otherScroll = document.createElement("div");
        otherScroll.className = "bio-properties-panel-scroll-container";
        otherPanel.appendChild(otherScroll);
        document.body.appendChild(otherPanel);

        return { panelRoot, scroll, otherScroll, otherPanel };
    }

    it("binds scroll persistence to the scroll container within the passed panelRoot", () => {
        vi.useFakeTimers();
        const { panelRoot, scroll, otherScroll } = panels();
        const { manager, updateState } = setup(undefined, true, panelRoot);

        manager.startPersisting();

        Object.defineProperty(scroll, "scrollTop", { value: 42, configurable: true });
        scroll.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(100);
        expect(updateState).toHaveBeenCalledWith({ panelScroll: 42 });

        // A scroll in a foreign panel must not be persisted as ours.
        updateState.mockClear();
        Object.defineProperty(otherScroll, "scrollTop", { value: 99, configurable: true });
        otherScroll.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(100);
        expect(updateState).not.toHaveBeenCalled();

        vi.useRealTimers();
        document.body.innerHTML = "";
    });
});

describe("WebviewStateManager.flushViewport", () => {
    it("persists the current viewbox synchronously", () => {
        const { manager, getViewport, updateState } = setup(undefined);

        manager.flushViewport();

        expect(getViewport).toHaveBeenCalledOnce();
        expect(updateState).toHaveBeenCalledWith({
            viewport: { x: 5, y: 10, width: 400, height: 300, scale: 1.2 },
        });
    });

    it("skips persistence when the viewbox is degenerate", () => {
        const { manager, getViewport, updateState } = setup(undefined);
        getViewport.mockReturnValue({ x: NaN, y: NaN, width: NaN, height: NaN });

        manager.flushViewport();

        expect(updateState).not.toHaveBeenCalled();
    });
});
