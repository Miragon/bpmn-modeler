import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installSurfaceFocusFeatures } from "./focusFeatures";

/**
 * The adapter between diagram-js services and the keyboard-focus / focus
 * indicator features. The Escape decision table itself is covered by
 * `keyboardFocus.spec.ts`; this pins which service each decision reads.
 */

type EventHandler = (event: never) => void;

function fakeSurface() {
    const canvasContainer = document.createElement("div");
    const panel = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(canvasContainer, panel, outside);

    const eventHandlers = new Map<string, EventHandler>();
    const canvas = {
        getContainer: () => canvasContainer,
        focus: vi.fn(),
        isFocused: vi.fn(() => false),
    };
    const selection = { get: vi.fn((): unknown[] => []), select: vi.fn() };
    const searchPad = { isOpen: vi.fn(() => false), close: vi.fn() };
    const services: Record<string, unknown> = {
        canvas,
        eventBus: {
            on: (event: string, handler: EventHandler) => eventHandlers.set(event, handler),
        },
        selection,
        searchPad,
    };
    const requestedServices: string[] = [];
    // Mirrors didi: an unregistered name throws instead of resolving to undefined.
    const getService = <T>(name: string): T => {
        requestedServices.push(name);
        if (!(name in services)) {
            throw new Error(`No provider for "${name}"!`);
        }
        return services[name] as T;
    };

    return {
        canvasContainer,
        panel,
        outside,
        getService,
        requestedServices,
        canvas,
        selection,
        searchPad,
        removeService: (name: string) => delete services[name],
        fire: (event: string, payload: unknown) =>
            (eventHandlers.get(event) as (payload: unknown) => void)(payload),
    };
}

function pressEscape(target: EventTarget): void {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

let surface: ReturnType<typeof fakeSurface>;
const disposers: Array<() => void> = [];

function install(options: Parameters<typeof installSurfaceFocusFeatures>[1]): () => void {
    const dispose = installSurfaceFocusFeatures(surface.getService, options);
    disposers.push(dispose);
    return dispose;
}

beforeEach(() => {
    document.body.replaceChildren();
    surface = fakeSurface();
});

afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose());
});

describe("installSurfaceFocusFeatures", () => {
    it("tracks canvas focus and selection on the focus indicator", () => {
        install({ hasSearchPad: true });
        const indicator = surface.canvasContainer.querySelector(".canvas-focus-indicator")!;

        surface.fire("canvas.focus.changed", { focused: true });
        expect(indicator.classList.contains("is-focused")).toBe(true);

        surface.fire("selection.changed", { newSelection: [{ id: "Task_1" }] });
        expect(indicator.classList.contains("is-focused")).toBe(false);
    });

    it("closes an open search pad before refocusing the canvas", () => {
        install({ hasSearchPad: true });
        surface.searchPad.isOpen.mockReturnValue(true);

        pressEscape(surface.canvasContainer);

        expect(surface.searchPad.close).toHaveBeenCalledOnce();
        expect(surface.canvas.focus).toHaveBeenCalledOnce();
    });

    it("never resolves a search pad on a surface that registers none", () => {
        surface.removeService("searchPad");
        install({ hasSearchPad: false });

        expect(() => pressEscape(surface.canvasContainer)).not.toThrow();
        expect(surface.requestedServices).not.toContain("searchPad");
        expect(surface.canvas.focus).toHaveBeenCalledOnce();
    });

    it("clears the selection on Escape while the canvas holds focus", () => {
        install({ hasSearchPad: true });
        surface.canvas.isFocused.mockReturnValue(true);
        surface.selection.get.mockReturnValue([{ id: "Task_1" }]);

        pressEscape(surface.canvasContainer);

        expect(surface.selection.select).toHaveBeenCalledExactlyOnceWith(null);
        expect(surface.canvas.focus).not.toHaveBeenCalled();
    });

    it("handles Escape from the extra roots but not from elsewhere on the page", () => {
        install({ hasSearchPad: true, extraRoots: [surface.panel] });

        pressEscape(surface.outside);
        expect(surface.canvas.focus).not.toHaveBeenCalled();

        pressEscape(surface.panel);
        expect(surface.canvas.focus).toHaveBeenCalledOnce();
    });

    it("leaves a body-targeted Escape to the page unless global handling is opted in", () => {
        install({ hasSearchPad: true });
        pressEscape(document.body);
        expect(surface.canvas.focus).not.toHaveBeenCalled();

        install({ hasSearchPad: true, handleGlobalEscape: true });
        pressEscape(document.body);
        expect(surface.canvas.focus).toHaveBeenCalledOnce();
    });

    it("removes the indicator and stops handling Escape once disposed", () => {
        const dispose = install({ hasSearchPad: true });

        dispose();
        pressEscape(surface.canvasContainer);

        expect(surface.canvasContainer.querySelector(".canvas-focus-indicator")).toBeNull();
        expect(surface.canvas.focus).not.toHaveBeenCalled();
    });
});
