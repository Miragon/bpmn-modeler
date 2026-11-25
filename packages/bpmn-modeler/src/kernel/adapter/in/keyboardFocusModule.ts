import { installForDiagramLifetime, type LifetimeEventBus } from "@miragon/bpmn-modeler-browser";

import { SURFACE_ROOTS } from "../../domain/kernelNames";
import type { SurfaceRoots } from "../../port/kernelServices";
import { installKeyboardFocus } from "./keyboardFocus";

interface FocusCanvas {
    getContainer(): HTMLElement;
    focus(): void;
    isFocused(): boolean;
}

interface OptionalLookup {
    get<T>(name: string, strict: false): T | null;
    get<T>(name: string): T;
}

interface Selection {
    get(): unknown[];
    select(elements: null): void;
}

interface SearchPad {
    isOpen(): boolean;
    close(): void;
}

export interface KeyboardFocusOptions {
    /** Opt in only for single-instance hosts; body events cannot identify a surface. */
    readonly handleGlobalEscape?: boolean;
}

/**
 * Escape returns the keyboard to the canvas from anywhere in the surface's
 * roots. Services resolve lazily: a viewer registers no `searchPad`.
 */
export function createKeyboardFocusModule({ handleGlobalEscape = false }: KeyboardFocusOptions) {
    function surfaceKeyboardFocus(
        eventBus: LifetimeEventBus,
        canvas: FocusCanvas,
        injector: OptionalLookup,
        roots: SurfaceRoots,
    ): object {
        // The canvas, not the whole container: Escape on the container's logo link is not ours.
        const [, ...extraRoots] = roots;
        const selection = () => injector.get<Selection>("selection");
        const searchPad = () => injector.get<SearchPad>("searchPad", false);
        installForDiagramLifetime(eventBus, () =>
            installKeyboardFocus({
                roots: [canvas.getContainer(), ...extraRoots],
                handleGlobalEscape,
                focusCanvas: () => canvas.focus(),
                isCanvasFocused: () => canvas.isFocused(),
                hasSelection: () => selection().get().length > 0,
                clearSelection: () => selection().select(null),
                isSearchPadOpen: () => searchPad()?.isOpen() ?? false,
                closeSearchPad: () => searchPad()?.close(),
            }),
        );
        return {};
    }
    surfaceKeyboardFocus.$inject = ["eventBus", "canvas", "injector", SURFACE_ROOTS];
    return {
        __init__: ["surfaceKeyboardFocus"],
        surfaceKeyboardFocus: ["factory", surfaceKeyboardFocus],
    };
}
