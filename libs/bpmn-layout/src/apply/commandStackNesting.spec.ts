import CommandStack from "diagram-js/lib/command/CommandStack";
import EventBus from "diagram-js/lib/core/EventBus";
import { describe, expect, it, vi } from "vitest";

/**
 * The one claim the whole feature rests on: `modeling.*` calls made from a
 * handler's `preExecute` collapse into a single undo entry.
 *
 * Asserted against the real `CommandStack` rather than a fake, because the
 * mechanism is an implementation detail of diagram-js — `_pushAction` assigns
 * `action.id = (baseAction && baseAction.id) || this._createId()` and `undo()`
 * unwinds while the ids match — and a diagram-js upgrade is exactly the event
 * this test exists to catch.
 */
function stack() {
    const eventBus = new EventBus();
    const commandStack = new CommandStack(eventBus, {
        instantiate: (cls: unknown) => cls,
    } as never);
    return { eventBus, commandStack };
}

/** A leaf command that records its own execution and can be reverted. */
interface LeafContext {
    element: { value: number };
    value: number;
    previous?: number;
}

function leafHandler(log: string[], name: string) {
    return {
        execute: (context: LeafContext) => {
            context.previous = context.element.value;
            context.element.value = context.value;
            log.push(`execute:${name}`);
            return [];
        },
        revert: (context: LeafContext) => {
            context.element.value = context.previous as number;
            log.push(`revert:${name}`);
            return [];
        },
    } as never;
}

describe("command stack nesting", () => {
    it("collapses commands nested in preExecute into one undo entry", () => {
        const log: string[] = [];
        const { commandStack } = stack();

        commandStack.register("leaf", leafHandler(log, "leaf"));
        commandStack.register("batch", {
            preExecute: (context: { steps: { element: { value: number }; value: number }[] }) => {
                for (const step of context.steps) commandStack.execute("leaf", { ...step });
            },
        } as never);

        const a = { value: 1 };
        const b = { value: 2 };
        const c = { value: 3 };
        commandStack.execute("batch", {
            steps: [
                { element: a, value: 10 },
                { element: b, value: 20 },
                { element: c, value: 30 },
            ],
        });

        expect([a.value, b.value, c.value]).toEqual([10, 20, 30]);

        commandStack.undo();

        expect([a.value, b.value, c.value]).toEqual([1, 2, 3]);
        expect(commandStack.canUndo()).toBe(false);
    });

    it("fires commandStack.changed exactly once for the whole batch", () => {
        const log: string[] = [];
        const { eventBus, commandStack } = stack();
        const changed = vi.fn();
        eventBus.on("commandStack.changed", changed);

        commandStack.register("leaf", leafHandler(log, "leaf"));
        commandStack.register("batch", {
            preExecute: (context: { steps: { element: { value: number }; value: number }[] }) => {
                for (const step of context.steps) commandStack.execute("leaf", { ...step });
            },
        } as never);

        commandStack.execute("batch", {
            steps: [
                { element: { value: 0 }, value: 1 },
                { element: { value: 0 }, value: 2 },
            ],
        });

        expect(changed).toHaveBeenCalledTimes(1);
    });

    // Why the applier uses preExecute and not execute.
    it("rejects nested execution from the execute phase", () => {
        const log: string[] = [];
        const { commandStack } = stack();

        commandStack.register("leaf", leafHandler(log, "leaf"));
        commandStack.register("illegal", {
            execute: () => {
                commandStack.execute("leaf", { element: { value: 0 }, value: 1 });
                return [];
            },
        } as never);

        expect(() => commandStack.execute("illegal", {})).toThrow(/illegal invocation/);
    });

    // An empty batch is still an undo entry, which is why the applier refuses
    // to execute a plan with no operations.
    it("still records a stack entry for a handler that does nothing", () => {
        const { commandStack } = stack();
        commandStack.register("noop", { preExecute: () => undefined } as never);

        commandStack.execute("noop", {});

        expect(commandStack.canUndo()).toBe(true);
    });
});
