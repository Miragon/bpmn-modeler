import CommandStack from "diagram-js/lib/command/CommandStack";
import EventBus from "diagram-js/lib/core/EventBus";
import { describe, expect, it, vi } from "vitest";

import type { CleanupAction } from "../cleanup/rules";
import {
    CLEANUP_COMMAND,
    CLEANUP_MODDLE_COMMAND,
    CleanupApplyHandler,
    CleanupModdleHandler,
} from "./CleanupHandlers";
import { WAYPOINT_HINTS } from "./LayoutApplyHandler";

function harness(knownIds: string[]) {
    const modeling = {
        moveShape: vi.fn(),
        resizeShape: vi.fn(),
        updateWaypoints: vi.fn(),
        removeElements: vi.fn(),
    };
    const elements = new Map(knownIds.map((id) => [id, { id }]));
    const commandStack = { execute: vi.fn() };
    const handler = new CleanupApplyHandler(
        modeling,
        { get: (id: string) => elements.get(id) },
        commandStack,
    );
    return { handler, modeling, commandStack, element: (id: string) => elements.get(id) };
}

describe("CleanupApplyHandler", () => {
    it("removes registry-backed elements in one removeElements call", () => {
        const { handler, modeling, element } = harness(["Flow_1", "Task_ghost"]);

        handler.preExecute({
            actions: [
                { kind: "remove-element", id: "Flow_1" },
                { kind: "remove-element", id: "Task_ghost" },
            ],
        });

        expect(modeling.removeElements).toHaveBeenCalledOnce();
        expect(modeling.removeElements).toHaveBeenCalledWith([
            element("Flow_1"),
            element("Task_ghost"),
        ]);
    });

    it("tidies waypoints through updateWaypoints with the label hint", () => {
        const { handler, modeling, element } = harness(["Flow_1"]);
        const waypoints = [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
        ];

        handler.preExecute({ actions: [{ kind: "set-waypoints", id: "Flow_1", waypoints }] });

        expect(modeling.updateWaypoints).toHaveBeenCalledWith(
            element("Flow_1"),
            waypoints,
            WAYPOINT_HINTS,
        );
    });

    it("defers moddle-only actions to the nested raw command", () => {
        const { handler, commandStack } = harness([]);
        const array = [{ marker: 1 }];
        const actions: CleanupAction[] = [
            { kind: "splice", array, index: 0, node: array[0] },
        ];

        handler.preExecute({ actions });

        expect(commandStack.execute).toHaveBeenCalledWith(CLEANUP_MODDLE_COMMAND, { actions });
    });

    it("does nothing at all when every action names something that is gone", () => {
        const { handler, modeling, commandStack } = harness([]);

        handler.preExecute({ actions: [{ kind: "remove-element", id: "Ghost" }] });

        expect(modeling.removeElements).not.toHaveBeenCalled();
        expect(commandStack.execute).not.toHaveBeenCalled();
    });
});

describe("CleanupModdleHandler", () => {
    it("splices by identity, so two removals from one array both land", () => {
        const a = { id: "a" };
        const b = { id: "b" };
        const c = { id: "c" };
        const array: unknown[] = [a, b, c];
        const handler = new CleanupModdleHandler();
        const context = {
            actions: [
                // Stale indices on purpose: after the first splice, b sits at 0.
                { kind: "splice", array, index: 0, node: a },
                { kind: "splice", array, index: 1, node: b },
            ] as CleanupAction[],
        };

        handler.execute(context);

        expect(array).toEqual([c]);
    });

    it("restores spliced nodes at their original positions on revert", () => {
        const a = { id: "a" };
        const b = { id: "b" };
        const c = { id: "c" };
        const array: unknown[] = [a, b, c];
        const handler = new CleanupModdleHandler();
        const context = {
            actions: [
                { kind: "splice", array, index: 1, node: b },
                { kind: "splice", array, index: 0, node: a },
            ] as CleanupAction[],
        };

        handler.execute(context);
        expect(array).toEqual([c]);

        handler.revert(context);
        expect(array).toEqual([a, b, c]);
    });

    it("restores an unset property on revert", () => {
        const owner: Record<string, unknown> = { label: { bounds: undefined } };
        const label = owner.label;
        const handler = new CleanupModdleHandler();
        const context = {
            actions: [{ kind: "unset", owner, property: "label", value: label }] as CleanupAction[],
        };

        handler.execute(context);
        expect("label" in owner).toBe(false);

        handler.revert(context);
        expect(owner.label).toBe(label);
    });

    it("skips an action whose target has already gone", () => {
        const array: unknown[] = [];
        const handler = new CleanupModdleHandler();
        const context = {
            actions: [{ kind: "splice", array, index: 0, node: { id: "gone" } }] as CleanupAction[],
        };

        expect(() => handler.execute(context)).not.toThrow();
        expect(array).toEqual([]);
    });
});

describe("cleanup end to end on a real command stack", () => {
    it("reverts registry removals and moddle splices together in one undo", () => {
        const eventBus = new EventBus();
        const commandStack = new CommandStack(eventBus, { instantiate: (cls: unknown) => cls } as never);

        const removed: unknown[][] = [];
        const array: unknown[] = [{ id: "orphan-di" }];
        const orphan = array[0];

        const modeling = {
            moveShape: vi.fn(),
            resizeShape: vi.fn(),
            updateWaypoints: vi.fn(),
            removeElements: (elements: unknown[]) => {
                removed.push(elements);
                commandStack.execute("elements.remove", { elements });
            },
        };

        commandStack.register("elements.remove", {
            execute: () => [],
            revert: () => [],
        } as never);
        commandStack.register(CLEANUP_MODDLE_COMMAND, new CleanupModdleHandler() as never);
        commandStack.register(
            CLEANUP_COMMAND,
            new CleanupApplyHandler(
                modeling,
                { get: (id: string) => (id === "Flow_1" ? { id } : undefined) },
                commandStack,
            ) as never,
        );

        commandStack.execute(CLEANUP_COMMAND, {
            actions: [
                { kind: "remove-element", id: "Flow_1" },
                { kind: "splice", array, index: 0, node: orphan },
            ],
        });

        expect(removed).toHaveLength(1);
        expect(array).toEqual([]);

        commandStack.undo();

        expect(array).toEqual([orphan]);
        expect(commandStack.canUndo()).toBe(false);
    });
});
