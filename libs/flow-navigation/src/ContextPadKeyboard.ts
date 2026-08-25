/**
 * Opens an element-actions popup menu on "m" that mirrors the context
 * pad's entries for keyboard-only operation.
 *
 * The stock context pad DOM is non-focusable and has no upstream keyboard
 * support. Instead of hacking focus into it, this service reuses the
 * diagram-js popup menu (ArrowUp/Down, Enter, Escape, and fuzzy search
 * come for free) with a dedicated provider id.
 */
import { buildMenuEntries, type MenuEntry, type PadEntry } from "./contextPadMenu";

// ---------------------------------------------------------------------------
// Structural service interfaces — satisfied by diagram-js at runtime,
// mocked with plain objects in tests.
// ---------------------------------------------------------------------------

interface Keyboard {
    addListener(listener: (ctx: { keyEvent: KeyboardEvent }) => boolean | undefined): void;
    isCmd(event: KeyboardEvent): boolean;
}

interface Selection {
    get(): { id: string }[];
}

interface ContextPad {
    getEntries(target: unknown): Record<string, PadEntry>;
    getPad(target: unknown): { html: HTMLElement };
    isShown(): boolean;
    open(target: unknown, force: boolean): void;
    triggerEntry(entryId: string, action: string, event: Event): void;
}

interface PopupMenu {
    registerProvider(
        id: string,
        provider: { getPopupMenuEntries(target: unknown): Record<string, MenuEntry> },
    ): void;
    isOpen(): boolean;
    open(
        target: unknown,
        id: string,
        position: { x: number; y: number },
        options: { title: string; search: boolean; width: number },
    ): void;
}

interface Injector {
    get(name: string, strict: false): unknown;
}

type Translate = (key: string) => string;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ContextPadKeyboard {
    static $inject = [
        "keyboard",
        "selection",
        "contextPad",
        "popupMenu",
        "canvas",
        "injector",
        "translate",
    ];

    private readonly contextPad: ContextPad;
    private readonly translate: Translate;

    constructor(
        keyboard: Keyboard,
        selection: Selection,
        contextPad: ContextPad,
        popupMenu: PopupMenu,
        _canvas: unknown,
        injector: Injector,
        translate: Translate,
    ) {
        this.contextPad = contextPad;
        this.translate = translate;

        popupMenu.registerProvider("context-pad-actions", this);

        keyboard.addListener((ctx) =>
            this.handleKeyDown(ctx.keyEvent, keyboard, selection, popupMenu, injector),
        );
    }

    /** Called by the popup menu system to get entries for the given element. */
    getPopupMenuEntries(target: unknown): Record<string, MenuEntry> {
        const contextPad = this.contextPad;
        return buildMenuEntries(contextPad.getEntries(target), (id) => {
            if (!contextPad.isShown()) contextPad.open(target, true);
            contextPad.triggerEntry(id, "click", new Event("click"));
        });
    }

    private handleKeyDown(
        event: KeyboardEvent,
        keyboard: Keyboard,
        selection: Selection,
        popupMenu: PopupMenu,
        injector: Injector,
    ): boolean | undefined {
        if (event.key !== "m") return undefined;
        if (keyboard.isCmd(event) || event.altKey) return undefined;

        const directEditing = injector.get("directEditing", false) as {
            isActive(): boolean;
        } | null;
        if (directEditing?.isActive()) return undefined;

        if (popupMenu.isOpen()) return undefined;

        const selected = selection.get();
        if (selected.length !== 1) return undefined;

        const target = selected[0];
        const entries = this.getPopupMenuEntries(target);
        if (Object.keys(entries).length === 0) return undefined;

        const padHtml = this.contextPad.getPad(target).html;
        const rect = padHtml.getBoundingClientRect();
        const position = { x: rect.left, y: rect.bottom + 6 };

        popupMenu.open(target, "context-pad-actions", position, {
            title: this.translate("Element actions"),
            search: true,
            width: 300,
        });

        return true;
    }
}
