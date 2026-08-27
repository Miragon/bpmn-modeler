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

function attach(id: string, host: NavElement, x: number, y: number): NavElement {
    const boundary: NavElement = {
        id,
        type: "bpmn:BoundaryEvent",
        x,
        y,
        incoming: [],
        outgoing: [],
        host,
    };
    (host.attachers ??= []).push(boundary);
    return boundary;
}

// ---------------------------------------------------------------------------
// Test harness — mirrors NavigateContextPadProvider.spec.ts style.
// ---------------------------------------------------------------------------

function build() {
    let listener!: (ctx: { keyEvent: KeyboardEvent }) => boolean | undefined;
    let selectionChangedHandler: (() => void) | undefined;

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

    const eventBus = {
        on: vi.fn((event: string, cb: () => void) => {
            if (event === "selection.changed") {
                selectionChangedHandler = cb;
            }
        }),
    };

    new FlowNavigation(
        keyboard as never,
        selection as never,
        canvas as never,
        injector as never,
        eventBus as never,
    );

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

    function fireSelectionChanged(): void {
        selectionChangedHandler?.();
    }

    return {
        keyboard,
        selection,
        canvas,
        injector,
        services,
        rootElement,
        dispatch,
        eventBus,
        fireSelectionChanged,
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

    // --- Boundary-event candidate state tests ---

    it("Tab→Enter→Tab: boundary candidate → commit → step from boundary", () => {
        const { selection, dispatch } = build();
        const task = shape("task", "bpmn:Task", 200, 200);
        const end = shape("end", "bpmn:Task", 400, 300);
        const be = attach("be", task, 200, 100);
        const beEnd = shape("beEnd", "bpmn:EndEvent", 400, 100);
        flow("f1", task, end);
        flow("f2", be, beEnd);
        selection.get.mockReturnValue([task]);

        // Tab enters the mixed fan — boundary at y=100 sorts first → candidate.
        dispatch("Tab");
        expect(selection.select).toHaveBeenCalledWith(be);

        // Enter commits the boundary event.
        selection.get.mockReturnValue([be]);
        selection.select.mockClear();
        const enterResult = dispatch("Enter");
        expect(enterResult).toBe(true);
        expect(selection.select).toHaveBeenCalledWith(be);

        // Tab from committed boundary follows its own outgoing flow.
        selection.select.mockClear();
        dispatch("Tab");
        expect(selection.select).toHaveBeenCalledWith(beEnd);
    });

    it("Enter on boundary without candidate state → undefined", () => {
        const { selection, dispatch } = build();
        const task = shape("task", "bpmn:Task", 200, 200);
        const be = attach("be", task, 200, 280);
        selection.get.mockReturnValue([be]);

        expect(dispatch("Enter")).toBeUndefined();
    });

    it("external selection.changed clears boundary candidate state", () => {
        const { selection, dispatch, fireSelectionChanged } = build();
        const task = shape("task", "bpmn:Task", 200, 200);
        const end = shape("end", "bpmn:Task", 400, 300);
        const be = attach("be", task, 200, 100);
        flow("f1", task, end);
        selection.get.mockReturnValue([task]);

        // Tab enters the mixed fan — boundary is candidate.
        dispatch("Tab");
        expect(selection.select).toHaveBeenCalledWith(be);

        // External selection change (e.g. mouse click) clears candidate.
        selection.get.mockReturnValue([be]);
        fireSelectionChanged();

        // Enter on boundary without candidate state → undefined.
        selection.select.mockClear();
        expect(dispatch("Enter")).toBeUndefined();
    });

    it("selection.changed during applySelection does not clear candidate state", () => {
        const { selection, dispatch, fireSelectionChanged } = build();
        const task = shape("task", "bpmn:Task", 200, 200);
        const end = shape("end", "bpmn:Task", 400, 300);
        const be = attach("be", task, 200, 100);
        const beEnd = shape("beEnd", "bpmn:EndEvent", 400, 100);
        flow("f1", task, end);
        flow("f2", be, beEnd);

        // selection.select triggers selection.changed synchronously.
        selection.select.mockImplementation(() => fireSelectionChanged());
        selection.get.mockReturnValue([task]);

        // Tab enters the fan — selection.changed fires during applySelection.
        dispatch("Tab");
        expect(selection.select).toHaveBeenCalledWith(be);

        // boundaryCandidateId survived — Enter commits.
        selection.get.mockReturnValue([be]);
        selection.select.mockClear();
        selection.select.mockImplementation(() => {});
        const enterResult = dispatch("Enter");
        expect(enterResult).toBe(true);
        expect(selection.select).toHaveBeenCalledWith(be);
    });

    it("Shift+Tab from merge with two incoming selects first source shape", () => {
        const { selection, canvas, dispatch } = build();
        const t1 = shape("t1", "bpmn:Task", 100, 100);
        const t2 = shape("t2", "bpmn:Task", 100, 200);
        const merge = shape("merge", "bpmn:ExclusiveGateway", 200, 150);
        flow("f1", t1, merge);
        flow("f2", t2, merge);
        selection.get.mockReturnValue([merge]);

        const result = dispatch("Tab", { shift: true });

        expect(result).toBe(true);
        expect(selection.select).toHaveBeenCalledWith(t1);
        expect(canvas.scrollToElement).toHaveBeenCalledWith(t1);
    });

    it("registers selection.changed listener on eventBus", () => {
        const { eventBus } = build();

        expect(eventBus.on).toHaveBeenCalledWith("selection.changed", expect.any(Function));
    });
});
