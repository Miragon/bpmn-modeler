/**
 * Typed adapter around a diagram-js-direct-editing internal: the active
 * contenteditable overlay lives at `directEditing._textbox.content`, which
 * carries no public accessor and ships no `.d.ts`. Confining the reach here —
 * with a runtime shape assertion and a pinned upstream-shape test — turns a
 * silent breakage on a dependency bump into a loud, located failure.
 */

/** The contenteditable overlay diagram-js-direct-editing manages while active. */
export function getDirectEditingContent(directEditing: unknown): HTMLElement {
    const content = (directEditing as { _textbox?: { content?: unknown } } | null)?._textbox
        ?.content;
    if (!(content instanceof HTMLElement)) {
        throw new Error(
            "diagram-js-direct-editing internal shape changed: expected " +
                "`directEditing._textbox.content` to be an HTMLElement. Update " +
                "directEditingInternals.ts and its shape test.",
        );
    }
    return content;
}
