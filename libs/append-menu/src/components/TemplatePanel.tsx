/**
 * Left panel of the append menu overlay.
 *
 * A thin renderer of the already-filtered template list. Filtering and
 * keyboard-highlight state live in the parent overlay (see
 * {@link ../filtering} and {@link ../navigation}) so both columns share one
 * source of truth; this panel only renders cards and the floating
 * {@link TemplateHoverCard}.
 */
import { useEffect, useRef, useState, useMemo, useCallback } from "preact/hooks";
import type { EnrichedTemplateEntry } from "../types";
import type { TemplateCategory } from "../filtering";
import { ExpandableTemplateCard } from "./ExpandableTemplateCard";
import { TemplateHoverCard } from "./TemplateHoverCard";

// Delay in ms before the hover card hides after mouse leave.
const HOVER_HIDE_DELAY = 150;

interface TemplatePanelProps {
    entries: EnrichedTemplateEntry[];
    categories: TemplateCategory[];
    /** Non-empty when a search is active — drives only the empty-state hint. */
    search: string;
    activeCategory: string | null;
    selectedTemplateId: string | null;
    /** Index of the keyboard-highlighted card, or -1 when in the other column. */
    highlightedIndex: number;
    onCategoryChange: (cat: string | null) => void;
    onTemplateClick: (enriched: EnrichedTemplateEntry, event: Event) => void;
}

/**
 * Renders the template list panel with category chips and cards.
 *
 * The keyboard highlight (owned by the overlay) drives the focused card, the
 * scroll-into-view, and — as a fallback when the mouse isn't hovering — the
 * floating hover card, so arrow-key navigation always previews the detail card.
 *
 * @param props.entries Already-filtered template entries to display.
 * @param props.categories All categories (from the unfiltered list) for chips.
 * @param props.search Current search query (empty-state hint only).
 * @param props.activeCategory Currently selected category filter, or null.
 * @param props.selectedTemplateId ID of the selected multi-type template, or null.
 * @param props.highlightedIndex Keyboard-highlighted card index, or -1.
 * @param props.onCategoryChange Callback when a category chip is toggled.
 * @param props.onTemplateClick Callback when a template card is clicked.
 */
export function TemplatePanel({
    entries,
    categories,
    search,
    activeCategory,
    selectedTemplateId,
    highlightedIndex,
    onCategoryChange,
    onTemplateClick,
}: TemplatePanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [hoveredIndex, setHoveredIndex] = useState(-1);
    const hideTimeoutRef = useRef<number>(0);

    /**
     * The index whose hover card is currently displayed.
     * Mouse hover takes priority; the keyboard highlight is the fallback.
     */
    const activePreviewIndex = hoveredIndex >= 0 ? hoveredIndex : highlightedIndex;

    /**
     * Drop stale mouse-hover state when the filtered list changes.
     */
    useEffect(() => {
        setHoveredIndex(-1);
    }, [entries.length]);

    /**
     * Scroll the keyboard-highlighted item into view.
     */
    useEffect(() => {
        if (highlightedIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll(".am-template-card");
            items[highlightedIndex]?.scrollIntoView({ block: "nearest" });
        }
    }, [highlightedIndex]);

    // Short delay before hiding so the mouse can travel from the card to the
    // hover card without flickering.
    const handleCardHover = useCallback((index: number, hovered: boolean) => {
        window.clearTimeout(hideTimeoutRef.current);
        if (hovered) {
            setHoveredIndex(index);
        } else {
            hideTimeoutRef.current = window.setTimeout(() => setHoveredIndex(-1), HOVER_HIDE_DELAY);
        }
    }, []);

    // Keeps the hover card visible while the mouse is over it.
    const handleHoverCardEnter = useCallback(() => {
        window.clearTimeout(hideTimeoutRef.current);
    }, []);

    // Starts the hide delay when the mouse leaves the hover card.
    const handleHoverCardLeave = useCallback(() => {
        hideTimeoutRef.current = window.setTimeout(() => setHoveredIndex(-1), HOVER_HIDE_DELAY);
    }, []);

    /**
     * Computes the fixed position for the hover card based on the
     * active card's bounding rect and the panel's right edge.
     */
    const hoverCardStyle = useMemo(() => {
        if (activePreviewIndex < 0 || !listRef.current || !panelRef.current) {
            return null;
        }
        const cards = listRef.current.querySelectorAll(".am-template-card");
        const card = cards[activePreviewIndex] as HTMLElement | undefined;
        if (!card) {
            return null;
        }

        const cardRect = card.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        const panelRect = panelRef.current.getBoundingClientRect();
        // Open to the left of the panel so the card clears both the template list
        // and the BPMN palette. Clamp to the viewport edge on the rare occasion the
        // 540px panel sits hard against the left (then it may touch the panel, but
        // never runs off-screen).
        const HOVER_CARD_WIDTH = 300; // keep in sync with .am-hover-card width
        const GAP = 8;
        const left = Math.max(GAP, panelRect.left - HOVER_CARD_WIDTH - GAP);

        // Vertically align with the card, clamped to viewport.
        const top = Math.max(8, Math.min(cardRect.top, viewportHeight - 200));
        const maxHeight = viewportHeight - top - 8;

        return { top, left, maxHeight };
    }, [activePreviewIndex]);

    const activeEntry = activePreviewIndex >= 0 ? entries[activePreviewIndex] : null;

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
                        All
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
                        <p class="am-empty-text">No templates found</p>
                        {search && <p class="am-empty-hint">Try a different search term</p>}
                    </div>
                ) : (
                    entries.map((enriched, idx) => (
                        <ExpandableTemplateCard
                            key={enriched.id}
                            enrichedEntry={enriched}
                            focused={highlightedIndex === idx}
                            selected={selectedTemplateId === enriched.id}
                            onClick={(event) => onTemplateClick(enriched, event)}
                            onHoverChange={(hovered) => handleCardHover(idx, hovered)}
                        />
                    ))
                )}
            </div>

            {/* Floating hover card */}
            {activeEntry && hoverCardStyle && (
                <TemplateHoverCard
                    enrichedEntry={activeEntry}
                    style={hoverCardStyle}
                    onMouseEnter={handleHoverCardEnter}
                    onMouseLeave={handleHoverCardLeave}
                />
            )}
        </div>
    );
}
