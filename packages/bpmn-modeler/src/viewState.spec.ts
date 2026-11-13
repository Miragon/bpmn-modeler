import { afterEach, describe, expect, it, vi } from "vitest";

import type { CoreServiceAccessor } from "./coreServices";
import { CanvasViewportManager } from "./viewport";
import { DrilldownFit, DrilldownFitModule, SurfaceView } from "./viewState";

vi.mock("./initialViewport", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./initialViewport")>()),
    armInitialViewportPolicy: () => () => undefined,
}));

function surfaceView() {
    const view = new SurfaceView(((name: string) => {
        // The initial fit is mocked out; it only needs a canvas to hand over.
        if (name === "canvas") return {};
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

describe("SurfaceView across a re-import", () => {
    it("puts the plane, viewbox and selection back after the re-import", async () => {
        const { view, setRootElementById, setViewport, selectElementsByIds } = surfaceView();
        view.diagramLoaded();
        const reimport = vi.fn(async () => "imported");

        await expect(view.keepAcross(reimport)).resolves.toBe("imported");

        expect(setRootElementById).toHaveBeenCalledWith("SubProcess_1_plane");
        expect(setViewport).toHaveBeenCalledWith({ x: 10, y: 20, width: 800, height: 600 });
        expect(selectElementsByIds).toHaveBeenCalledWith(["Task_1", "Task_2"]);
        expect(reimport.mock.invocationCallOrder[0]!).toBeLessThan(
            setViewport.mock.invocationCallOrder[0]!,
        );
    });

    it("leaves the first import to the initial fit, since nothing was shown before it", async () => {
        const { view, getViewport, setViewport } = surfaceView();

        await view.keepAcross(async () => undefined);

        expect(getViewport).not.toHaveBeenCalled();
        expect(setViewport).not.toHaveBeenCalled();
    });

    it("puts the view back when the re-import fails after it reset the canvas", async () => {
        const { view, setViewport } = surfaceView();
        view.diagramLoaded();
        const failure = new Error("broken document");

        await expect(
            view.keepAcross(async () => {
                throw failure;
            }),
        ).rejects.toBe(failure);

        expect(setViewport).toHaveBeenCalledOnce();
    });

    it("restores nothing on a surface destroyed during the re-import", async () => {
        const { view, setViewport } = surfaceView();
        view.diagramLoaded();

        await view.keepAcross(async () => view.dispose());

        expect(setViewport).not.toHaveBeenCalled();
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
