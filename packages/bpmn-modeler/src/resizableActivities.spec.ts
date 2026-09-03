import { describe, expect, it, vi } from "vitest";

import { ResizableActivitiesModule, ResizableActivitiesRule } from "./resizableActivities";

function shapeOf(...types: string[]) {
    return {
        businessObject: {
            $instanceOf: (type: string) => types.includes(type),
        },
    };
}

function build() {
    let handler!: (event: { context?: unknown }) => boolean | undefined;
    let priority = 0;

    const eventBus = {
        on: vi.fn((_event: string, p: number, callback: typeof handler) => {
            priority = p;
            handler = callback;
        }),
    };

    const rule = new ResizableActivitiesRule(eventBus);

    return {
        rule,
        eventBus,
        priority,
        evaluate: (context: unknown) => handler({ context }),
    };
}

describe("ResizableActivitiesRule", () => {
    it("subscribes to the shape.resize rule event above the bpmn-js default priority", () => {
        const { eventBus, priority } = build();

        expect(eventBus.on).toHaveBeenCalledWith(
            "commandStack.shape.resize.canExecute",
            expect.any(Number),
            expect.any(Function),
        );
        expect(priority).toBeGreaterThan(1000);
    });

    it("defers to the stock rules while disabled", () => {
        const { evaluate } = build();

        expect(evaluate({ shape: shapeOf("bpmn:Activity") })).toBeUndefined();
    });

    it("allows resizing an activity once enabled", () => {
        const { rule, evaluate } = build();
        rule.setEnabled(true);

        expect(evaluate({ shape: shapeOf("bpmn:Activity") })).toBe(true);
    });

    it("defers for a non-activity rather than vetoing it", () => {
        const { rule, evaluate } = build();
        rule.setEnabled(true);

        expect(evaluate({ shape: shapeOf("bpmn:Participant") })).toBeUndefined();
        expect(evaluate({ shape: {} })).toBeUndefined();
        expect(evaluate({})).toBeUndefined();
    });

    it("accepts new bounds at or above the minimum size", () => {
        const { rule, evaluate } = build();
        rule.setEnabled(true);

        expect(
            evaluate({ shape: shapeOf("bpmn:Activity"), newBounds: { width: 60, height: 40 } }),
        ).toBe(true);
    });

    it("rejects new bounds that would collapse the activity", () => {
        const { rule, evaluate } = build();
        rule.setEnabled(true);

        expect(
            evaluate({ shape: shapeOf("bpmn:Activity"), newBounds: { width: 59, height: 40 } }),
        ).toBe(false);
        expect(
            evaluate({ shape: shapeOf("bpmn:Activity"), newBounds: { width: 60, height: 39 } }),
        ).toBe(false);
    });

    it("can be toggled back off without rebuilding the modeler", () => {
        const { rule, evaluate } = build();
        rule.setEnabled(true);
        rule.setEnabled(false);

        expect(evaluate({ shape: shapeOf("bpmn:Activity") })).toBeUndefined();
    });

    it("registers the rule under a stable DI name", () => {
        expect(ResizableActivitiesModule).toEqual({
            __init__: ["resizableActivitiesRule"],
            resizableActivitiesRule: ["type", ResizableActivitiesRule],
        });
    });
});
