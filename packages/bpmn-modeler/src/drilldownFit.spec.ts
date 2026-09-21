import { describe, expect, it, vi } from "vitest";

import { DrilldownFit, DrilldownFitModule } from "./drilldownFit";

const fitViewport = vi.fn(() => true);

vi.mock("./viewport", () => ({
    CanvasViewportManager: class {
        fitViewport = fitViewport;
    },
}));

function plane(id: string, type = "bpmn:SubProcess", children: unknown[] = [{}]) {
    return { id, businessObject: { $instanceOf: (t: string) => t === type }, children };
}

type RootElement = ReturnType<typeof plane> | { id: string; businessObject?: undefined };

function build() {
    fitViewport.mockClear();
    let rootSetHandler!: (event: {
        element?: { id: string; businessObject?: { $instanceOf(type: string): boolean } };
    }) => void;
    let clearHandler!: () => void;
    let priority = 0;

    const eventBus = {
        on: vi.fn(
            (
                event: string,
                priorityOrCallback: number | (() => void),
                callback?: typeof rootSetHandler,
            ) => {
                if (event === "diagram.clear") {
                    clearHandler = priorityOrCallback as () => void;
                    return;
                }
                priority = priorityOrCallback as number;
                rootSetHandler = callback!;
            },
        ),
    };
    const injector = { get: vi.fn() };

    new DrilldownFit(eventBus, injector);

    return {
        eventBus,
        priority,
        clear: () => clearHandler(),
        rootSet: (element: RootElement | undefined) => rootSetHandler({ element }),
    };
}

describe("DrilldownFit", () => {
    it("subscribes to root.set after drilldown centering", () => {
        const { eventBus, priority } = build();

        expect(eventBus.on).toHaveBeenCalledWith(
            "root.set",
            expect.any(Number),
            expect.any(Function),
        );
        expect(priority).toBe(500);
    });

    it("fits a sub-process plane on its first visit", () => {
        const { rootSet } = build();

        rootSet(plane("sub_plane"));

        expect(fitViewport).toHaveBeenCalledOnce();
    });

    it("leaves a revisited plane at its remembered position", () => {
        const { rootSet } = build();

        rootSet(plane("sub_plane"));
        rootSet(plane("other_plane"));
        rootSet(plane("sub_plane"));

        expect(fitViewport).toHaveBeenCalledTimes(2);
    });

    it("leaves an empty plane alone and fits it once it has content", () => {
        const { rootSet } = build();

        rootSet(plane("sub_plane", "bpmn:SubProcess", []));

        expect(fitViewport).not.toHaveBeenCalled();

        rootSet(plane("sub_plane"));

        expect(fitViewport).toHaveBeenCalledOnce();

        rootSet(plane("sub_plane"));

        expect(fitViewport).toHaveBeenCalledOnce();
    });

    it("ignores the top-level root, which the host positions itself", () => {
        const { rootSet } = build();

        rootSet(plane("Process_1", "bpmn:Process"));
        rootSet({ id: "no-business-object" });
        rootSet(undefined);

        expect(fitViewport).not.toHaveBeenCalled();
    });

    it("fits the same plane ID again after the diagram is cleared", () => {
        const { clear, rootSet } = build();

        rootSet(plane("sub_plane"));
        clear();
        rootSet(plane("sub_plane"));

        expect(fitViewport).toHaveBeenCalledTimes(2);
    });

    it("fits synchronously before a saved viewport is restored", () => {
        const actions: string[] = [];
        fitViewport.mockImplementationOnce(() => {
            actions.push("fit");
            return true;
        });
        const { rootSet } = build();

        rootSet(plane("sub_plane"));
        actions.push("restore");

        expect(actions).toEqual(["fit", "restore"]);
    });

    it("registers the service under a stable DI name", () => {
        expect(DrilldownFitModule).toEqual({
            __init__: ["drilldownFit"],
            drilldownFit: ["type", DrilldownFit],
        });
    });
});
