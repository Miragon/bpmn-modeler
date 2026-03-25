/**
 * Left panel of the append menu overlay.
 *
 * Displays a filterable list of element template entries with category
 * filter chips and expandable detail cards.
 */
import { useMemo, useEffect, useRef, useState, useCallback } from "preact/hooks";
import type { EnrichedTemplateEntry } from "../types";
import { ExpandableTemplateCard } from "./ExpandableTemplateCard";

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
    const listRef = useRef<HTMLDivElement>(null);
    const [focusIndex, setFocusIndex] = useState(-1);

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
            const appliesToLabels = (template?.appliesTo ?? [])
                .map(bpmnTypeToLabel);
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

    // Reset focus index when filter results change.
    useEffect(() => {
        setFocusIndex(-1);
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

    // Scroll focused item into view.
    useEffect(() => {
        if (focusIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll(".am-template-card");
            items[focusIndex]?.scrollIntoView({ block: "nearest" });
        }
    }, [focusIndex]);

    return (
        <div class="am-template-panel" onKeyDown={handleKeyDown}>
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
                                onCategoryChange(activeCategory === cat.id ? null : cat.id)}
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
                        {search && (
                            <p class="am-empty-hint">Try a different search term</p>
                        )}
                    </div>
                ) : (
                    filtered.map((enriched, idx) => (
                        <ExpandableTemplateCard
                            key={enriched.id}
                            enrichedEntry={enriched}
                            focused={focusIndex === idx}
                            selected={selectedTemplateId === enriched.id}
                            onClick={(event) => onTemplateClick(enriched, event)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
