import { afterEach, describe, expect, it, vi } from "vitest";

import { RootElementManager } from "./rootElement";

function setup(currentRootId: string, elements: Record<string, unknown> = {}) {
    const setRootElement = vi.fn();
    const canvas = {
        getRootElement: vi.fn().mockReturnValue({ id: currentRootId }),
        setRootElement,
    };
    const elementRegistry = {
        get: vi.fn((id: string) => elements[id]),
    };
    const listeners: Record<string, (event: any) => void> = {};
    const eventBus = {
        on: (event: string, handler: (event: any) => void) => {
            listeners[event] = handler;
        },
    };
    const manager = new RootElementManager((name: string) => {
        if (name === "canvas") return canvas as any;
        if (name === "elementRegistry") return elementRegistry as any;
        if (name === "eventBus") return eventBus as any;
        throw new Error(`unexpected service: ${name}`);
    });
    const emitRootSet = (elementId: string) =>
        listeners["root.set"]?.({ element: { id: elementId } });
    return { manager, canvas, elementRegistry, setRootElement, emitRootSet };
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
        const manager = new RootElementManager((name: string) => {
            if (name === "canvas") return canvas as any;
            throw new Error(`unexpected service: ${name}`);
        });
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
});
