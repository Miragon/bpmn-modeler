import { beforeEach, describe, expect, it } from "vitest";

import { installCanvasFocusIndicator } from "./canvasFocusIndicator";

let parent: HTMLElement;
// Captured listener the module registers via onFocusChanged, so tests can
// drive focus-change events the way diagram-js's eventBus would.
let emit: (focused: boolean) => void;

function install(isFocused: boolean): HTMLElement {
    installCanvasFocusIndicator({
        parent,
        isFocused: () => isFocused,
        onFocusChanged: (listener) => {
            emit = listener;
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
        emit(true);
        expect(root.classList.contains("is-focused")).toBe(true);
        emit(false);
        expect(root.classList.contains("is-focused")).toBe(false);
    });

    it("is idempotent for repeated same-value signals", () => {
        const root = install(false);
        emit(true);
        emit(true);
        expect(parent.querySelectorAll(".canvas-focus-indicator")).toHaveLength(1);
        expect(root.classList.contains("is-focused")).toBe(true);
    });
});
