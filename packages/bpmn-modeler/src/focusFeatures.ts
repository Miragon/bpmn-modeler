import type { Disposer } from "@miragon/bpmn-modeler-types";

import { installKeyboardFocus } from "./keyboardFocus";

/** @internal */
interface CanvasService {
    getContainer(): HTMLElement;
    focus(): void;
    isFocused(): boolean;
}

export interface SurfaceFocusOptions {
    extraRoots?: HTMLElement[];
    handleGlobalEscape?: boolean;
    hasSearchPad: boolean;
}

/**
 * Installs the keyboard-focus/Escape handling every surface wires identically.
 * Services resolve lazily through `getService` because the guard is armed right
 * after the bpmn-js instance exists.
 *
 * @param options.extraRoots Sibling roots (the properties panel) whose Escape
 *   events must reach this canvas.
 * @param options.hasSearchPad Whether the surface registers a `searchPad` (the
 *   readonly viewer does not).
 * @returns a disposer that removes the handling.
 */
export function installSurfaceFocusFeatures(
    getService: <T>(name: string) => T,
    options: SurfaceFocusOptions,
): Disposer {
    const canvas = getService<CanvasService>("canvas");
    const selection = () =>
        getService<{ get(): unknown[]; select(elements: null): void }>("selection");

    return installKeyboardFocus({
        roots: [canvas.getContainer(), ...(options.extraRoots ?? [])],
        handleGlobalEscape: options.handleGlobalEscape ?? false,
        focusCanvas: () => canvas.focus(),
        isCanvasFocused: () => canvas.isFocused(),
        hasSelection: () => selection().get().length > 0,
        clearSelection: () => selection().select(null),
        isSearchPadOpen: options.hasSearchPad
            ? () => getService<{ isOpen(): boolean }>("searchPad").isOpen()
            : () => false,
        closeSearchPad: options.hasSearchPad
            ? () => getService<{ close(): void }>("searchPad").close()
            : () => {},
    });
}
