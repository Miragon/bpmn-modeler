import { describe, expect, it, vi } from "vitest";

import { ScriptEditorKeyboard } from "./scriptEditorKeyboard";

// ---------------------------------------------------------------------------
// Test harness — mirrors the flow-navigation keyboard spec style.
// ---------------------------------------------------------------------------

function build() {
    let listener!: (ctx: { keyEvent: KeyboardEvent }) => boolean | undefined;

    const keyboard = {
        addListener: vi.fn((l: typeof listener) => {
            listener = l;
        }),
        isCmd: vi.fn((e: KeyboardEvent) => !!(e.ctrlKey || e.metaKey)),
        isShift: vi.fn((e: KeyboardEvent) => !!e.shiftKey),
    };

    const selection = {
        get: vi.fn((): { id: string }[] => []),
    };

    const opener = {
        openFirstScript: vi.fn(() => false),
    };

    const services: Record<string, unknown> = {};
    const injector = {
        get: vi.fn((name: string) => services[name] ?? null),
    };

    new ScriptEditorKeyboard(
        keyboard as never,
        selection as never,
        opener as never,
        injector as never,
    );

    function dispatch(
        key: string,
        opts?: { shift?: boolean; ctrl?: boolean; alt?: boolean },
    ): boolean | undefined {
        return listener({
            keyEvent: {
                key,
                shiftKey: opts?.shift ?? false,
                ctrlKey: opts?.ctrl ?? false,
                metaKey: false,
                altKey: opts?.alt ?? false,
            } as unknown as KeyboardEvent,
        });
    }

    return { selection, opener, services, dispatch };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScriptEditorKeyboard", () => {
    it("o with a script on the selected element → opened, consumed", () => {
        const { selection, opener, dispatch } = build();
        const element = { id: "Task_1" };
        selection.get.mockReturnValue([element]);
        opener.openFirstScript.mockReturnValue(true);

        expect(dispatch("o")).toBe(true);
        expect(opener.openFirstScript).toHaveBeenCalledWith(element);
    });

    it("o without a script on the element → key passes through", () => {
        const { selection, opener, dispatch } = build();
        selection.get.mockReturnValue([{ id: "Task_1" }]);
        opener.openFirstScript.mockReturnValue(false);

        expect(dispatch("o")).toBeUndefined();
    });

    it("other keys pass through untouched", () => {
        const { opener, dispatch } = build();

        expect(dispatch("g")).toBeUndefined();
        expect(opener.openFirstScript).not.toHaveBeenCalled();
    });

    it("modified o (cmd/ctrl, alt, shift) passes through", () => {
        const { selection, opener, dispatch } = build();
        selection.get.mockReturnValue([{ id: "Task_1" }]);

        expect(dispatch("o", { ctrl: true })).toBeUndefined();
        expect(dispatch("o", { alt: true })).toBeUndefined();
        expect(dispatch("o", { shift: true })).toBeUndefined();
        expect(opener.openFirstScript).not.toHaveBeenCalled();
    });

    it("ignored without exactly one selected element", () => {
        const { selection, opener, dispatch } = build();

        selection.get.mockReturnValue([]);
        expect(dispatch("o")).toBeUndefined();

        selection.get.mockReturnValue([{ id: "a" }, { id: "b" }]);
        expect(dispatch("o")).toBeUndefined();

        expect(opener.openFirstScript).not.toHaveBeenCalled();
    });

    it("ignored while direct editing is active", () => {
        const { selection, opener, services, dispatch } = build();
        selection.get.mockReturnValue([{ id: "Task_1" }]);
        services["directEditing"] = { isActive: () => true };

        expect(dispatch("o")).toBeUndefined();
        expect(opener.openFirstScript).not.toHaveBeenCalled();
    });

    it("ignored while a popup menu is open", () => {
        const { selection, opener, services, dispatch } = build();
        selection.get.mockReturnValue([{ id: "Task_1" }]);
        services["popupMenu"] = { isOpen: () => true };

        expect(dispatch("o")).toBeUndefined();
        expect(opener.openFirstScript).not.toHaveBeenCalled();
    });
});
