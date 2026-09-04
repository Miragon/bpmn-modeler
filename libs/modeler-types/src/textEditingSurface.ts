/**
 * True when the element is a text-editing surface where single-character
 * keystrokes must type rather than trigger shortcuts.
 */
export function isTextEditingSurface(el: Element | null): boolean {
    if (el instanceof HTMLInputElement) return true;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLElement && el.contentEditable === "true") return true;
    return false;
}
