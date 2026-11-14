/** The DOM building blocks the diff chrome shares across the BPMN and DMN webviews. */

/** An element with its class names, and its text when given. */
export function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** A plain button, never a form's submit button, that calls `onClick`. */
export function createButton(
    className: string,
    onClick: () => void,
    text?: string,
): HTMLButtonElement {
    const node = createElement("button", className, text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
}
