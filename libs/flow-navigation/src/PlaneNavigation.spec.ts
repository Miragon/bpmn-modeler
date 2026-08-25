import { describe, expect, it, vi } from "vitest";

import { PlaneNavigation } from "./PlaneNavigation";
import type { NavElement } from "./traversal";

// ---------------------------------------------------------------------------
// Graph builders
// ---------------------------------------------------------------------------

function shape(id: string, type: string, x: number, y: number): NavElement {
    return { id, type, x, y, incoming: [], outgoing: [] };
}

// ---------------------------------------------------------------------------
// Test harness — mirrors FlowNavigation.spec.ts style.
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

    const rootElement: NavElement = {
        id: "root",
        type: "bpmn:Process",
        x: 0,
        y: 0,
        incoming: [],
        outgoing: [],
    };

    const roots: Record<string, NavElement> = {};

    const canvas = {
        getRootElement: vi.fn((): NavElement => rootElement),
        findRoot: vi.fn((id: string) => roots[id]),
        setRootElement: vi.fn(),
        scrollToElement: vi.fn(),
    };

    const registry: Record<string, NavElement> = {};

    const elementRegistry = {
        get: vi.fn((id: string) => registry[id]),
    };

    const services: Record<string, unknown> = {};
    const injector = {
        get: vi.fn((name: string) => services[name] ?? null),
    };

    new PlaneNavigation(
        keyboard as never,
        selection as never,
        canvas as never,
        elementRegistry as never,
        injector as never,
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

    return {
        keyboard,
        selection,
        canvas,
        rootElement,
        roots,
        registry,
        elementRegistry,
        injector,
        services,
        dispatch,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PlaneNavigation", () => {
    // --- Drill-in (Enter) ---

    it("Enter on collapsed subprocess drills into its plane and selects start event", () => {
        const { selection, canvas, roots, dispatch } = build();

        const subprocess = shape("sub1", "bpmn:SubProcess", 200, 200);
        const startEvent = shape("start1", "bpmn:StartEvent", 100, 100);
        const planeRoot: NavElement = {
            id: "sub1_plane",
            type: "bpmn:Process",
            x: 0,
            y: 0,
            incoming: [],
            outgoing: [],
            children: [startEvent],
        };
        roots["sub1_plane"] = planeRoot;
        selection.get.mockReturnValue([subprocess]);

        const result = dispatch("Enter");

        expect(result).toBe(true);
        expect(canvas.setRootElement).toHaveBeenCalledWith(planeRoot);
        expect(selection.select).toHaveBeenCalledWith(startEvent);
        expect(canvas.scrollToElement).toHaveBeenCalledWith(startEvent);
    });

    it("Enter on shape without a plane → undefined", () => {
        const { selection, canvas, dispatch } = build();

        const task = shape("task1", "bpmn:Task", 200, 200);
        selection.get.mockReturnValue([task]);

        expect(dispatch("Enter")).toBeUndefined();
        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("Enter with 0 selected → undefined", () => {
        const { selection, canvas, dispatch } = build();

        selection.get.mockReturnValue([]);

        expect(dispatch("Enter")).toBeUndefined();
        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("Enter with 2+ selected → undefined", () => {
        const { selection, canvas, roots, dispatch } = build();

        const sub1 = shape("sub1", "bpmn:SubProcess", 100, 100);
        const sub2 = shape("sub2", "bpmn:SubProcess", 200, 200);
        roots["sub1_plane"] = { ...shape("sub1_plane", "bpmn:Process", 0, 0), children: [] };
        selection.get.mockReturnValue([sub1, sub2]);

        expect(dispatch("Enter")).toBeUndefined();
        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("Enter with Cmd → undefined", () => {
        const { selection, canvas, roots, dispatch } = build();

        const subprocess = shape("sub1", "bpmn:SubProcess", 200, 200);
        roots["sub1_plane"] = { ...shape("sub1_plane", "bpmn:Process", 0, 0), children: [] };
        selection.get.mockReturnValue([subprocess]);

        expect(dispatch("Enter", { ctrl: true })).toBeUndefined();
        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("Enter with Alt → undefined", () => {
        const { selection, canvas, roots, dispatch } = build();

        const subprocess = shape("sub1", "bpmn:SubProcess", 200, 200);
        roots["sub1_plane"] = { ...shape("sub1_plane", "bpmn:Process", 0, 0), children: [] };
        selection.get.mockReturnValue([subprocess]);

        expect(dispatch("Enter", { alt: true })).toBeUndefined();
        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("Shift+Enter on collapsed subprocess → undefined (no drill-in)", () => {
        const { selection, canvas, roots, dispatch } = build();

        const subprocess = shape("sub1", "bpmn:SubProcess", 200, 200);
        roots["sub1_plane"] = { ...shape("sub1_plane", "bpmn:Process", 0, 0), children: [] };
        selection.get.mockReturnValue([subprocess]);

        expect(dispatch("Enter", { shift: true })).toBeUndefined();
        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("Enter into empty subprocess plane → root changes, no selection, still consumed", () => {
        const { selection, canvas, roots, dispatch } = build();

        const subprocess = shape("sub1", "bpmn:SubProcess", 200, 200);
        const emptyPlane: NavElement = {
            id: "sub1_plane",
            type: "bpmn:Process",
            x: 0,
            y: 0,
            incoming: [],
            outgoing: [],
            children: [],
        };
        roots["sub1_plane"] = emptyPlane;
        selection.get.mockReturnValue([subprocess]);

        const result = dispatch("Enter");

        expect(result).toBe(true);
        expect(canvas.setRootElement).toHaveBeenCalledWith(emptyPlane);
        expect(selection.select).not.toHaveBeenCalled();
    });

    // --- Drill-out (u) ---

    it("u inside a plane → parent root set, subprocess selected", () => {
        const { canvas, selection, registry, dispatch } = build();

        const parentRoot: NavElement = {
            id: "root",
            type: "bpmn:Process",
            x: 0,
            y: 0,
            incoming: [],
            outgoing: [],
        };
        const subprocess = shape("sub1", "bpmn:SubProcess", 200, 200);
        subprocess.parent = parentRoot;
        registry["sub1"] = subprocess;

        const planeRoot: NavElement = {
            id: "sub1_plane",
            type: "bpmn:Process",
            x: 0,
            y: 0,
            incoming: [],
            outgoing: [],
        };
        canvas.getRootElement.mockReturnValue(planeRoot);

        const result = dispatch("u");

        expect(result).toBe(true);
        expect(canvas.setRootElement).toHaveBeenCalledWith(parentRoot);
        expect(selection.select).toHaveBeenCalledWith(subprocess);
        expect(canvas.scrollToElement).toHaveBeenCalledWith(subprocess);
    });

    it("u at top level → undefined", () => {
        const { canvas, dispatch } = build();

        expect(dispatch("u")).toBeUndefined();
        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("nested plane goes up exactly one level", () => {
        const { canvas, selection, registry, dispatch } = build();

        const sub1Plane: NavElement = {
            id: "sub1_plane",
            type: "bpmn:Process",
            x: 0,
            y: 0,
            incoming: [],
            outgoing: [],
        };

        const sub2 = shape("sub2", "bpmn:SubProcess", 100, 100);
        sub2.parent = sub1Plane;
        registry["sub2"] = sub2;

        const sub2Plane: NavElement = {
            id: "sub2_plane",
            type: "bpmn:Process",
            x: 0,
            y: 0,
            incoming: [],
            outgoing: [],
        };
        canvas.getRootElement.mockReturnValue(sub2Plane);

        const result = dispatch("u");

        expect(result).toBe(true);
        expect(canvas.setRootElement).toHaveBeenCalledWith(sub1Plane);
        expect(selection.select).toHaveBeenCalledWith(sub2);
    });

    // --- Guard tests ---

    it("directEditing active suppresses Enter and u", () => {
        const { services, canvas, dispatch } = build();
        services.directEditing = { isActive: () => true };

        expect(dispatch("Enter")).toBeUndefined();
        expect(dispatch("u")).toBeUndefined();
        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("popupMenu open suppresses Enter and u", () => {
        const { services, canvas, dispatch } = build();
        services.popupMenu = { isOpen: () => true };

        expect(dispatch("Enter")).toBeUndefined();
        expect(dispatch("u")).toBeUndefined();
        expect(canvas.setRootElement).not.toHaveBeenCalled();
    });

    it("ignores unrelated keys", () => {
        const { dispatch } = build();

        expect(dispatch("Tab")).toBeUndefined();
        expect(dispatch("a")).toBeUndefined();
        expect(dispatch("Escape")).toBeUndefined();
    });
});
