/**
 * How a popup below the "…" button closes: Escape inside it closes it and
 * gives the focus back to the button; a pointer down outside both closes it
 * and leaves the focus where the pointer put it.
 */
export function closeMergePopupOnDismiss(
    popup: HTMLElement,
    opener: HTMLElement,
    close: (returnFocus: boolean) => void,
): void {
    popup.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        close(true);
    });
    opener.ownerDocument.addEventListener("pointerdown", (event) => {
        const target = event.target as Node | null;
        if (!popup.hidden && !popup.contains(target) && !opener.contains(target)) close(false);
    });
}
