import type { ScriptEditorOpener } from "./scriptEditorOpener";

/**
 * Wires the "o" keyboard shortcut to open the selected element's script in
 * the host editor — the same action as the "Open script in editor" buttons —
 * so script tasks and listener scripts are reachable without the mouse.
 *
 * Delegates to {@link ScriptEditorOpener}, which picks the first script in
 * properties-panel order (inline script, then execution listeners, then task
 * listeners). Elements without any script leave the key untouched.
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

interface Injector {
    get(name: string, strict: false): unknown;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ScriptEditorKeyboard {
    static $inject = ["keyboard", "selection", "scriptEditorOpener", "injector"];

    constructor(
        keyboard: Keyboard,
        selection: Selection,
        opener: ScriptEditorOpener,
        injector: Injector,
    ) {
        keyboard.addListener((ctx) =>
            this.handleKeyDown(ctx.keyEvent, keyboard, selection, opener, injector),
        );
    }

    private handleKeyDown(
        event: KeyboardEvent,
        keyboard: Keyboard,
        selection: Selection,
        opener: ScriptEditorOpener,
        injector: Injector,
    ): boolean | undefined {
        if (event.key !== "o") return undefined;
        if (keyboard.isCmd(event) || event.altKey || keyboard.isShift(event)) return undefined;

        const directEditing = injector.get("directEditing", false) as {
            isActive(): boolean;
        } | null;
        if (directEditing?.isActive()) return undefined;

        const popupMenu = injector.get("popupMenu", false) as { isOpen(): boolean } | null;
        if (popupMenu?.isOpen()) return undefined;

        const selected = selection.get();
        if (selected.length !== 1) return undefined;

        return opener.openFirstScript(selected[0]) ? true : undefined;
    }
}

/**
 * bpmn-js / didi module exporting the script-editor keyboard shortcut.
 * Register via `additionalModules` (together with
 * {@link ScriptEditorOpenerModule}) when creating the C7 modeler.
 */
export const ScriptEditorKeyboardModule = {
    __init__: ["scriptEditorKeyboard"],
    scriptEditorKeyboard: ["type", ScriptEditorKeyboard],
};
