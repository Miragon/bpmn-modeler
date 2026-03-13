/**
 * Creates the DOM element for an implementation-link hover overlay.
 *
 * The overlay shows a clickable label linking to the implementation source
 * file. Unresolved entries are rendered with dimmed styling and are not
 * clickable.
 */

/**
 * Builds the overlay HTML element for a single implementation link.
 *
 * @param label Display text (e.g. class simple name or topic).
 * @param resolved Whether the implementation file has been found.
 * @param onClick Callback invoked when the user clicks a resolved link.
 * @returns The overlay DOM element ready to be added via the overlays service.
 */
export function createOverlayElement(
    label: string,
    resolved: boolean,
    onClick: () => void,
): HTMLElement {
    const container = document.createElement("div");
    container.className = resolved
        ? "implementation-link-overlay"
        : "implementation-link-overlay unresolved";

    const icon = document.createElement("span");
    icon.className = "impl-icon";
    icon.textContent = "\u{1F517}"; // link emoji as icon

    const link = document.createElement("a");
    link.textContent = label;
    link.title = resolved
        ? `Go to implementation: ${label}`
        : `Unresolved: ${label}`;

    if (resolved) {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
    }

    container.appendChild(icon);
    container.appendChild(link);
    return container;
}
