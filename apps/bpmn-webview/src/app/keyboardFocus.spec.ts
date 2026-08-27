import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installKeyboardFocus, type KeyboardFocusDeps } from "./keyboardFocus";

/**
 * A fresh set of spy deps over a single-element root appended to the document,
 * so a keydown fired inside `root` reaches the document listener through bubbling
 * and passes the root-scoping gate.
 */
function makeDeps(
    root: HTMLElement,
    overrides: Partial<KeyboardFocusDeps> = {},
): KeyboardFocusDeps {
    return {
        roots: [root],
        focusCanvas: vi.fn(),
        isCanvasFocused: vi.fn<() => boolean>().mockReturnValue(false),
        hasSelection: vi.fn<() => boolean>().mockReturnValue(false),
        clearSelection: vi.fn(),
        isSearchPadOpen: vi.fn<() => boolean>().mockReturnValue(false),
        closeSearchPad: vi.fn(),
        ...overrides,
    };
}

/** Dispatches a bubble-phase keydown on `target`, honouring preventDefault. */
function fireKeydown(target: EventTarget, key: string, defaultPrevented = false): void {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    if (defaultPrevented) {
        event.preventDefault();
    }
    target.dispatchEvent(event);
}

let root: HTMLElement;
let child: HTMLElement;
let disposers: Array<() => void>;

beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    child = document.createElement("div");
    root.appendChild(child);
    document.body.appendChild(root);
    disposers = [];
});

afterEach(() => {
    disposers.forEach((dispose) => dispose());
});

/** Installs and records the disposer so no listener leaks into the next test. */
function install(deps: KeyboardFocusDeps): void {
    disposers.push(installKeyboardFocus(deps));
}

describe("installKeyboardFocus", () => {
    it("focuses the canvas on Escape inside a root", () => {
        const deps = makeDeps(root);
        install(deps);

        fireKeydown(child, "Escape");

        expect(deps.focusCanvas).toHaveBeenCalledTimes(1);
        expect(deps.closeSearchPad).not.toHaveBeenCalled();
    });

    it("ignores keys other than Escape", () => {
        const deps = makeDeps(root);
        install(deps);

        fireKeydown(child, "a");

        expect(deps.focusCanvas).not.toHaveBeenCalled();
    });

    it("does nothing when the Escape was already handled (defaultPrevented)", () => {
        const deps = makeDeps(root);
        install(deps);

        fireKeydown(child, "Escape", true);

        expect(deps.focusCanvas).not.toHaveBeenCalled();
        expect(deps.closeSearchPad).not.toHaveBeenCalled();
    });

    it("closes the search pad then focuses the canvas when the pad is open", () => {
        const deps = makeDeps(root, {
            isSearchPadOpen: vi.fn<() => boolean>().mockReturnValue(true),
        });
        install(deps);

        fireKeydown(child, "Escape");

        expect(deps.closeSearchPad).toHaveBeenCalledTimes(1);
        expect(deps.focusCanvas).toHaveBeenCalledTimes(1);
    });

    it("keeps the selection when Escape only re-homes focus onto the canvas", () => {
        // Focus sits e.g. in the properties panel of the selected element —
        // clearing the selection here would blank that panel mid-edit.
        const deps = makeDeps(root, {
            isCanvasFocused: vi.fn<() => boolean>().mockReturnValue(false),
            hasSelection: vi.fn<() => boolean>().mockReturnValue(true),
        });
        install(deps);

        fireKeydown(child, "Escape");

        expect(deps.focusCanvas).toHaveBeenCalledTimes(1);
        expect(deps.clearSelection).not.toHaveBeenCalled();
    });

    it("clears the selection when Escape hits the already-focused canvas", () => {
        const deps = makeDeps(root, {
            isCanvasFocused: vi.fn<() => boolean>().mockReturnValue(true),
            hasSelection: vi.fn<() => boolean>().mockReturnValue(true),
        });
        install(deps);

        fireKeydown(child, "Escape");

        expect(deps.clearSelection).toHaveBeenCalledTimes(1);
        expect(deps.focusCanvas).not.toHaveBeenCalled();
    });

    it("leaves an empty selection alone on the focused canvas", () => {
        const deps = makeDeps(root, {
            isCanvasFocused: vi.fn<() => boolean>().mockReturnValue(true),
            hasSelection: vi.fn<() => boolean>().mockReturnValue(false),
        });
        install(deps);

        fireKeydown(child, "Escape");

        expect(deps.clearSelection).not.toHaveBeenCalled();
        expect(deps.focusCanvas).toHaveBeenCalledTimes(1);
    });
});

describe("installKeyboardFocus: root scoping", () => {
    it("ignores an Escape targeting a node outside all roots", () => {
        const deps = makeDeps(root);
        install(deps);

        // document.body is not contained by root; handleGlobalEscape defaults off.
        fireKeydown(document.body, "Escape");

        expect(deps.focusCanvas).not.toHaveBeenCalled();
    });

    it("handles a body-targeted Escape only when handleGlobalEscape is set", () => {
        const deps = makeDeps(root, { handleGlobalEscape: true });
        install(deps);

        fireKeydown(document.body, "Escape");

        expect(deps.focusCanvas).toHaveBeenCalledTimes(1);
    });

    it("does not cross-fire between two independent instances", () => {
        const rootB = document.createElement("div");
        const childB = document.createElement("div");
        rootB.appendChild(childB);
        document.body.appendChild(rootB);

        const depsA = makeDeps(root);
        const depsB = makeDeps(rootB);
        install(depsA);
        install(depsB);

        fireKeydown(child, "Escape");

        expect(depsA.focusCanvas).toHaveBeenCalledTimes(1);
        expect(depsB.focusCanvas).not.toHaveBeenCalled();
    });
});

describe("installKeyboardFocus: disposer", () => {
    it("removes the document listener so later Escapes are ignored", () => {
        const deps = makeDeps(root);
        const dispose = installKeyboardFocus(deps);

        dispose();
        fireKeydown(child, "Escape");

        expect(deps.focusCanvas).not.toHaveBeenCalled();
    });
});
