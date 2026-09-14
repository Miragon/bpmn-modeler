import {
    type Disposer,
    DisposableStore,
    installCanvasFocusIndicator,
} from "@miragon/bpmn-modeler-types";

import { installKeyboardFocus } from "./keyboardFocus";

/** @internal */
interface CanvasService {
    getContainer(): HTMLElement;
    focus(): void;
    isFocused(): boolean;
}

/**
 * Installs the shared canvas focus features — keyboard-focus/Escape handling and
 * the canvas focus indicator — every surface wires identically. Services resolve
 * lazily through `getService` because the guard is armed right after the bpmn-js
 * instance exists.
 *
 * @param options.extraRoots Sibling roots (the properties panel) whose Escape
 *   events must reach this canvas.
 * @param options.hasSearchPad Whether the surface registers a `searchPad` (the
 *   readonly viewer does not).
 * @returns a disposer that removes both features.
 */
export function installSurfaceFocusFeatures(
    getService: <T>(name: string) => T,
    options: {
        extraRoots?: HTMLElement[];
        handleGlobalEscape?: boolean;
        hasSearchPad: boolean;
    },
): Disposer {
    const canvas = getService<CanvasService>("canvas");
    const canvasContainer = canvas.getContainer();
    const eventBus = () => getService<any>("eventBus");
    const selection = () =>
        getService<{ get(): unknown[]; select(elements: null): void }>("selection");

    const store = new DisposableStore();

    store.add(
        installKeyboardFocus({
            roots: [canvasContainer, ...(options.extraRoots ?? [])],
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
        }),
    );

    // Canvas focus events exclude controls such as the lint chip that would match container focusin.
    store.add(
        installCanvasFocusIndicator({
            parent: canvasContainer,
            isFocused: () => canvas.isFocused(),
            onFocusChanged: (listener) =>
                eventBus().on("canvas.focus.changed", (e: { focused: boolean }) =>
                    listener(e.focused),
                ),
            hasSelection: () => selection().get().length > 0,
            onSelectionChanged: (listener) =>
                eventBus().on("selection.changed", (e: { newSelection: unknown[] }) =>
                    listener(e.newSelection.length > 0),
                ),
        }),
    );

    return () => store.dispose();
}
