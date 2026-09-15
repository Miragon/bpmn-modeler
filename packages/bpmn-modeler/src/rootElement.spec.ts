import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasRootElementManager } from "./rootElement";
import type { CoreServiceAccessor } from "./coreServices";

function setup(currentRootId: string, elements: Record<string, unknown> = {}) {
    const setRootElement = vi.fn();
    const canvas = {
        getRootElement: vi.fn().mockReturnValue({ id: currentRootId }),
        setRootElement,
    };
    const elementRegistry = {
        get: vi.fn((id: string) => elements[id]),
    };
    const listeners: Record<string, ((event: unknown) => void)[]> = {};
    const eventBus = {
        on: (event: string, handler: (event: unknown) => void) => {
            (listeners[event] ??= []).push(handler);
        },
        off: (event: string, handler: (event: unknown) => void) => {
            const handlers = listeners[event];
            if (!handlers) return;
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        },
    };
    const manager = new CanvasRootElementManager(((name: string) => {
        if (name === "canvas") return canvas;
        if (name === "elementRegistry") return elementRegistry;
        if (name === "eventBus") return eventBus;
        throw new Error(`unexpected service: ${name}`);
    }) as unknown as CoreServiceAccessor);
    const emitRootSet = (elementId: string) =>
        (listeners["root.set"] ?? []).forEach((handler) => handler({ element: { id: elementId } }));
    const listenerCount = (event: string) => (listeners[event] ?? []).length;
    return { manager, canvas, elementRegistry, setRootElement, emitRootSet, listenerCount };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("RootElementManager.getRootElementId", () => {
    it("returns the current root ID for a user-created root", () => {
        const { manager } = setup("SubProcess_1_plane");
        expect(manager.getRootElementId()).toBe("SubProcess_1_plane");
    });

    it("returns undefined for the implicit root", () => {
        const { manager } = setup("__implicitrootbase");
        expect(manager.getRootElementId()).toBeUndefined();
    });

    it("returns undefined when canvas has no root element", () => {
        const canvas = { getRootElement: vi.fn().mockReturnValue(null) };
        const manager = new CanvasRootElementManager(((name: string) => {
            if (name === "canvas") return canvas;
            throw new Error(`unexpected service: ${name}`);
        }) as unknown as CoreServiceAccessor);
        expect(manager.getRootElementId()).toBeUndefined();
    });
});

describe("RootElementManager.setRootElementById", () => {
    it("switches the canvas root to the element with the given ID", () => {
        const planeElement = { id: "SubProcess_1_plane" };
        const { manager, setRootElement } = setup("Process_1", {
            SubProcess_1_plane: planeElement,
        });

        expect(manager.setRootElementById("SubProcess_1_plane")).toBe(true);
        expect(setRootElement).toHaveBeenCalledWith(planeElement);
    });

    it("returns false when the element does not exist", () => {
        const { manager, setRootElement } = setup("Process_1");

        expect(manager.setRootElementById("removed_plane")).toBe(false);
        expect(setRootElement).not.toHaveBeenCalled();
    });

    it("returns false when the element is already the current root", () => {
        const { manager, setRootElement } = setup("SubProcess_1_plane", {
            SubProcess_1_plane: { id: "SubProcess_1_plane" },
        });

        expect(manager.setRootElementById("SubProcess_1_plane")).toBe(false);
        expect(setRootElement).not.toHaveBeenCalled();
    });

    it("returns false for undefined id", () => {
        const { manager, setRootElement } = setup("Process_1");

        expect(manager.setRootElementById(undefined)).toBe(false);
        expect(setRootElement).not.toHaveBeenCalled();
    });
});

describe("RootElementManager.onRootChanged", () => {
    it("fires the callback with the new root ID", () => {
        const { manager, emitRootSet } = setup("Process_1");
        const cb = vi.fn();
        manager.onRootChanged(cb);

        emitRootSet("SubProcess_1_plane");

        expect(cb).toHaveBeenCalledWith("SubProcess_1_plane");
    });

    it("fires undefined for the implicit root", () => {
        const { manager, emitRootSet } = setup("Process_1");
        const cb = vi.fn();
        manager.onRootChanged(cb);

        emitRootSet("__implicitrootbase");

        expect(cb).toHaveBeenCalledWith(undefined);
    });

    it("detaches its listener on dispose", () => {
        const { manager, emitRootSet, listenerCount } = setup("Process_1");
        const cb = vi.fn();

        const dispose = manager.onRootChanged(cb);
        dispose();
        emitRootSet("SubProcess_1_plane");

        expect(cb).not.toHaveBeenCalled();
        expect(listenerCount("root.set")).toBe(0);
    });
});
