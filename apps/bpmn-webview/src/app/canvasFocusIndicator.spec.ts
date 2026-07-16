import { beforeEach, describe, expect, it } from "vitest";

import { installCanvasFocusIndicator } from "./canvasFocusIndicator";

let parent: HTMLElement;
// Captured listeners the module registers via onFocusChanged/onSelectionChanged,
// so tests can drive events the way diagram-js's eventBus would.
let emitFocus: (focused: boolean) => void;
let emitSelection: (hasSelection: boolean) => void;

function install(isFocused: boolean, hasSelection = false): HTMLElement {
    installCanvasFocusIndicator({
        parent,
        isFocused: () => isFocused,
        onFocusChanged: (listener) => {
            emitFocus = listener;
        },
        hasSelection: () => hasSelection,
        onSelectionChanged: (listener) => {
            emitSelection = listener;
        },
    });
    return parent.querySelector(".canvas-focus-indicator") as HTMLElement;
}

beforeEach(() => {
    parent = document.createElement("div");
});

describe("installCanvasFocusIndicator", () => {
    it("appends exactly one aria-hidden indicator", () => {
        install(false);
        const roots = parent.querySelectorAll(".canvas-focus-indicator");
        expect(roots).toHaveLength(1);
        expect(roots[0].getAttribute("aria-hidden")).toBe("true");
    });

    it("renders both the idle and focused glyphs", () => {
        const root = install(false);
        expect(root.querySelector("svg.canvas-focus-indicator__off")).not.toBeNull();
        expect(root.querySelector("svg.canvas-focus-indicator__on")).not.toBeNull();
    });

    it("honors the initial focused state", () => {
        expect(install(true).classList.contains("is-focused")).toBe(true);
    });

    it("honors the initial unfocused state", () => {
        expect(install(false).classList.contains("is-focused")).toBe(false);
    });

    it("toggles is-focused when the focus signal fires", () => {
        const root = install(false);
        emitFocus(true);
        expect(root.classList.contains("is-focused")).toBe(true);
        emitFocus(false);
        expect(root.classList.contains("is-focused")).toBe(false);
    });

    it("is idempotent for repeated same-value signals", () => {
        const root = install(false);
        emitFocus(true);
        emitFocus(true);
        expect(parent.querySelectorAll(".canvas-focus-indicator")).toHaveLength(1);
        expect(root.classList.contains("is-focused")).toBe(true);
    });

    it("stays idle when focused with an element selected", () => {
        expect(install(true, true).classList.contains("is-focused")).toBe(false);
    });

    it("turns off while a selection exists and back on once it clears", () => {
        const root = install(true);
        emitSelection(true);
        expect(root.classList.contains("is-focused")).toBe(false);
        emitSelection(false);
        expect(root.classList.contains("is-focused")).toBe(true);
    });

    it("ignores a selection change while the canvas is not focused", () => {
        const root = install(false);
        emitSelection(true);
        emitSelection(false);
        expect(root.classList.contains("is-focused")).toBe(false);
    });
});
