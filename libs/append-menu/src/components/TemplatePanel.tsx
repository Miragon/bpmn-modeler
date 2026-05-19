/**
 * Left panel of the append menu overlay.
 *
 * Displays a filterable list of element template entries with category
 * filter chips.  Hovering or focusing a card displays a floating
 * {@link TemplateHoverCard} to the right of the panel.
 */
import { useMemo, useEffect, useRef, useState, useCallback } from "preact/hooks";
import type { EnrichedTemplateEntry } from "../types";
import { ExpandableTemplateCard } from "./ExpandableTemplateCard";
import { TemplateHoverCard } from "./TemplateHoverCard";

// Delay in ms before the hover card hides after mouse leave.
const HOVER_HIDE_DELAY = 150;

/**
 * Converts a BPMN type string to a human-readable label for search matching.
 *
 * E.g. `"bpmn:ServiceTask"` → `"service task"`,
 *      `"bpmn:CallActivity"` → `"call activity"`.
 *
 * @param bpmnType The BPMN type string.
 * @returns A lowercase, space-separated label.
 */
function bpmnTypeToLabel(bpmnType: string): string {
    const shortName = bpmnType.split(":")[1] ?? bpmnType;
    return shortName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

interface TemplatePanelProps {
    entries: EnrichedTemplateEntry[];
    search: string;
    activeCategory: string | null;
    selectedTemplateId: string | null;
    onCategoryChange: (cat: string | null) => void;
    onTemplateClick: (enriched: EnrichedTemplateEntry, event: Event) => void;
}

/**
 * Renders the template list panel with category chips and cards.
 *
 * Search filtering matches against template name, description, keywords,
 * category name, and the human-readable names of the template's
 * `appliesTo` types (e.g. searching "service task" finds templates that
 * apply to `bpmn:ServiceTask`).
 *
 * A floating hover card appears to the right of the panel when a card
 * is hovered or keyboard-focused, showing detailed template info without
 * causing layout shifts in the list.
 *
 * @param props.entries Enriched template entries to display.
 * @param props.search Current search query (from the shared search bar).
 * @param props.activeCategory Currently selected category filter, or null.
 * @param props.selectedTemplateId ID of the currently selected multi-type template, or null.
 * @param props.onCategoryChange Callback when a category chip is toggled.
 * @param props.onTemplateClick Callback when a template card is clicked.
 */
export function TemplatePanel({
    entries,
    search,
    activeCategory,
    selectedTemplateId,
    onCategoryChange,
    onTemplateClick,
}: TemplatePanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [focusIndex, setFocusIndex] = useState(-1);
    const [hoveredIndex, setHoveredIndex] = useState(-1);
    const hideTimeoutRef = useRef<number>(0);

    /**
     * The index whose hover card is currently displayed.
     * Mouse hover takes priority; keyboard focus is used as fallback.
     */
    const activePreviewIndex = hoveredIndex >= 0 ? hoveredIndex : focusIndex;

    // Extract unique categories from the full ElementTemplate objects.
    const categories = useMemo(() => {
        const seen = new Map<string, string>();
        for (const { template } of entries) {
            if (template?.category) {
                seen.set(template.category.id, template.category.name);
            }
        }
        return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
    }, [entries]);

    // Filter templates by search query and active category.
    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return entries.filter(({ entry, template }) => {
            if (activeCategory && template?.category?.id !== activeCategory) {
                return false;
            }
            if (!q) {
                return true;
            }
            // Build searchable text from name, description, keywords,
            // category, and appliesTo type labels.
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
    }, [entries, search, activeCategory]);

    /**
     * Reset focus and hover when filter results change.
     */
    useEffect(() => {
        setFocusIndex(-1);
        setHoveredIndex(-1);
    }, [filtered.length]);

    // Keyboard navigation within the template list.
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setFocusIndex((prev) => Math.min(prev + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setFocusIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === "Enter" && focusIndex >= 0 && focusIndex < filtered.length) {
                e.preventDefault();
                const focused = filtered[focusIndex];
                onTemplateClick(focused, e as unknown as Event);
            }
        },
        [filtered, focusIndex, onTemplateClick],
    );

    /**
     * Scroll focused item into view.
     */
    useEffect(() => {
        if (focusIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll(".am-template-card");
            items[focusIndex]?.scrollIntoView({ block: "nearest" });
        }
    }, [focusIndex]);

    /**
     * Handles hover state changes from individual cards.
     * Uses a short delay before hiding to allow the mouse to move
     * from the card to the hover card without flickering.
     */
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

        // Position overlapping the template list, starting near its midpoint.
        const left = cardRect.left + cardRect.width * 0.5;

        // Vertically align with the card, clamped to viewport.
        const top = Math.max(8, Math.min(cardRect.top, viewportHeight - 200));
        const maxHeight = viewportHeight - top - 8;

        return { top, left, maxHeight };
    }, [activePreviewIndex]);

    const activeEntry = activePreviewIndex >= 0 ? filtered[activePreviewIndex] : null;

    return (
        <div class="am-template-panel" ref={panelRef} onKeyDown={handleKeyDown}>
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
                {filtered.length === 0 ? (
                    <div class="am-empty">
                        <p class="am-empty-text">No templates found</p>
                        {search && <p class="am-empty-hint">Try a different search term</p>}
                    </div>
                ) : (
                    filtered.map((enriched, idx) => (
                        <ExpandableTemplateCard
                            key={enriched.id}
                            enrichedEntry={enriched}
                            focused={focusIndex === idx}
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
