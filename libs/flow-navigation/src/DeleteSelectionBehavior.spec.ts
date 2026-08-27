import { describe, expect, it, vi } from "vitest";

import { DeleteSelectionBehavior } from "./DeleteSelectionBehavior";
import type { NavElement } from "./traversal";

// ---------------------------------------------------------------------------
// Graph builders
// ---------------------------------------------------------------------------

function shape(id: string, type: string, x: number, y: number): NavElement {
    return { id, type, x, y, incoming: [], outgoing: [] };
}

function flow(id: string, src: NavElement, tgt: NavElement): NavElement {
    const f: NavElement = {
        id,
        type: "bpmn:SequenceFlow",
        x: 0,
        y: 0,
        incoming: [],
        outgoing: [],
        source: src,
        target: tgt,
    };
    src.outgoing.push(f);
    tgt.incoming.push(f);
    return f;
}

// ---------------------------------------------------------------------------
// Test harness — captures eventBus handlers and drives the
// preExecute → postExecuted lifecycle with a shared context.
// ---------------------------------------------------------------------------

function build() {
    type Handler = (event: { context: Record<string, unknown> }) => void;
    const handlers: Record<string, { priority: number; callback: Handler }[]> = {};

    const eventBus = {
        on: vi.fn((...args: unknown[]) => {
            const event = args[0] as string;
            const priority = typeof args[1] === "number" ? args[1] : 1000;
            const callback = (typeof args[1] === "number" ? args[2] : args[1]) as Handler;
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push({ priority, callback });
        }),
    };

    const selection = { select: vi.fn() };
    const canvas = { scrollToElement: vi.fn() };

    const registry = new Map<string, NavElement>();
    const elementRegistry = {
        get: vi.fn((id: string) => registry.get(id)),
    };

    new DeleteSelectionBehavior(
        eventBus as never,
        selection as never,
        canvas as never,
        elementRegistry as never,
    );

    /** Simulates the delete command lifecycle: preExecute → remove → postExecuted. */
    function fireDelete(elements: NavElement[]) {
        const context: Record<string, unknown> = { elements };
        const event = { context };

        const pre = (handlers["commandStack.elements.delete.preExecute"] ?? []).sort(
            (a, b) => b.priority - a.priority,
        );
        for (const h of pre) h.callback(event);

        for (const el of elements) registry.delete(el.id);

        const post = (handlers["commandStack.elements.delete.postExecuted"] ?? []).sort(
            (a, b) => b.priority - a.priority,
        );
        for (const h of post) h.callback(event);
    }

    return { eventBus, selection, canvas, elementRegistry, registry, fireDelete, handlers };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeleteSelectionBehavior", () => {
    it("selects and scrolls to predecessor after delete", () => {
        const { selection, canvas, registry, fireDelete } = build();
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        flow("f1", a, b);
        registry.set("a", a);
        registry.set("b", b);

        fireDelete([b]);

        expect(selection.select).toHaveBeenCalledWith(a);
        expect(canvas.scrollToElement).toHaveBeenCalledWith(a);
    });

    it("no-ops when registry lost the anchor", () => {
        const { selection, canvas, fireDelete } = build();
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        flow("f1", a, b);
        // 'a' not in registry — simulates it being deleted by a cascade.

        fireDelete([b]);

        expect(selection.select).not.toHaveBeenCalled();
        expect(canvas.scrollToElement).not.toHaveBeenCalled();
    });

    it("no-ops when delete anchor is unresolvable", () => {
        const { selection, canvas, fireDelete } = build();
        const isolated = shape("x", "bpmn:Task", 100, 100);

        fireDelete([isolated]);

        expect(selection.select).not.toHaveBeenCalled();
        expect(canvas.scrollToElement).not.toHaveBeenCalled();
    });

    it("registers postExecuted at priority 250", () => {
        const { handlers } = build();

        const postHandlers = handlers["commandStack.elements.delete.postExecuted"] ?? [];
        expect(postHandlers).toHaveLength(1);
        expect(postHandlers[0].priority).toBe(250);
    });
});
