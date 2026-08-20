// @vitest-environment jsdom

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { installUndoRedoKeydownGuard } from "./modelerKeyboard";

const modelerKeyboardSpy = vi.fn<(event: KeyboardEvent) => void>();
const hostForwarderSpy = vi.fn<(event: KeyboardEvent) => void>();
let disposeGuard: () => void;

beforeAll(() => {
    disposeGuard = installUndoRedoKeydownGuard(document);
    document.addEventListener("keydown", modelerKeyboardSpy);
    window.addEventListener("keydown", hostForwarderSpy);
});

afterAll(() => {
    disposeGuard();
    document.removeEventListener("keydown", modelerKeyboardSpy);
    window.removeEventListener("keydown", hostForwarderSpy);
});

beforeEach(() => {
    document.body.innerHTML = "";
    modelerKeyboardSpy.mockReset();
    hostForwarderSpy.mockReset();
});

function focusedElement(tagName: "div" | "textarea"): HTMLElement {
    const element = document.createElement(tagName);
    element.tabIndex = 0;
    document.body.appendChild(element);
    element.focus();
    return element;
}

function shortcut(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
    return new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        key,
        ...options,
    });
}

describe("installUndoRedoKeydownGuard", () => {
    it.each([
        shortcut("z"),
        shortcut("y"),
        shortcut("z", { shiftKey: true }),
        shortcut("z", { ctrlKey: false, metaKey: true }),
    ])("keeps a modeler undo or redo shortcut inside the webview", (event) => {
        focusedElement("div").dispatchEvent(event);

        expect(modelerKeyboardSpy).toHaveBeenCalledOnce();
        expect(hostForwarderSpy).not.toHaveBeenCalled();
    });

    it("leaves undo in a textarea to the browser", () => {
        const event = shortcut("z");

        focusedElement("textarea").dispatchEvent(event);

        expect(modelerKeyboardSpy).not.toHaveBeenCalled();
        expect(hostForwarderSpy).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it("leaves redo in a contenteditable to the browser", () => {
        const editor = focusedElement("div");
        editor.contentEditable = "true";
        const event = shortcut("z", { shiftKey: true });

        editor.dispatchEvent(event);

        expect(modelerKeyboardSpy).not.toHaveBeenCalled();
        expect(hostForwarderSpy).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it("does not intercept unrelated host shortcuts", () => {
        focusedElement("div").dispatchEvent(shortcut("w"));

        expect(modelerKeyboardSpy).toHaveBeenCalledOnce();
        expect(hostForwarderSpy).toHaveBeenCalledOnce();
    });
});
