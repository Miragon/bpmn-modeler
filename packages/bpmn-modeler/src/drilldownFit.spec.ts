import { describe, expect, it, vi } from "vitest";

import { DrilldownFit, DrilldownFitModule } from "./drilldownFit";

const fitViewport = vi.fn(() => true);

vi.mock("./viewport", () => ({
    ViewportManager: class {
        fitViewport = fitViewport;
    },
}));

function plane(id: string, type = "bpmn:SubProcess") {
    return { id, businessObject: { $instanceOf: (t: string) => t === type } };
}

function build() {
    fitViewport.mockClear();
    let handler!: (event: { element?: unknown }) => void;
    let priority = 0;

    const eventBus = {
        on: vi.fn((_event: string, p: number, callback: typeof handler) => {
            priority = p;
            handler = callback;
        }),
    };
    const injector = { get: vi.fn() };

    const service = new DrilldownFit(eventBus, injector);

    return {
        service,
        eventBus,
        priority,
        rootSet: (element: unknown) => handler({ element }),
    };
}

describe("DrilldownFit", () => {
    it("subscribes to root.set below the diagram-js default priority", () => {
        const { eventBus, priority } = build();

        expect(eventBus.on).toHaveBeenCalledWith(
            "root.set",
            expect.any(Number),
            expect.any(Function),
        );
        expect(priority).toBeLessThan(1000);
    });

    it("fits a sub-process plane on its first visit", () => {
        const { service, rootSet } = build();
        service.setEnabled(true);

        rootSet(plane("sub_plane"));

        expect(fitViewport).toHaveBeenCalledOnce();
    });

    it("leaves a revisited plane at its remembered position", () => {
        const { service, rootSet } = build();
        service.setEnabled(true);

        rootSet(plane("sub_plane"));
        rootSet(plane("other_plane"));
        rootSet(plane("sub_plane"));

        expect(fitViewport).toHaveBeenCalledTimes(2);
    });

    it("ignores the top-level root, which the host positions itself", () => {
        const { service, rootSet } = build();
        service.setEnabled(true);

        rootSet(plane("Process_1", "bpmn:Process"));
        rootSet({ id: "no-business-object" });
        rootSet(undefined);

        expect(fitViewport).not.toHaveBeenCalled();
    });

    it("does not fit while the setting is off", () => {
        const { rootSet } = build();

        rootSet(plane("sub_plane"));

        expect(fitViewport).not.toHaveBeenCalled();
    });

    it("does not retro-fit a plane first opened while the setting was off", () => {
        const { service, rootSet } = build();

        rootSet(plane("sub_plane"));
        service.setEnabled(true);
        rootSet(plane("sub_plane"));

        expect(fitViewport).not.toHaveBeenCalled();
    });

    it("registers the service under a stable DI name", () => {
        expect(DrilldownFitModule).toEqual({
            __init__: ["drilldownFit"],
            drilldownFit: ["type", DrilldownFit],
        });
    });
});
