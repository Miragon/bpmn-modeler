import { describe, expect, it, vi } from "vitest";

import { ContextPadKeyboard } from "./ContextPadKeyboard";

// ---------------------------------------------------------------------------
// Test harness — mirrors FlowNavigation.spec.ts style.
// ---------------------------------------------------------------------------

function build() {
    let listener!: (ctx: { keyEvent: KeyboardEvent }) => boolean | undefined;

    const keyboard = {
        addListener: vi.fn((l: typeof listener) => {
            listener = l;
        }),
        isCmd: vi.fn((e: KeyboardEvent) => !!(e.ctrlKey || e.metaKey)),
    };

    const selection = {
        get: vi.fn((): { id: string }[] => []),
    };

    const padEntries: Record<string, Record<string, unknown>> = {};
    const contextPad = {
        getEntries: vi.fn(() => padEntries),
        getPad: vi.fn(() => ({
            html: {
                getBoundingClientRect: () => ({
                    left: 100,
                    bottom: 200,
                    top: 150,
                    right: 140,
                    width: 40,
                    height: 50,
                }),
            },
        })),
        isShown: vi.fn(() => true),
        open: vi.fn(),
        triggerEntry: vi.fn(),
    };

    const registeredProviders: Record<string, unknown> = {};
    const popupMenu = {
        registerProvider: vi.fn((id: string, provider: unknown) => {
            registeredProviders[id] = provider;
        }),
        isOpen: vi.fn(() => false),
        open: vi.fn(),
    };

    const canvas = {};

    const services: Record<string, unknown> = {};
    const injector = {
        get: vi.fn((name: string) => services[name] ?? null),
    };

    const translate = vi.fn((key: string) => key);

    new ContextPadKeyboard(
        keyboard as never,
        selection as never,
        contextPad as never,
        popupMenu as never,
        canvas as never,
        injector as never,
        translate as never,
    );

    function dispatch(key: string, opts?: { ctrl?: boolean; alt?: boolean }): boolean | undefined {
        return listener({
            keyEvent: {
                key,
                ctrlKey: opts?.ctrl ?? false,
                metaKey: false,
                altKey: opts?.alt ?? false,
            } as unknown as KeyboardEvent,
        });
    }

    return {
        keyboard,
        selection,
        contextPad,
        popupMenu,
        injector,
        services,
        translate,
        registeredProviders,
        padEntries,
        dispatch,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ContextPadKeyboard", () => {
    it("registers context-pad-actions provider", () => {
        const { registeredProviders } = build();

        expect(registeredProviders["context-pad-actions"]).toBeDefined();
    });

    it("m + single selection opens popup menu with pad-derived position", () => {
        const { selection, popupMenu, padEntries, dispatch } = build();
        const task = { id: "task", type: "bpmn:Task", x: 200, y: 200 };
        selection.get.mockReturnValue([task]);
        padEntries.replace = { title: "Replace", action: vi.fn() };

        const result = dispatch("m");

        expect(result).toBe(true);
        expect(popupMenu.open).toHaveBeenCalledWith(
            task,
            "context-pad-actions",
            { x: 100, y: 206 },
            expect.objectContaining({ title: "Element actions", search: true, width: 300 }),
        );
    });

    it("no selection → undefined (key not consumed)", () => {
        const { dispatch } = build();

        expect(dispatch("m")).toBeUndefined();
    });

    it("Cmd+m → undefined", () => {
        const { selection, dispatch } = build();
        selection.get.mockReturnValue([{ id: "t" }]);

        expect(dispatch("m", { ctrl: true })).toBeUndefined();
    });

    it("Alt+m → undefined", () => {
        const { selection, dispatch } = build();
        selection.get.mockReturnValue([{ id: "t" }]);

        expect(dispatch("m", { alt: true })).toBeUndefined();
    });

    it("directEditing active → undefined", () => {
        const { selection, services, padEntries, dispatch } = build();
        selection.get.mockReturnValue([{ id: "t" }]);
        padEntries.replace = { title: "Replace", action: vi.fn() };
        services.directEditing = { isActive: () => true };

        expect(dispatch("m")).toBeUndefined();
    });

    it("popupMenu already open → undefined", () => {
        const { selection, popupMenu, padEntries, dispatch } = build();
        selection.get.mockReturnValue([{ id: "t" }]);
        padEntries.replace = { title: "Replace", action: vi.fn() };
        popupMenu.isOpen.mockReturnValue(true);

        expect(dispatch("m")).toBeUndefined();
    });

    it("provider delegates through getEntries and triggerEntry", () => {
        const { registeredProviders, contextPad } = build();
        const provider = registeredProviders["context-pad-actions"] as {
            getPopupMenuEntries(target: unknown): Record<string, { action: () => void }>;
        };
        const target = { id: "t" };
        contextPad.getEntries.mockReturnValue({
            replace: { title: "Replace", action: { click: vi.fn() } },
        });

        const entries = provider.getPopupMenuEntries(target);
        entries.replace.action();

        expect(contextPad.triggerEntry).toHaveBeenCalledWith("replace", "click", expect.any(Event));
    });

    it("provider re-opens pad when isShown() is false before triggering", () => {
        const { registeredProviders, contextPad } = build();
        const provider = registeredProviders["context-pad-actions"] as {
            getPopupMenuEntries(target: unknown): Record<string, { action: () => void }>;
        };
        const target = { id: "t" };
        contextPad.getEntries.mockReturnValue({
            connect: { title: "Connect", action: vi.fn() },
        });
        contextPad.isShown.mockReturnValue(false);

        const entries = provider.getPopupMenuEntries(target);
        entries.connect.action();

        expect(contextPad.open).toHaveBeenCalledWith(target, true);
        expect(contextPad.triggerEntry).toHaveBeenCalled();
    });

    it("empty entries → not opened, key not consumed", () => {
        const { selection, popupMenu, dispatch } = build();
        selection.get.mockReturnValue([{ id: "t" }]);

        expect(dispatch("m")).toBeUndefined();
        expect(popupMenu.open).not.toHaveBeenCalled();
    });
});
