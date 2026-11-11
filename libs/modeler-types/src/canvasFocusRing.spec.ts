import { beforeEach, describe, expect, it } from "vitest";

import { installCanvasFocusRing } from "./canvasFocusRing";

describe("installCanvasFocusRing", () => {
    let container: HTMLElement;
    let emitFocus: (focused: boolean) => void;

    function install(focused: boolean): () => void {
        return installCanvasFocusRing({
            container,
            isFocused: () => focused,
            onFocusChanged: (listener) => {
                emitFocus = listener;
            },
        });
    }

    const ring = () => container.querySelector<HTMLElement>(".canvas-focus-ring");
    const shown = () => ring()?.hidden === false;

    beforeEach(() => {
        container = document.createElement("div");
    });

    it("shows the ring on a canvas that already holds the keyboard", () => {
        install(true);

        expect(shown()).toBe(true);
        expect(ring()?.getAttribute("aria-hidden")).toBe("true");
    });

    it("follows the canvas focus", () => {
        install(false);
        expect(shown()).toBe(false);

        emitFocus(true);
        expect(shown()).toBe(true);

        emitFocus(false);
        expect(shown()).toBe(false);
    });

    // The diagram's event bus offers no way to unsubscribe; its listener outlives the ring.
    it("removes the ring on dispose and ignores later focus changes", () => {
        const dispose = install(true);

        dispose();
        emitFocus(true);

        expect(ring()).toBeNull();
    });
});
