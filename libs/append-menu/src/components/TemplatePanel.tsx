/**
 * Left panel of the append menu overlay.
 *
 * A thin renderer of the already-filtered template list. Filtering, the
 * keyboard highlight and the previewed template live in the parent overlay
 * (see {@link ../filtering} and {@link ../navigation}) so both columns share
 * one source of truth; this panel only renders cards and the floating
 * {@link TemplateHoverCard}.
 */
import { useEffect, useRef } from "preact/hooks";
import type { EnrichedTemplateEntry, Translate } from "../types";
import type { TemplateCategory } from "../filtering";
import { ExpandableTemplateCard } from "./ExpandableTemplateCard";
import { TemplateHoverCard } from "./TemplateHoverCard";
import { useHoverCardPosition } from "./useHoverCardPosition";

interface TemplatePanelProps {
    entries: EnrichedTemplateEntry[];
    categories: TemplateCategory[];
    translate: Translate;
    /** Non-empty when a search is active — drives only the empty-state hint. */
    search: string;
    activeCategory: string | null;
    selectedTemplateId: string | null;
    /** Index of the keyboard-highlighted card, or -1 when in the other column. */
    highlightedIndex: number;
    /** Index of the card whose hover card shows, or -1. */
    previewIndex: number;
    onCategoryChange: (cat: string | null) => void;
    onTemplateClick: (enriched: EnrichedTemplateEntry, event: Event) => void;
    onCardHover: (index: number, hovered: boolean) => void;
    onPreviewHover: (hovered: boolean) => void;
}

/**
 * Renders the template list panel with category chips and cards.
 *
 * The keyboard highlight drives the focused card and the scroll-into-view;
 * the preview index (mouse hover, else the highlight) drives the floating
 * hover card.
 *
 * @param props.entries Already-filtered template entries to display.
 * @param props.categories All categories (from the unfiltered list) for chips.
 * @param props.search Current search query (empty-state hint only).
 * @param props.activeCategory Currently selected category filter, or null.
 * @param props.selectedTemplateId ID of the selected multi-type template, or null.
 * @param props.highlightedIndex Keyboard-highlighted card index, or -1.
 * @param props.previewIndex Index of the card to preview, or -1.
 * @param props.onCategoryChange Callback when a category chip is toggled.
 * @param props.onTemplateClick Callback when a template card is clicked.
 * @param props.onCardHover Callback when the mouse enters or leaves a card.
 * @param props.onPreviewHover Callback when the mouse enters or leaves the hover card.
 */
export function TemplatePanel({
    entries,
    categories,
    translate,
    search,
    activeCategory,
    selectedTemplateId,
    highlightedIndex,
    previewIndex,
    onCategoryChange,
    onTemplateClick,
    onCardHover,
    onPreviewHover,
}: TemplatePanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    /**
     * Scroll the keyboard-highlighted item into view.
     */
    useEffect(() => {
        if (highlightedIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll(".am-template-card");
            items[highlightedIndex]?.scrollIntoView({ block: "nearest" });
        }
    }, [highlightedIndex]);

    // The panel's left edge is the menu's, so the card covers neither column.
    const previewPosition = useHoverCardPosition(
        panelRef,
        listRef,
        (list) => list.querySelectorAll(".am-template-card")[previewIndex],
    );

    const previewedEntry = previewIndex >= 0 ? entries[previewIndex] : undefined;

    return (
        <div class="am-template-panel" ref={panelRef}>
            {/* Category filter chips */}
            {categories.length > 0 && (
                <div class="am-filters">
                    <button
                        class={`am-chip ${activeCategory === null ? "am-chip--active" : ""}`}
                        onClick={() => onCategoryChange(null)}
                        type="button"
                    >
                        {translate("All")}
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            class={`am-chip ${activeCategory === cat.id ? "am-chip--active" : ""}`}
                            onClick={() =>
                                onCategoryChange(activeCategory === cat.id ? null : cat.id)
                            }
                            type="button"
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Template list */}
            <div class="am-template-list" ref={listRef}>
                {entries.length === 0 ? (
                    <div class="am-empty">
                        <p class="am-empty-text">{translate("No templates found")}</p>
                        {search && (
                            <p class="am-empty-hint">{translate("Try a different search term")}</p>
                        )}
                    </div>
                ) : (
                    entries.map((enriched, idx) => (
                        <ExpandableTemplateCard
                            key={enriched.id}
                            enrichedEntry={enriched}
                            focused={highlightedIndex === idx}
                            selected={selectedTemplateId === enriched.id}
                            onClick={(event) => onTemplateClick(enriched, event)}
                            onHoverChange={(hovered) => onCardHover(idx, hovered)}
                        />
                    ))
                )}
            </div>

            {/* Floating hover card */}
            {previewedEntry && previewPosition && (
                <TemplateHoverCard
                    enrichedEntry={previewedEntry}
                    translate={translate}
                    position={previewPosition}
                    onHoverChange={onPreviewHover}
                />
            )}
        </div>
    );
}
