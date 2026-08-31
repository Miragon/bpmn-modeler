import { describe, expect, it, vi } from "vitest";

import { StayOnPlaneBehavior, StayOnPlaneModule } from "./stayOnPlane";

interface Root {
    id: string;
}

function build(initialRoots: string[] = ["root", "sub_plane"], activeId = "sub_plane") {
    const roots: Root[] = initialRoots.map((id) => ({ id }));
    let active: Root | undefined = roots.find((root) => root.id === activeId);

    const canvas = {
        getRootElement: vi.fn(() => active),
        getRootElements: vi.fn(() => roots),
        setRootElement: vi.fn((root: Root) => {
            active = root;
        }),
    };

    const handlers: Record<string, (event: unknown) => void> = {};
    const eventBus = {
        on: vi.fn((event: string, callback: (event: unknown) => void) => {
            handlers[event] = callback;
        }),
    };

    new StayOnPlaneBehavior(eventBus, canvas);

    return {
        canvas,
        roots,
        executed: (event: unknown) => handlers["commandStack.executed"](event),
        reverted: (event: unknown) => handlers["commandStack.reverted"](event),
        removeRoot: (id: string) => {
            const index = roots.findIndex((root) => root.id === id);
            roots.splice(index, 1);
        },
    };
}

describe("StayOnPlaneBehavior", () => {
    it("stamps the active root on a command that has none", () => {
        const { executed } = build();
        const context: { rootElement?: Root } = {};

        executed({ context });

        expect(context.rootElement).toEqual({ id: "sub_plane" });
    });

    it("does not switch planes when undoing a command recorded on another plane", () => {
        const { canvas, reverted } = build();

        reverted({ context: { rootElement: { id: "root" } } });

        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("does not switch planes when redoing a command recorded on another plane", () => {
        const { canvas, executed } = build();

        executed({ context: { rootElement: { id: "root" } } });

        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("falls back to the recorded root when the current plane was removed", () => {
        const { canvas, reverted, removeRoot } = build();
        removeRoot("sub_plane");

        reverted({ context: { rootElement: { id: "root" } } });

        expect(canvas.setRootElement).toHaveBeenCalledWith({ id: "root" });
    });

    it("ignores a command that carries no context", () => {
        const { canvas, executed } = build();

        executed({});

        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("overrides diagram-js's rootElementsBehavior under the same DI name", () => {
        expect(StayOnPlaneModule).toEqual({
            rootElementsBehavior: ["type", StayOnPlaneBehavior],
        });
    });
});
