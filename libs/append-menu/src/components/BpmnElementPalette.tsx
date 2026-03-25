/**
 * Right panel of the append menu overlay.
 *
 * Displays standard BPMN elements organised by category (Tasks, Gateways,
 * Sub-Processes, Events) as a collapsible palette.  In collapsed mode,
 * only icons are shown; expanding reveals labels.
 */
import { useMemo } from "preact/hooks";
import type { BpmnElementGroup, BpmnElementEntry, PopupMenuEntryAction } from "../types";

/** A palette entry with additional state for filtering. */
interface ProcessedEntry extends BpmnElementEntry {
    disabled: boolean;
    hidden: boolean;
}

/** A processed group with filtering state on entries. */
interface ProcessedGroup {
    id: string;
    name: string;
    entries: ProcessedEntry[];
}

interface BpmnElementPaletteProps {
    groups: BpmnElementGroup[];
    favourites: string[];
    search: string;
    appliesToFilter: Set<string> | null;
    expanded: boolean;
    onToggleExpand: () => void;
    onSelect: (action: PopupMenuEntryAction, event: Event) => void;
}

/**
 * Checks whether a BPMN palette entry matches any of the types in a filter set.
 *
 * @param entry The BPMN palette entry.
 * @param filter The set of `appliesTo` BPMN type strings.
 * @returns `true` if the entry matches any type in the filter.
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
 *
 * @param entry The BPMN palette entry.
 * @param query The lowercase, trimmed search query.
 * @returns `true` if the entry label or description matches.
 */
function entryMatchesSearch(entry: BpmnElementEntry, query: string): boolean {
    const haystack = [entry.entry.label, entry.entry.description ?? ""]
        .join(" ")
        .toLowerCase();
    return haystack.includes(query);
}

/**
 * Renders a categorised palette of BPMN element buttons.
 *
 * In collapsed mode, buttons show only icons (compact).
 * In expanded mode, buttons show icons and labels (full).
 * A toggle chevron in the header switches between modes.
 *
 * @param props.groups BPMN element entries grouped by category.
 * @param props.search The current search query.
 * @param props.appliesToFilter Set of BPMN types to enable, or null for all.
 * @param props.expanded Whether the palette shows labels alongside icons.
 * @param props.onToggleExpand Callback to toggle expanded/collapsed state.
 * @param props.onSelect Callback invoked when a BPMN element button is clicked.
 */
export function BpmnElementPalette({
    groups,
    favourites,
    search,
    appliesToFilter,
    expanded,
    onToggleExpand,
    onSelect,
}: BpmnElementPaletteProps) {
    const query = search.toLowerCase().trim();
    const favouriteSet = useMemo(() => new Set(favourites), [favourites]);

    const processedGroups = useMemo<ProcessedGroup[]>(() => {
        return groups.map((group) => ({
            ...group,
            entries: group.entries.map((entry) => ({
                ...entry,
                disabled: appliesToFilter ? !entryMatchesFilter(entry, appliesToFilter) : false,
                hidden: query ? !entryMatchesSearch(entry, query) : false,
            })),
        }));
    }, [groups, appliesToFilter, query]);

    // Extract favourite entries from all groups, preserving their order
    // as specified in the favourites array.
    const favouriteEntries = useMemo<ProcessedEntry[]>(() => {
        if (favouriteSet.size === 0) {
            return [];
        }
        const allEntries = processedGroups.flatMap((g) => g.entries);
        return favourites
            .map((type) => {
                const shortName = type.split(":")[1]?.toLowerCase() ?? "";
                return allEntries.find((e) => {
                    const normalizedLabel = e.entry.label.toLowerCase().replace(/[\s-]/g, "");
                    if (normalizedLabel === shortName) return true;
                    const normalizedId = e.id.toLowerCase().replace(/[\s-]/g, "");
                    return normalizedId.includes(shortName);
                });
            })
            .filter((e): e is ProcessedEntry => e !== undefined);
    }, [favourites, favouriteSet, processedGroups]);

    return (
        <div class={`am-palette-panel ${expanded ? "am-palette-panel--expanded" : ""}`}>
            <div class="am-palette-header">
                <h3 class="am-palette-title">BPMN</h3>
                <button
                  class="am-palette-toggle"
                  onClick={onToggleExpand}
                  title={expanded ? "Collapse" : "Expand"}
                  type="button"
                >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        {expanded
? (
                            <path d="M11.354 8.354a.5.5 0 0 0 0-.708l-4-4a.5.5 0 1 0-.708.708L10.293 8l-3.647 3.646a.5.5 0 0 0 .708.708l4-4z" />
                        )
: (
                            <path d="M4.646 7.646a.5.5 0 0 1 .708 0L8 10.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708zM4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z" />
                        )}
                    </svg>
                </button>
            </div>
            <div class="am-palette-content">
                {/* Favourites section — pinned at the top */}
                {favouriteEntries.length > 0 && (
                    <div class="am-bpmn-group am-bpmn-group--favourites">
                        {expanded && (
                            <h4 class="am-bpmn-group-title">Favourites</h4>
                        )}
                        <div class={`am-bpmn-grid ${expanded ? "" : "am-bpmn-grid--compact"}`}>
                            {favouriteEntries.map(({ id, entry, disabled, hidden }) => {
                                if (hidden) return null;
                                const isDisabled = disabled || !!entry.disabled;
                                return (
                                    <button
                                      key={`fav-${id}`}
                                      class={`am-bpmn-button ${isDisabled ? "am-bpmn-button--disabled" : ""} ${expanded ? "" : "am-bpmn-button--icon-only"}`}
                                      disabled={isDisabled}
                                      onClick={(e) => onSelect(entry.action, e as unknown as Event)}
                                      title={entry.label}
                                      type="button"
                                    >
                                        {entry.className && (
                                            <span class={`am-bpmn-icon ${entry.className}`} />
                                        )}
                                        {expanded && (
                                            <span class="am-bpmn-label">{entry.label}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Regular groups */}
                {processedGroups.map((group) => {
                    const visibleEntries = group.entries.filter((e) => !e.hidden);
                    if (visibleEntries.length === 0) {
                        return null;
                    }
                    return (
                        <div key={group.id} class="am-bpmn-group">
                            {expanded && (
                                <h4 class="am-bpmn-group-title">{group.name}</h4>
                            )}
                            <div class={`am-bpmn-grid ${expanded ? "" : "am-bpmn-grid--compact"}`}>
                                {visibleEntries.map(({ id, entry, disabled }) => {
                                    const isDisabled = disabled || !!entry.disabled;
                                    return (
                                        <button
                                          key={id}
                                          class={`am-bpmn-button ${isDisabled ? "am-bpmn-button--disabled" : ""} ${expanded ? "" : "am-bpmn-button--icon-only"}`}
                                          disabled={isDisabled}
                                          onClick={(e) => onSelect(entry.action, e as unknown as Event)}
                                          title={entry.label}
                                          type="button"
                                        >
                                            {entry.className && (
                                                <span class={`am-bpmn-icon ${entry.className}`} />
                                            )}
                                            {expanded && (
                                                <span class="am-bpmn-label">{entry.label}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
