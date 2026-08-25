/**
 * Wires the "g" keyboard shortcut to trigger the first applicable
 * link-navigation context-pad entry on the selected element.
 *
 * Two existing context-pad providers add jump-to-file entries:
 * model-navigation ("navigate-to-referenced-model") and code-link
 * ("go-to-implementation"). This service triggers whichever one is
 * present — preferring the referenced model when both exist — so
 * flow-navigation users never have to leave the keyboard.
 */

// ---------------------------------------------------------------------------
// Structural service interfaces — satisfied by diagram-js at runtime,
// mocked with plain objects in tests.
// ---------------------------------------------------------------------------

interface Keyboard {
    addListener(listener: (ctx: { keyEvent: KeyboardEvent }) => boolean | undefined): void;
    isCmd(event: KeyboardEvent): boolean;
    isShift(event: KeyboardEvent): boolean;
}

interface Selection {
    get(): { id: string }[];
}

interface ContextPad {
    getEntries(target: unknown): Record<string, unknown>;
    isShown(): boolean;
    open(target: unknown, force: boolean): void;
    triggerEntry(entryId: string, action: string, event: Event): void;
}

interface Injector {
    get(name: string, strict: false): unknown;
}

const LINK_ENTRY_IDS = ["navigate-to-referenced-model", "go-to-implementation"];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LinkNavigation {
    static $inject = ["keyboard", "selection", "contextPad", "injector"];

    constructor(
        keyboard: Keyboard,
        selection: Selection,
        contextPad: ContextPad,
        injector: Injector,
    ) {
        keyboard.addListener((ctx) =>
            this.handleKeyDown(ctx.keyEvent, keyboard, selection, contextPad, injector),
        );
    }

    private handleKeyDown(
        event: KeyboardEvent,
        keyboard: Keyboard,
        selection: Selection,
        contextPad: ContextPad,
        injector: Injector,
    ): boolean | undefined {
        if (event.key !== "g") return undefined;
        if (keyboard.isCmd(event) || event.altKey || keyboard.isShift(event)) return undefined;

        const directEditing = injector.get("directEditing", false) as {
            isActive(): boolean;
        } | null;
        if (directEditing?.isActive()) return undefined;

        const popupMenu = injector.get("popupMenu", false) as { isOpen(): boolean } | null;
        if (popupMenu?.isOpen()) return undefined;

        const selected = selection.get();
        if (selected.length !== 1) return undefined;

        const target = selected[0];
        const entries = contextPad.getEntries(target);
        const id = LINK_ENTRY_IDS.find((candidate) => candidate in entries);
        if (!id) return undefined;

        if (!contextPad.isShown()) contextPad.open(target, true);
        contextPad.triggerEntry(id, "click", new Event("click"));
        return true;
    }
}
