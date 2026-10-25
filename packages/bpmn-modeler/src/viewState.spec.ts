import { afterEach, describe, expect, it, vi } from "vitest";

import type { CoreServiceAccessor } from "./coreServices";
import { CanvasViewportManager } from "./viewport";
import { DrilldownFit, DrilldownFitModule, SurfaceView } from "./viewState";

function surfaceView() {
    const view = new SurfaceView((() => {
        throw new Error("services are faked per manager");
    }) as unknown as CoreServiceAccessor);
    const getViewport = vi
        .spyOn(view.viewport, "getViewport")
        .mockReturnValue({ x: 10, y: 20, width: 800, height: 600 });
    const setViewport = vi.spyOn(view.viewport, "setViewport").mockReturnValue(true);
    const getRootElementId = vi
        .spyOn(view.rootElement, "getRootElementId")
        .mockReturnValue("SubProcess_1_plane");
    const setRootElementById = vi
        .spyOn(view.rootElement, "setRootElementById")
        .mockReturnValue(true);
    vi.spyOn(view.selection, "getSelectedElementIds").mockReturnValue(["Task_1", "Task_2"]);
    const selectElementsByIds = vi
        .spyOn(view.selection, "selectElementsByIds")
        .mockImplementation(() => {});
    return {
        view,
        getViewport,
        setViewport,
        getRootElementId,
        setRootElementById,
        selectElementsByIds,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("SurfaceView", () => {
    it("captures the plane, viewbox, and selection into a single snapshot", () => {
        const { view } = surfaceView();

        expect(view.capture()).toEqual({
            rootElementId: "SubProcess_1_plane",
            viewport: { x: 10, y: 20, width: 800, height: 600 },
            selectedElementIds: ["Task_1", "Task_2"],
        });
    });

    it("captures an undefined rootElementId on the top-level (implicit) plane", () => {
        const { view, getRootElementId } = surfaceView();
        getRootElementId.mockReturnValue(undefined);

        expect(view.capture().rootElementId).toBeUndefined();
    });

    it("applies root before viewport before selection", () => {
        const { view, setRootElementById, setViewport, selectElementsByIds } = surfaceView();

        view.apply({
            rootElementId: "SubProcess_1_plane",
            viewport: { x: 0, y: 0, width: 1000, height: 800 },
            selectedElementIds: ["Task_1"],
        });

        expect(setRootElementById).toHaveBeenCalledWith("SubProcess_1_plane");
        expect(setViewport).toHaveBeenCalledWith({ x: 0, y: 0, width: 1000, height: 800 });
        expect(selectElementsByIds).toHaveBeenCalledWith(["Task_1"]);
        // Viewbox coordinates are plane-relative, and the drill-down fit on
        // `root.set` must be overwritten by the restored viewbox.
        const rootOrder = setRootElementById.mock.invocationCallOrder[0]!;
        const viewportOrder = setViewport.mock.invocationCallOrder[0]!;
        const selectionOrder = selectElementsByIds.mock.invocationCallOrder[0]!;
        expect(rootOrder).toBeLessThan(viewportOrder);
        expect(viewportOrder).toBeLessThan(selectionOrder);
    });

    it("passes an undefined rootElementId through (top-level plane, no switch)", () => {
        const { view, getRootElementId, setRootElementById } = surfaceView();
        getRootElementId.mockReturnValue(undefined);

        view.apply(view.capture());

        expect(setRootElementById).toHaveBeenCalledWith(undefined);
    });
});

type PlaneRoot = { id: string; businessObject?: { $instanceOf(type: string): boolean } };

function plane(id: string, type = "bpmn:SubProcess"): PlaneRoot {
    return { id, businessObject: { $instanceOf: (t: string) => t === type } };
}

function drilldownFit() {
    const fitViewport = vi
        .spyOn(CanvasViewportManager.prototype, "fitViewport")
        .mockReturnValue(true);
    const handlers: Record<string, (event: { element?: PlaneRoot }) => void> = {};
    let rootSetPriority: number | undefined;
    const eventBus = {
        on: (
            event: string,
            priorityOrCallback: number | (() => void),
            callback?: (event: { element?: PlaneRoot }) => void,
        ) => {
            if (typeof priorityOrCallback === "number") {
                rootSetPriority = priorityOrCallback;
                handlers[event] = callback!;
            } else {
                handlers[event] = priorityOrCallback;
            }
        },
    };
    new DrilldownFit(eventBus, { get: vi.fn() });
    return {
        fitViewport,
        rootSetPriority,
        rootSet: (element: PlaneRoot | undefined) => handlers["root.set"]!({ element }),
        clear: () => handlers["diagram.clear"]!({}),
    };
}

describe("DrilldownFit", () => {
    it("fits after drilldown centering", () => {
        expect(drilldownFit().rootSetPriority).toBe(500);
    });

    it("fits a sub-process plane on its first visit only", () => {
        const { fitViewport, rootSet } = drilldownFit();

        rootSet(plane("sub_plane"));
        rootSet(plane("other_plane"));
        rootSet(plane("sub_plane"));

        expect(fitViewport).toHaveBeenCalledTimes(2);
    });

    it("ignores the top-level root, which the host positions itself", () => {
        const { fitViewport, rootSet } = drilldownFit();

        rootSet(plane("Process_1", "bpmn:Process"));
        rootSet({ id: "no-business-object" });
        rootSet(undefined);

        expect(fitViewport).not.toHaveBeenCalled();
    });

    it("fits the same plane again after the diagram is cleared", () => {
        const { fitViewport, clear, rootSet } = drilldownFit();

        rootSet(plane("sub_plane"));
        clear();
        rootSet(plane("sub_plane"));

        expect(fitViewport).toHaveBeenCalledTimes(2);
    });

    it("registers the service under a stable DI name", () => {
        expect(DrilldownFitModule).toEqual({
            __init__: ["drilldownFit"],
            drilldownFit: ["type", DrilldownFit],
        });
    });
});
