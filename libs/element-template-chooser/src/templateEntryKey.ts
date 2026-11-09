// The leftmost match keeps an id that itself contains `template-` whole.
const TEMPLATE_ENTRY_KEY = /(?:^|\.)template-(.+)$/;

/**
 * The template id a popup menu entry key names, as create-append-anything
 * builds them (`append.template-<id>`, `create.template-<id>`,
 * `replace.template-<id>`); `undefined` for any other entry.
 */
export function templateIdOfEntryKey(key: string): string | undefined {
    return TEMPLATE_ENTRY_KEY.exec(key)?.[1];
}
