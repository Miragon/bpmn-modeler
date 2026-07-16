import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { installKeyboardFocus } from "./keyboardFocus";

const focusCanvas = vi.fn();
const isSearchPadOpen = vi.fn<() => boolean>();
const closeSearchPad = vi.fn();

/** Dispatches a bubble-phase keydown on `document`, honouring preventDefault. */
function dispatchKeydown(key: string, defaultPrevented = false): void {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    if (defaultPrevented) {
        // Mark as already-handled the way an earlier listener would.
        event.preventDefault();
    }
    document.dispatchEvent(event);
}

// Install exactly once: installKeyboardFocus adds a document listener with no
// removal API, so reinstalling per-test would stack duplicate listeners that
// all fire on the same keydown and inflate the mock call counts.
beforeAll(() => {
    installKeyboardFocus({
        focusCanvas: () => focusCanvas(),
        isSearchPadOpen: () => isSearchPadOpen(),
        closeSearchPad: () => closeSearchPad(),
    });
});

beforeEach(() => {
    focusCanvas.mockReset();
    isSearchPadOpen.mockReset();
    closeSearchPad.mockReset();
    isSearchPadOpen.mockReturnValue(false);
});

describe("installKeyboardFocus", () => {
    it("focuses the canvas on Escape", () => {
        dispatchKeydown("Escape");
        expect(focusCanvas).toHaveBeenCalledTimes(1);
        expect(closeSearchPad).not.toHaveBeenCalled();
    });

    it("ignores keys other than Escape", () => {
        dispatchKeydown("a");
        expect(focusCanvas).not.toHaveBeenCalled();
    });

    it("does nothing when the Escape was already handled (defaultPrevented)", () => {
        dispatchKeydown("Escape", true);
        expect(focusCanvas).not.toHaveBeenCalled();
        expect(closeSearchPad).not.toHaveBeenCalled();
    });

    it("closes the search pad then focuses the canvas when the pad is open", () => {
        isSearchPadOpen.mockReturnValue(true);
        dispatchKeydown("Escape");
        expect(closeSearchPad).toHaveBeenCalledTimes(1);
        expect(focusCanvas).toHaveBeenCalledTimes(1);
    });
});
