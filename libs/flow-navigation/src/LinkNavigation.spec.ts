import { describe, expect, it, vi } from "vitest";

import { LinkNavigation } from "./LinkNavigation";

// ---------------------------------------------------------------------------
// Test harness — mirrors PlaneNavigation.spec.ts style.
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

    let padEntries: Record<string, unknown> = {};
    let padShown = false;

    const contextPad = {
        getEntries: vi.fn(() => padEntries),
        isShown: vi.fn(() => padShown),
        open: vi.fn(),
        triggerEntry: vi.fn(),
    };

    const services: Record<string, unknown> = {};
    const injector = {
        get: vi.fn((name: string) => services[name] ?? null),
    };

    new LinkNavigation(
        keyboard as never,
        selection as never,
        contextPad as never,
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

    return {
        selection,
        contextPad,
        services,
        dispatch,
        setPadEntries(entries: Record<string, unknown>) {
            padEntries = entries;
        },
        setPadShown(shown: boolean) {
            padShown = shown;
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LinkNavigation", () => {
    it("g with navigate-to-referenced-model → entry triggered", () => {
        const { selection, contextPad, setPadEntries, dispatch } = build();

        selection.get.mockReturnValue([{ id: "callActivity1" }]);
        setPadEntries({ "navigate-to-referenced-model": { action: { click: vi.fn() } } });

        const result = dispatch("g");

        expect(result).toBe(true);
        expect(contextPad.triggerEntry).toHaveBeenCalledWith(
            "navigate-to-referenced-model",
            "click",
            expect.any(Event),
        );
    });

    it("g with only go-to-implementation → that entry triggered", () => {
        const { selection, contextPad, setPadEntries, dispatch } = build();

        selection.get.mockReturnValue([{ id: "serviceTask1" }]);
        setPadEntries({ "go-to-implementation": { action: { click: vi.fn() } } });

        const result = dispatch("g");

        expect(result).toBe(true);
        expect(contextPad.triggerEntry).toHaveBeenCalledWith(
            "go-to-implementation",
            "click",
            expect.any(Event),
        );
    });

    it("both entries present → model-navigation wins", () => {
        const { selection, contextPad, setPadEntries, dispatch } = build();

        selection.get.mockReturnValue([{ id: "businessRuleTask1" }]);
        setPadEntries({
            "navigate-to-referenced-model": { action: { click: vi.fn() } },
            "go-to-implementation": { action: { click: vi.fn() } },
        });

        const result = dispatch("g");

        expect(result).toBe(true);
        expect(contextPad.triggerEntry).toHaveBeenCalledWith(
            "navigate-to-referenced-model",
            "click",
            expect.any(Event),
        );
        expect(contextPad.triggerEntry).toHaveBeenCalledTimes(1);
    });

    it("no link entry → undefined, nothing triggered", () => {
        const { selection, contextPad, setPadEntries, dispatch } = build();

        selection.get.mockReturnValue([{ id: "task1" }]);
        setPadEntries({ append: {}, delete: {} });

        expect(dispatch("g")).toBeUndefined();
        expect(contextPad.triggerEntry).not.toHaveBeenCalled();
    });

    it("pad not shown → open called before triggerEntry", () => {
        const { selection, contextPad, setPadEntries, setPadShown, dispatch } = build();

        selection.get.mockReturnValue([{ id: "callActivity1" }]);
        setPadEntries({ "navigate-to-referenced-model": {} });
        setPadShown(false);

        dispatch("g");

        expect(contextPad.open).toHaveBeenCalledWith({ id: "callActivity1" }, true);
        expect(contextPad.triggerEntry).toHaveBeenCalled();

        const openOrder = contextPad.open.mock.invocationCallOrder[0];
        const triggerOrder = contextPad.triggerEntry.mock.invocationCallOrder[0];
        expect(openOrder).toBeLessThan(triggerOrder);
    });

    it("pad already shown → no extra open call", () => {
        const { selection, contextPad, setPadEntries, setPadShown, dispatch } = build();

        selection.get.mockReturnValue([{ id: "callActivity1" }]);
        setPadEntries({ "navigate-to-referenced-model": {} });
        setPadShown(true);

        dispatch("g");

        expect(contextPad.open).not.toHaveBeenCalled();
        expect(contextPad.triggerEntry).toHaveBeenCalled();
    });

    // --- Guards ---

    it("0 selected → undefined", () => {
        const { selection, contextPad, dispatch } = build();

        selection.get.mockReturnValue([]);

        expect(dispatch("g")).toBeUndefined();
        expect(contextPad.triggerEntry).not.toHaveBeenCalled();
    });

    it("2+ selected → undefined", () => {
        const { selection, contextPad, dispatch } = build();

        selection.get.mockReturnValue([{ id: "a" }, { id: "b" }]);

        expect(dispatch("g")).toBeUndefined();
        expect(contextPad.triggerEntry).not.toHaveBeenCalled();
    });

    it("Cmd modifier → undefined", () => {
        const { selection, contextPad, setPadEntries, dispatch } = build();

        selection.get.mockReturnValue([{ id: "callActivity1" }]);
        setPadEntries({ "navigate-to-referenced-model": {} });

        expect(dispatch("g", { ctrl: true })).toBeUndefined();
        expect(contextPad.triggerEntry).not.toHaveBeenCalled();
    });

    it("Alt modifier → undefined", () => {
        const { selection, contextPad, setPadEntries, dispatch } = build();

        selection.get.mockReturnValue([{ id: "callActivity1" }]);
        setPadEntries({ "navigate-to-referenced-model": {} });

        expect(dispatch("g", { alt: true })).toBeUndefined();
        expect(contextPad.triggerEntry).not.toHaveBeenCalled();
    });

    it("Shift modifier → undefined", () => {
        const { selection, contextPad, setPadEntries, dispatch } = build();

        selection.get.mockReturnValue([{ id: "callActivity1" }]);
        setPadEntries({ "navigate-to-referenced-model": {} });

        expect(dispatch("g", { shift: true })).toBeUndefined();
        expect(contextPad.triggerEntry).not.toHaveBeenCalled();
    });

    it("other key → undefined", () => {
        const { dispatch } = build();

        expect(dispatch("a")).toBeUndefined();
        expect(dispatch("Enter")).toBeUndefined();
        expect(dispatch("Tab")).toBeUndefined();
    });

    it("directEditing active → undefined", () => {
        const { selection, contextPad, services, setPadEntries, dispatch } = build();

        services.directEditing = { isActive: () => true };
        selection.get.mockReturnValue([{ id: "callActivity1" }]);
        setPadEntries({ "navigate-to-referenced-model": {} });

        expect(dispatch("g")).toBeUndefined();
        expect(contextPad.triggerEntry).not.toHaveBeenCalled();
    });

    it("popupMenu open → undefined", () => {
        const { selection, contextPad, services, setPadEntries, dispatch } = build();

        services.popupMenu = { isOpen: () => true };
        selection.get.mockReturnValue([{ id: "callActivity1" }]);
        setPadEntries({ "navigate-to-referenced-model": {} });

        expect(dispatch("g")).toBeUndefined();
        expect(contextPad.triggerEntry).not.toHaveBeenCalled();
    });
});
