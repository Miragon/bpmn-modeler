function isTextEditingSurface(element: Element | null): boolean {
    return (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLElement && element.contentEditable === "true")
    );
}

/**
 * Keeps modeler-owned undo/redo from also reaching a host keyboard forwarder.
 */
export function installUndoRedoKeydownGuard(target: Document): () => void {
    const guard = (event: KeyboardEvent): void => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

        const key = event.key.toLowerCase();
        const isUndo = key === "z" && !event.shiftKey;
        const isRedo = key === "y" || (key === "z" && event.shiftKey);
        if (!isUndo && !isRedo) return;

        event.stopPropagation();
        if (isTextEditingSurface(target.activeElement)) {
            event.stopImmediatePropagation();
        }
    };

    target.addEventListener("keydown", guard);
    return () => target.removeEventListener("keydown", guard);
}
