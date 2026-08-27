/**
 * Pure mapping from context-pad entries to popup-menu entries.
 *
 * Keeps the entry-to-menu transformation testable with plain object
 * literals, free from DOM or DI dependencies.
 */

type PadAction = (...args: unknown[]) => unknown;

/** Structural subset of a diagram-js context-pad entry. */
export interface PadEntry {
    title?: string;
    className?: string;
    imageUrl?: string;
    html?: string;
    group?: string;
    action?: Record<string, PadAction> | PadAction;
}

/** Structural subset of a diagram-js popup-menu entry. */
export interface MenuEntry {
    label: string;
    className?: string;
    imageUrl?: string;
    description?: string;
    action: () => void;
}

const SHORTCUT_HINTS: Record<string, string> = {
    "append": "A",
    "replace": "R",
    "delete": "Del",
    "navigate-to-referenced-model": "G",
    "go-to-implementation": "G",
    "edit-script": "O",
};

/**
 * Builds popup-menu entries from context-pad entries, filtering out
 * entries without a click action and adding keyboard shortcut hints
 * for entries that have dedicated keys.
 */
export function buildMenuEntries(
    padEntries: Record<string, PadEntry>,
    trigger: (entryId: string) => void,
): Record<string, MenuEntry> {
    const result: Record<string, MenuEntry> = {};

    for (const [id, entry] of Object.entries(padEntries)) {
        if (!hasClickAction(entry)) continue;

        const menuEntry: MenuEntry = {
            label: entry.title ?? id,
            action: () => trigger(id),
        };
        if (entry.className) menuEntry.className = entry.className;
        if (entry.imageUrl) menuEntry.imageUrl = entry.imageUrl;
        if (SHORTCUT_HINTS[id]) menuEntry.description = SHORTCUT_HINTS[id];

        result[id] = menuEntry;
    }

    return result;
}

function hasClickAction(entry: PadEntry): boolean {
    if (typeof entry.action === "function") return true;
    if (
        entry.action &&
        typeof entry.action === "object" &&
        typeof entry.action.click === "function"
    )
        return true;
    return false;
}
