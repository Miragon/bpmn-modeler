import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { focusCanvasFromKeystroke } from "./focusCanvasFromKeystroke";

describe("focusCanvasFromKeystroke", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.replaceChildren();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("focuses the canvas at once", () => {
        const focusCanvas = vi.fn();

        focusCanvasFromKeystroke(focusCanvas);

        expect(focusCanvas).toHaveBeenCalledOnce();
    });

    // A browser's own Escape handling may blur the focused element after the page's handlers ran.
    it("takes the focus back when the rest of the keystroke drops it into nothing", () => {
        const focusCanvas = vi.fn();

        focusCanvasFromKeystroke(focusCanvas);
        (document.activeElement as HTMLElement | null)?.blur();
        vi.runAllTimers();

        expect(focusCanvas).toHaveBeenCalledTimes(2);
    });

    it("leaves the focus where the rest of the keystroke put it", () => {
        const focusCanvas = vi.fn();
        const field = document.createElement("input");
        document.body.append(field);

        focusCanvasFromKeystroke(focusCanvas);
        field.focus();
        vi.runAllTimers();

        expect(focusCanvas).toHaveBeenCalledOnce();
    });
});
