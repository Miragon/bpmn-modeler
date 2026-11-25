import EventBus from "diagram-js/lib/core/EventBus";
import { Injector } from "didi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SURFACE_ROOTS } from "../../domain/kernelNames";
import { createKeyboardFocusModule } from "./keyboardFocusModule";

/**
 * The module between diagram-js services and the keyboard-focus feature. The
 * Escape decision table itself is covered by `keyboardFocus.spec.ts`; this pins
 * which service each decision reads and when the handling lives.
 */

function fakeDiagram(options: { searchPad?: boolean; extraRoots?: HTMLElement[] } = {}) {
    const container = document.createElement("div");
    const canvasContainer = document.createElement("div");
    const outsideCanvas = document.createElement("a");
    container.append(canvasContainer, outsideCanvas);
    const panel = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(container, panel, outside);

    const eventBus = new EventBus();
    const canvas = {
        getContainer: () => canvasContainer,
        focus: vi.fn(),
        isFocused: vi.fn(() => false),
    };
    const selection = { get: vi.fn((): unknown[] => []), select: vi.fn() };
    const searchPad = { isOpen: vi.fn(() => false), close: vi.fn() };
    const requested: string[] = [];
    const recording = <T>(name: string, value: T) => {
        const factory = () => {
            requested.push(name);
            return value;
        };
        return ["factory", factory] as const;
    };
    return {
        container,
        canvasContainer,
        outsideCanvas,
        panel,
        outside,
        eventBus,
        canvas,
        selection,
        searchPad,
        requested,
        modules: [
            {
                eventBus: ["value", eventBus],
                canvas: ["value", canvas],
                selection: recording("selection", selection),
                ...(options.searchPad === false
                    ? {}
                    : { searchPad: recording("searchPad", searchPad) }),
                [SURFACE_ROOTS]: ["value", [container, ...(options.extraRoots ?? [])]],
            },
        ],
    };
}

type Diagram = ReturnType<typeof fakeDiagram>;

function build(diagram: Diagram, handleGlobalEscape?: boolean): Diagram {
    new Injector([...diagram.modules, createKeyboardFocusModule({ handleGlobalEscape })]).init();
    return diagram;
}

function initialised(diagram: Diagram, handleGlobalEscape?: boolean): Diagram {
    build(diagram, handleGlobalEscape).eventBus.fire("diagram.init");
    return diagram;
}

function pressEscape(target: EventTarget): void {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

const built: Diagram[] = [];

function surface(options?: Parameters<typeof fakeDiagram>[0]): Diagram {
    const diagram = fakeDiagram(options);
    built.push(diagram);
    return diagram;
}

beforeEach(() => document.body.replaceChildren());

afterEach(() => {
    built.splice(0).forEach(({ eventBus }) => eventBus.fire("diagram.destroy"));
});

describe("createKeyboardFocusModule", () => {
    it("closes an open search pad before refocusing the canvas", () => {
        const diagram = initialised(surface());
        diagram.searchPad.isOpen.mockReturnValue(true);

        pressEscape(diagram.canvasContainer);

        expect(diagram.searchPad.close).toHaveBeenCalledOnce();
        expect(diagram.canvas.focus).toHaveBeenCalledOnce();
    });

    it("never resolves a search pad on a surface that registers none", () => {
        const diagram = initialised(surface({ searchPad: false }));

        expect(() => pressEscape(diagram.canvasContainer)).not.toThrow();
        expect(diagram.requested).not.toContain("searchPad");
        expect(diagram.canvas.focus).toHaveBeenCalledOnce();
    });

    it("clears the selection on Escape while the canvas holds focus", () => {
        const diagram = initialised(surface());
        diagram.canvas.isFocused.mockReturnValue(true);
        diagram.selection.get.mockReturnValue([{ id: "Task_1" }]);

        pressEscape(diagram.canvasContainer);

        expect(diagram.selection.select).toHaveBeenCalledExactlyOnceWith(null);
        expect(diagram.canvas.focus).not.toHaveBeenCalled();
    });

    it("handles Escape from the canvas and the extra roots, not from the rest of the container or page", () => {
        const panel = document.createElement("div");
        const diagram = initialised(surface({ extraRoots: [panel] }));
        document.body.append(panel);

        pressEscape(diagram.outside);
        pressEscape(diagram.outsideCanvas);
        expect(diagram.canvas.focus).not.toHaveBeenCalled();

        pressEscape(panel);
        expect(diagram.canvas.focus).toHaveBeenCalledOnce();
    });

    it("leaves a body-targeted Escape to the page unless global handling is opted in", () => {
        const diagram = initialised(surface());
        pressEscape(document.body);
        expect(diagram.canvas.focus).not.toHaveBeenCalled();

        const global = initialised(surface(), true);
        pressEscape(document.body);
        expect(global.canvas.focus).toHaveBeenCalledOnce();
    });

    it("installs nothing before diagram.init and nothing once diagram.destroy has fired", () => {
        const diagram = build(surface());
        pressEscape(diagram.canvasContainer);
        expect(diagram.canvas.focus).not.toHaveBeenCalled();

        diagram.eventBus.fire("diagram.init");
        diagram.eventBus.fire("diagram.destroy");
        pressEscape(diagram.canvasContainer);

        expect(diagram.canvas.focus).not.toHaveBeenCalled();
    });

    it("installs nothing when an earlier diagram.init listener throws", () => {
        const diagram = build(surface());
        diagram.eventBus.on("diagram.init", () => {
            throw new Error("late poison");
        });

        expect(() => diagram.eventBus.fire("diagram.init")).toThrow("late poison");
        pressEscape(diagram.canvasContainer);

        expect(diagram.canvas.focus).not.toHaveBeenCalled();
    });

    it("tolerates diagram.destroy without a diagram.init", () => {
        const diagram = build(surface());

        expect(() => diagram.eventBus.fire("diagram.destroy")).not.toThrow();
    });
});
