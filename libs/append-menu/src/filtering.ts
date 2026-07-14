/**
 * Pure filter derivations for the append menu, extracted from the panel
 * components so the overlay can compute the exact navigable order of both
 * columns once and feed the components as thin renderers.
 *
 * Keeping these DOM-free makes the keyboard-navigation order (see
 * {@link ./navigation}) unit-testable and prevents the two columns from each
 * re-deriving their own — and therefore divergent — filtered lists.
 */
import type {
    EnrichedTemplateEntry,
    BpmnElementGroup,
    BpmnElementEntry,
    PopupMenuEntry,
} from "./types";

/** A template category surfaced as a filter chip. */
export interface TemplateCategory {
    id: string;
    name: string;
}

/**
 * Converts a BPMN type string to a human-readable label for search matching.
 *
 * E.g. `"bpmn:ServiceTask"` → `"service task"`. Lets a search for
 * "service task" surface templates that apply to `bpmn:ServiceTask`.
 *
 * @param bpmnType The BPMN type string.
 * @returns A lowercase, space-separated label.
 */
function bpmnTypeToLabel(bpmnType: string): string {
    const shortName = bpmnType.split(":")[1] ?? bpmnType;
    return shortName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/**
 * Filters template entries by search query and active category.
 *
 * Matches against name, description, keywords, category name, and the
 * human-readable names of the template's `appliesTo` types.
 *
 * @param entries All enriched template entries.
 * @param search The raw search query.
 * @param activeCategory The selected category id, or null for all.
 * @returns The filtered entries in their original order.
 */
export function filterTemplates(
    entries: EnrichedTemplateEntry[],
    search: string,
    activeCategory: string | null,
): EnrichedTemplateEntry[] {
    const q = search.toLowerCase().trim();
    return entries.filter(({ entry, template }) => {
        if (activeCategory && template?.category?.id !== activeCategory) {
            return false;
        }
        if (!q) {
            return true;
        }
        const appliesToLabels = (template?.appliesTo ?? []).map(bpmnTypeToLabel);
        const haystack = [
            entry.label,
            entry.description ?? "",
            template?.category?.name ?? "",
            ...(entry.search ?? []),
            ...appliesToLabels,
        ]
            .join(" ")
            .toLowerCase();
        return haystack.includes(q);
    });
}

/**
 * Extracts the unique categories from the *unfiltered* template list.
 *
 * The chips must keep showing every category regardless of the active
 * search/category filter, so this deliberately reads from the full list.
 *
 * @param entries All enriched template entries.
 * @returns Unique `{ id, name }` categories in first-seen order.
 */
export function extractCategories(entries: EnrichedTemplateEntry[]): TemplateCategory[] {
    const seen = new Map<string, string>();
    for (const { template } of entries) {
        if (template?.category) {
            seen.set(template.category.id, template.category.name);
        }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
}

// ─── Palette processing ──────────────────────────────────────────────────

/** A palette entry annotated with its filter state. */
export interface ProcessedEntry extends BpmnElementEntry {
    /** Greyed out (fails the selected multi-type template's `appliesTo`). */
    disabled: boolean;
    /** Not rendered (fails the current search). */
    hidden: boolean;
}

/** A palette group with its entries annotated. */
export interface ProcessedGroup {
    id: string;
    name: string;
    entries: ProcessedEntry[];
}

/** The favourites row plus the categorised groups, all annotated. */
export interface ProcessedPalette {
    favouriteEntries: ProcessedEntry[];
    groups: ProcessedGroup[];
}

/**
 * Checks whether a BPMN palette entry matches any type in a filter set.
 */
function entryMatchesFilter(entry: BpmnElementEntry, filter: Set<string>): boolean {
    for (const bpmnType of filter) {
        const shortName = bpmnType.split(":")[1]?.toLowerCase() ?? "";
        const normalizedLabel = entry.entry.label.toLowerCase().replace(/[\s-]/g, "");
        if (normalizedLabel === shortName) {
            return true;
        }
        const normalizedId = entry.id.toLowerCase().replace(/[\s-]/g, "");
        if (normalizedId.includes(shortName)) {
            return true;
        }
    }
    return false;
}

/**
 * Checks whether a BPMN palette entry matches a search query.
 */
function entryMatchesSearch(entry: BpmnElementEntry, query: string): boolean {
    const haystack = [entry.entry.label, entry.entry.description ?? ""].join(" ").toLowerCase();
    return haystack.includes(query);
}

/**
 * Finds a favourite BPMN entry by its type string among all palette entries.
 *
 * Matches on the normalized label first, then on the entry id — the same
 * fuzzy matching the palette originally used.
 */
function findFavouriteEntry(entries: ProcessedEntry[], type: string): ProcessedEntry | undefined {
    const shortName = type.split(":")[1]?.toLowerCase() ?? "";
    return entries.find((e) => {
        const normalizedLabel = e.entry.label.toLowerCase().replace(/[\s-]/g, "");
        if (normalizedLabel === shortName) return true;
        const normalizedId = e.id.toLowerCase().replace(/[\s-]/g, "");
        return normalizedId.includes(shortName);
    });
}

/**
 * Annotates palette groups with disabled/hidden state and resolves the
 * favourites row, preserving the order given in `favourites`.
 *
 * @param groups BPMN element entries grouped by category.
 * @param favourites Ordered BPMN type strings to pin at the top.
 * @param search The raw search query.
 * @param appliesToFilter Set of BPMN types to keep enabled, or null for all.
 * @returns The favourites row plus annotated groups.
 */
export function processPaletteGroups(
    groups: BpmnElementGroup[],
    favourites: string[],
    search: string,
    appliesToFilter: Set<string> | null,
): ProcessedPalette {
    const query = search.toLowerCase().trim();

    const processedGroups: ProcessedGroup[] = groups.map((group) => ({
        ...group,
        entries: group.entries.map((entry) => ({
            ...entry,
            disabled: appliesToFilter ? !entryMatchesFilter(entry, appliesToFilter) : false,
            hidden: query ? !entryMatchesSearch(entry, query) : false,
        })),
    }));

    if (favourites.length === 0) {
        return { favouriteEntries: [], groups: processedGroups };
    }

    const allEntries = processedGroups.flatMap((g) => g.entries);
    const favouriteEntries = favourites
        .map((type) => findFavouriteEntry(allEntries, type))
        .filter((e): e is ProcessedEntry => e !== undefined);

    return { favouriteEntries, groups: processedGroups };
}

// ─── Flattened navigation order ──────────────────────────────────────────

/**
 * One navigable palette slot in render order.
 *
 * `key` is namespaced (`fav:{id}` vs `grp:{groupId}:{id}`) because a favourite
 * renders twice — once in the favourites row and once in its own group — so a
 * bare entry id would collide and highlight both instances at once.
 */
export interface PaletteNavItem {
    key: string;
    entry: PopupMenuEntry;
    disabled: boolean;
    hidden: boolean;
}

/**
 * Flattens the processed palette into the exact render order: favourites
 * first, then each group's entries. Feeds both the keyboard navigation
 * (visible, enabled items) and the highlight→action resolution.
 *
 * @param processed Output of {@link processPaletteGroups}.
 * @returns Navigable slots in render order (including hidden ones).
 */
export function flattenPaletteItems(processed: ProcessedPalette): PaletteNavItem[] {
    const items: PaletteNavItem[] = [];
    for (const e of processed.favouriteEntries) {
        items.push({
            key: `fav:${e.id}`,
            entry: e.entry,
            disabled: e.disabled || !!e.entry.disabled,
            hidden: e.hidden,
        });
    }
    for (const group of processed.groups) {
        for (const e of group.entries) {
            items.push({
                key: `grp:${group.id}:${e.id}`,
                entry: e.entry,
                disabled: e.disabled || !!e.entry.disabled,
                hidden: e.hidden,
            });
        }
    }
    return items;
}
