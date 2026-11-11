import { beforeEach, describe, expect, it, vi } from "vitest";

import { installFitViewportButton } from "./fitViewportButton";

function button(parent: HTMLElement): HTMLButtonElement | null {
    return parent.querySelector<HTMLButtonElement>("button.fit-viewport-button");
}

function options(parent: HTMLElement) {
    return { parent, label: "Fit diagram to view", fit: vi.fn(), focusCanvas: vi.fn() };
}

describe("installFitViewportButton", () => {
    let parent: HTMLElement;

    beforeEach(() => {
        parent = document.createElement("div");
        document.body.replaceChildren(parent);
    });

    it("mounts a button named by the translated label", () => {
        installFitViewportButton(options(parent));

        expect(button(parent)?.getAttribute("aria-label")).toBe("Fit diagram to view");
        expect(button(parent)?.title).toBe("Fit diagram to view");
        expect(button(parent)?.type).toBe("button");
    });

    it("fits the diagram and hands the keyboard back to the canvas on a pointer click", () => {
        const install = options(parent);
        installFitViewportButton(install);

        button(parent)!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));

        expect(install.fit).toHaveBeenCalledOnce();
        expect(install.focusCanvas).toHaveBeenCalledOnce();
    });

    // Enter and Space click with detail 0; the focus stays so the next press fits again.
    it("keeps the focus on the button when the keyboard presses it", () => {
        const install = options(parent);
        installFitViewportButton(install);

        button(parent)!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));

        expect(install.fit).toHaveBeenCalledOnce();
        expect(install.focusCanvas).not.toHaveBeenCalled();
    });

    it("removes the button on dispose", () => {
        const dispose = installFitViewportButton(options(parent));

        dispose();

        expect(button(parent)).toBeNull();
    });
});
