import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { installKeyboardFocus } from "./keyboardFocus";

const focusCanvas = vi.fn();
const isCanvasFocused = vi.fn<() => boolean>();
const hasSelection = vi.fn<() => boolean>();
const clearSelection = vi.fn();
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
        isCanvasFocused: () => isCanvasFocused(),
        hasSelection: () => hasSelection(),
        clearSelection: () => clearSelection(),
        isSearchPadOpen: () => isSearchPadOpen(),
        closeSearchPad: () => closeSearchPad(),
    });
});

beforeEach(() => {
    focusCanvas.mockReset();
    isCanvasFocused.mockReset();
    hasSelection.mockReset();
    clearSelection.mockReset();
    isSearchPadOpen.mockReset();
    closeSearchPad.mockReset();
    isCanvasFocused.mockReturnValue(false);
    hasSelection.mockReturnValue(false);
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

    it("keeps the selection when Escape only re-homes focus onto the canvas", () => {
        // Focus sits e.g. in the properties panel of the selected element —
        // clearing the selection here would blank that panel mid-edit.
        isCanvasFocused.mockReturnValue(false);
        hasSelection.mockReturnValue(true);
        dispatchKeydown("Escape");
        expect(focusCanvas).toHaveBeenCalledTimes(1);
        expect(clearSelection).not.toHaveBeenCalled();
    });

    it("clears the selection when Escape hits the already-focused canvas", () => {
        isCanvasFocused.mockReturnValue(true);
        hasSelection.mockReturnValue(true);
        dispatchKeydown("Escape");
        expect(clearSelection).toHaveBeenCalledTimes(1);
        expect(focusCanvas).not.toHaveBeenCalled();
    });

    it("leaves an empty selection alone on the focused canvas", () => {
        isCanvasFocused.mockReturnValue(true);
        hasSelection.mockReturnValue(false);
        dispatchKeydown("Escape");
        expect(clearSelection).not.toHaveBeenCalled();
        expect(focusCanvas).toHaveBeenCalledTimes(1);
    });
});
