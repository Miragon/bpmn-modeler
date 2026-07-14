/**
 * Right panel of the append menu overlay.
 *
 * A thin renderer of the pre-processed palette (favourites row + categorised
 * groups). Filtering/favourite resolution lives in {@link ../filtering} and
 * the keyboard highlight in the parent overlay, so this component only draws
 * buttons and reflects the highlighted key.
 */
import { useEffect, useRef } from "preact/hooks";
import type { PopupMenuEntryAction } from "../types";
import type { ProcessedEntry, ProcessedGroup } from "../filtering";

interface BpmnElementPaletteProps {
    favouriteEntries: ProcessedEntry[];
    groups: ProcessedGroup[];
    expanded: boolean;
    /** Nav key of the keyboard-highlighted button, or null when in the other column. */
    highlightedKey: string | null;
    onToggleExpand: () => void;
    onSelect: (action: PopupMenuEntryAction, event: Event) => void;
}

/**
 * Renders a categorised palette of BPMN element buttons.
 *
 * In collapsed mode, buttons show only icons; expanded mode adds labels.
 * Each button carries a namespaced `data-nav-key` (`fav:…` / `grp:…`) so the
 * keyboard highlight can target the right instance — a favourite appears both
 * in the favourites row and in its own group.
 *
 * @param props.favouriteEntries Resolved favourite entries (annotated).
 * @param props.groups Annotated BPMN element groups.
 * @param props.expanded Whether the palette shows labels alongside icons.
 * @param props.highlightedKey Nav key of the highlighted button, or null.
 * @param props.onToggleExpand Callback to toggle expanded/collapsed state.
 * @param props.onSelect Callback invoked when a BPMN element button is clicked.
 */
export function BpmnElementPalette({
    favouriteEntries,
    groups,
    expanded,
    highlightedKey,
    onToggleExpand,
    onSelect,
}: BpmnElementPaletteProps) {
    const contentRef = useRef<HTMLDivElement>(null);

    /**
     * Scroll the keyboard-highlighted button into view.
     */
    useEffect(() => {
        if (highlightedKey && contentRef.current) {
            const el = contentRef.current.querySelector(`[data-nav-key="${highlightedKey}"]`);
            el?.scrollIntoView({ block: "nearest" });
        }
    }, [highlightedKey]);

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
                        {expanded ? (
                            <path d="M11.354 8.354a.5.5 0 0 0 0-.708l-4-4a.5.5 0 1 0-.708.708L10.293 8l-3.647 3.646a.5.5 0 0 0 .708.708l4-4z" />
                        ) : (
                            <path d="M4.646 7.646a.5.5 0 0 1 .708 0L8 10.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708zM4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z" />
                        )}
                    </svg>
                </button>
            </div>
            <div class="am-palette-content" ref={contentRef}>
                {/* Favourites section — pinned at the top */}
                {favouriteEntries.length > 0 && (
                    <div class="am-bpmn-group am-bpmn-group--favourites">
                        {expanded && <h4 class="am-bpmn-group-title">Favourites</h4>}
                        <div class={`am-bpmn-grid ${expanded ? "" : "am-bpmn-grid--compact"}`}>
                            {favouriteEntries.map(({ id, entry, disabled, hidden }) => {
                                if (hidden) return null;
                                const navKey = `fav:${id}`;
                                const isDisabled = disabled || !!entry.disabled;
                                const isFocused = navKey === highlightedKey;
                                return (
                                    <button
                                        key={navKey}
                                        data-nav-key={navKey}
                                        class={`am-bpmn-button ${isDisabled ? "am-bpmn-button--disabled" : ""} ${isFocused ? "am-bpmn-button--focused" : ""} ${expanded ? "" : "am-bpmn-button--icon-only"}`}
                                        disabled={isDisabled}
                                        onClick={(e) =>
                                            onSelect(entry.action, e as unknown as Event)
                                        }
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
                {groups.map((group) => {
                    const visibleEntries = group.entries.filter((e) => !e.hidden);
                    if (visibleEntries.length === 0) {
                        return null;
                    }
                    return (
                        <div key={group.id} class="am-bpmn-group">
                            {expanded && <h4 class="am-bpmn-group-title">{group.name}</h4>}
                            <div class={`am-bpmn-grid ${expanded ? "" : "am-bpmn-grid--compact"}`}>
                                {visibleEntries.map(({ id, entry, disabled }) => {
                                    const navKey = `grp:${group.id}:${id}`;
                                    const isDisabled = disabled || !!entry.disabled;
                                    const isFocused = navKey === highlightedKey;
                                    return (
                                        <button
                                            key={navKey}
                                            data-nav-key={navKey}
                                            class={`am-bpmn-button ${isDisabled ? "am-bpmn-button--disabled" : ""} ${isFocused ? "am-bpmn-button--focused" : ""} ${expanded ? "" : "am-bpmn-button--icon-only"}`}
                                            disabled={isDisabled}
                                            onClick={(e) =>
                                                onSelect(entry.action, e as unknown as Event)
                                            }
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
