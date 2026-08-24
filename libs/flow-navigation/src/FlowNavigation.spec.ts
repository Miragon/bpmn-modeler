import { describe, expect, it, vi } from "vitest";

import { FlowNavigation } from "./FlowNavigation";
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
// Test harness — mirrors NavigateContextPadProvider.spec.ts style.
// ---------------------------------------------------------------------------

function build() {
    let listener!: (ctx: { keyEvent: KeyboardEvent }) => boolean | undefined;

    const keyboard = {
        addListener: vi.fn((l: typeof listener) => {
            listener = l;
        }),
        isCmd: vi.fn((e: KeyboardEvent) => !!(e.ctrlKey || e.metaKey)),
        isShift: vi.fn((e: KeyboardEvent) => !!e.shiftKey),
    };

    const selection = {
        get: vi.fn((): NavElement[] => []),
        select: vi.fn(),
    };

    const rootElement: NavElement & { children: NavElement[] } = {
        id: "root",
        type: "bpmn:Process",
        x: 0,
        y: 0,
        incoming: [],
        outgoing: [],
        children: [],
    };

    const canvas = {
        getRootElement: vi.fn(() => rootElement),
        scrollToElement: vi.fn(),
    };

    const services: Record<string, unknown> = {};
    const injector = {
        get: vi.fn((name: string) => services[name] ?? null),
    };

    new FlowNavigation(keyboard as never, selection as never, canvas as never, injector as never);

    function dispatch(
        key: string,
        opts?: { shift?: boolean; ctrl?: boolean; alt?: boolean },
    ): boolean | undefined {
        return listener({
            keyEvent: {
                key,
                shiftKey: opts?.shift ?? false,
                ctrlKey: opts?.ctrl ?? false,
                metaKey: false,
                altKey: opts?.alt ?? false,
            } as unknown as KeyboardEvent,
        });
    }

    return {
        keyboard,
        selection,
        canvas,
        injector,
        services,
        rootElement,
        dispatch,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FlowNavigation", () => {
    it("registers a keyboard listener on construction", () => {
        const { keyboard } = build();

        expect(keyboard.addListener).toHaveBeenCalledTimes(1);
    });

    it("Tab selects next element and scrolls to it", () => {
        const { selection, canvas, dispatch } = build();
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        flow("f1", a, b);
        selection.get.mockReturnValue([a]);

        const result = dispatch("Tab");

        expect(result).toBe(true);
        expect(selection.select).toHaveBeenCalledWith(b);
        expect(canvas.scrollToElement).toHaveBeenCalledWith(b);
    });

    it("Tab at end returns true without changing selection", () => {
        const { selection, canvas, dispatch } = build();
        const end = shape("end", "bpmn:EndEvent", 400, 200);
        selection.get.mockReturnValue([end]);

        const result = dispatch("Tab");

        expect(result).toBe(true);
        expect(selection.select).not.toHaveBeenCalled();
        expect(canvas.scrollToElement).not.toHaveBeenCalled();
    });

    it("Ctrl+Tab → undefined (not consumed)", () => {
        const { dispatch } = build();

        expect(dispatch("Tab", { ctrl: true })).toBeUndefined();
    });

    it("Alt+Tab → undefined (not consumed)", () => {
        const { dispatch } = build();

        expect(dispatch("Tab", { alt: true })).toBeUndefined();
    });

    it("Enter on non-flow → undefined", () => {
        const { selection, dispatch } = build();
        const task = shape("task", "bpmn:Task", 200, 200);
        selection.get.mockReturnValue([task]);

        expect(dispatch("Enter")).toBeUndefined();
    });

    it("Enter on flow selects target and returns true", () => {
        const { selection, canvas, dispatch } = build();
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const f = flow("f1", a, b);
        selection.get.mockReturnValue([f]);

        const result = dispatch("Enter");

        expect(result).toBe(true);
        expect(selection.select).toHaveBeenCalledWith(b);
        expect(canvas.scrollToElement).toHaveBeenCalledWith(b);
    });

    it("Shift+Enter on flow selects source", () => {
        const { selection, dispatch } = build();
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const f = flow("f1", a, b);
        selection.get.mockReturnValue([f]);

        const result = dispatch("Enter", { shift: true });

        expect(result).toBe(true);
        expect(selection.select).toHaveBeenCalledWith(a);
    });

    it("directEditing active suppresses all keys", () => {
        const { services, dispatch } = build();
        services.directEditing = { isActive: () => true };

        expect(dispatch("Tab")).toBeUndefined();
        expect(dispatch("Enter")).toBeUndefined();
    });

    it("popupMenu open suppresses all keys", () => {
        const { services, dispatch } = build();
        services.popupMenu = { isOpen: () => true };

        expect(dispatch("Tab")).toBeUndefined();
        expect(dispatch("Enter")).toBeUndefined();
    });

    it("multi-select anchors on last element", () => {
        const { selection, dispatch } = build();
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const c = shape("c", "bpmn:Task", 300, 100);
        flow("f1", a, b);
        flow("f2", b, c);
        selection.get.mockReturnValue([a, b]);

        dispatch("Tab");

        expect(selection.select).toHaveBeenCalledWith(c);
    });

    it("empty selection uses resolveEntry", () => {
        const { selection, rootElement, dispatch } = build();
        const start = shape("start", "bpmn:StartEvent", 100, 200);
        rootElement.children = [start];
        selection.get.mockReturnValue([]);

        dispatch("Tab");

        expect(selection.select).toHaveBeenCalledWith(start);
    });

    it("ignores unrelated keys", () => {
        const { dispatch } = build();

        expect(dispatch("a")).toBeUndefined();
        expect(dispatch("Escape")).toBeUndefined();
        expect(dispatch(" ")).toBeUndefined();
    });
});
