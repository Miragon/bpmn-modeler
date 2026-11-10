const TEMPLATE_MARKER = "template-";

/** Where the leftmost `template-` that starts the key or follows a `.` begins; -1 for none. */
function templateMarkerIndex(key: string): number {
    if (key.startsWith(TEMPLATE_MARKER)) {
        return 0;
    }
    const dotted = key.indexOf(`.${TEMPLATE_MARKER}`);
    return dotted < 0 ? -1 : dotted + 1;
}

/**
 * The template id a popup menu entry key names, as create-append-anything
 * builds them (`append.template-<id>`, `create.template-<id>`,
 * `replace.template-<id>`); `undefined` for any other entry. The leftmost
 * marker wins, so an id that itself contains `template-` stays whole. Plain
 * string search, not a regular expression: keys can come from plugins.
 */
export function templateIdOfEntryKey(key: string): string | undefined {
    const at = templateMarkerIndex(key);
    if (at < 0) {
        return undefined;
    }
    const id = key.slice(at + TEMPLATE_MARKER.length);
    return id === "" ? undefined : id;
}
