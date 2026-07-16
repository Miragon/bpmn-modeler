/**
 * Pure highlight reducer for the append menu's two-column keyboard navigation.
 *
 * The overlay owns a single `Highlight | null` and derives both columns'
 * navigable items (templates on the left, palette on the right). Keeping the
 * movement logic here — DOM-free and column-agnostic — lets it be unit-tested
 * and keeps the components as thin renderers.
 */

/** The two navigable columns. `templates` is left, `palette` is right. */
export type ColumnId = "templates" | "palette";

/** One navigable slot. Disabled slots render but are skipped by movement. */
export interface NavItem {
    disabled: boolean;
}

/** The navigable slots of both columns, in render order. */
export interface NavColumns {
    templates: readonly NavItem[];
    palette: readonly NavItem[];
}

/** The currently highlighted slot. */
export interface Highlight {
    column: ColumnId;
    index: number;
}

function itemsOf(cols: NavColumns, column: ColumnId): readonly NavItem[] {
    return column === "templates" ? cols.templates : cols.palette;
}

/**
 * The first enabled index in `items`, or -1 if every item is disabled/empty.
 */
function firstEnabled(items: readonly NavItem[]): number {
    for (let i = 0; i < items.length; i++) {
        if (!items[i].disabled) return i;
    }
    return -1;
}

/**
 * The enabled index nearest to `preferred`, expanding outward (down first,
 * then up). Returns -1 when the column has no enabled item.
 */
function nearestEnabled(items: readonly NavItem[], preferred: number): number {
    const len = items.length;
    if (len === 0) return -1;
    const start = Math.min(Math.max(preferred, 0), len - 1);
    if (!items[start].disabled) return start;
    for (let d = 1; d < len; d++) {
        const down = start + d;
        if (down < len && !items[down].disabled) return down;
        const up = start - d;
        if (up >= 0 && !items[up].disabled) return up;
    }
    return -1;
}

/**
 * The initial highlight: first enabled item, templates preferred. Falls back
 * to the palette when templates are empty or fully disabled, and to null when
 * nothing is navigable.
 */
export function initialHighlight(cols: NavColumns): Highlight | null {
    const t = firstEnabled(cols.templates);
    if (t >= 0) return { column: "templates", index: t };
    const p = firstEnabled(cols.palette);
    if (p >= 0) return { column: "palette", index: p };
    return null;
}

/**
 * Moves the highlight up (`dir = -1`) or down (`dir = 1`) within its column,
 * wrapping around and skipping disabled items.
 *
 * @param h The current highlight.
 * @param dir -1 for up, 1 for down.
 * @param cols The navigable columns.
 * @returns The new highlight (unchanged if no other enabled item exists).
 */
export function moveVertical(h: Highlight, dir: -1 | 1, cols: NavColumns): Highlight {
    const items = itemsOf(cols, h.column);
    const len = items.length;
    if (len === 0) return h;
    let next = h.index;
    for (let step = 0; step < len; step++) {
        next = (next + dir + len) % len;
        if (!items[next].disabled) {
            return { column: h.column, index: next };
        }
    }
    return h;
}

/**
 * Switches columns: `dir = 1` (right) targets the palette, `dir = -1` (left)
 * targets the templates. The index is clamped to the nearest enabled item in
 * the target column. No-op when already in the target column or when the
 * target column has no enabled item.
 *
 * @param h The current highlight.
 * @param dir -1 to move left (templates), 1 to move right (palette).
 * @param cols The navigable columns.
 * @returns The new highlight, or the original when the move is a no-op.
 */
export function moveHorizontal(h: Highlight, dir: -1 | 1, cols: NavColumns): Highlight {
    const target: ColumnId = dir > 0 ? "palette" : "templates";
    if (target === h.column) return h;
    const index = nearestEnabled(itemsOf(cols, target), h.index);
    if (index < 0) return h;
    return { column: target, index };
}
