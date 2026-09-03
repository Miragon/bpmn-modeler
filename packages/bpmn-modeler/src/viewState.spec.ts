import { afterEach, describe, expect, it, vi } from "vitest";

import { applyViewState, captureViewState, type ViewStateManagers } from "./viewState";

/**
 * Hand-rolled fakes for the three managers (same pattern as
 * `rootElement.spec.ts`) — the composition is tiny, so faking is clearer than
 * standing up real bpmn-js. `getRootElementId` defaults to a drilled-in plane;
 * override per test for the top-level case.
 */
function setup() {
    const getViewport = vi.fn().mockReturnValue({ x: 10, y: 20, width: 800, height: 600 });
    const setViewport = vi.fn();
    const getRootElementId = vi.fn().mockReturnValue("SubProcess_1_plane");
    const setRootElementById = vi.fn();
    const getSelectedElementIds = vi.fn().mockReturnValue(["Task_1", "Task_2"]);
    const selectElementsByIds = vi.fn();

    const managers = {
        viewport: { getViewport, setViewport },
        rootElement: { getRootElementId, setRootElementById },
        selection: { getSelectedElementIds, selectElementsByIds },
    } as unknown as ViewStateManagers;

    return {
        managers,
        getViewport,
        setViewport,
        getRootElementId,
        setRootElementById,
        getSelectedElementIds,
        selectElementsByIds,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("captureViewState", () => {
    it("composes the plane, viewbox, and selection into a single snapshot", () => {
        const { managers } = setup();

        expect(captureViewState(managers)).toEqual({
            rootElementId: "SubProcess_1_plane",
            viewport: { x: 10, y: 20, width: 800, height: 600 },
            selectedElementIds: ["Task_1", "Task_2"],
        });
    });

    it("captures undefined rootElementId on the top-level (implicit) plane", () => {
        const { managers, getRootElementId } = setup();
        getRootElementId.mockReturnValue(undefined);

        expect(captureViewState(managers).rootElementId).toBeUndefined();
    });
});

describe("applyViewState", () => {
    it("applies root before viewport before selection", () => {
        const { managers, setRootElementById, setViewport, selectElementsByIds } = setup();

        applyViewState(managers, {
            rootElementId: "SubProcess_1_plane",
            viewport: { x: 0, y: 0, width: 1000, height: 800 },
            selectedElementIds: ["Task_1"],
        });

        expect(setRootElementById).toHaveBeenCalledWith("SubProcess_1_plane");
        expect(setViewport).toHaveBeenCalledWith({ x: 0, y: 0, width: 1000, height: 800 });
        expect(selectElementsByIds).toHaveBeenCalledWith(["Task_1"]);

        // Order is load-bearing: viewbox coordinates are plane-relative, and the
        // drill-down centring on `root.set` must be overwritten by the viewbox.
        const rootOrder = setRootElementById.mock.invocationCallOrder[0]!;
        const viewportOrder = setViewport.mock.invocationCallOrder[0]!;
        const selectionOrder = selectElementsByIds.mock.invocationCallOrder[0]!;
        expect(rootOrder).toBeLessThan(viewportOrder);
        expect(viewportOrder).toBeLessThan(selectionOrder);
    });

    it("passes an undefined rootElementId through (top-level plane, no switch)", () => {
        const { managers, setRootElementById } = setup();

        const snapshot = captureViewState({
            ...managers,
            rootElement: { getRootElementId: () => undefined } as never,
        });
        applyViewState(managers, snapshot);

        expect(snapshot.rootElementId).toBeUndefined();
        expect(setRootElementById).toHaveBeenCalledWith(undefined);
    });
});
