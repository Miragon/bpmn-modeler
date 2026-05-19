/**
 * Root Preact component for the element template chooser overlay.
 *
 * Renders a modal with a split layout: a searchable/filterable template
 * list on the left and a detail preview panel on the right.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "preact/hooks";
import type { ElementTemplate } from "../types";
import { extractImplementationDetail } from "../types";
import { TemplatePreview } from "./TemplatePreview";

interface ChooserOverlayProps {
    templates: ElementTemplate[];
    onSelect: (template: ElementTemplate) => void;
    onCancel: () => void;
}

/**
 * Full-screen overlay that presents the template chooser UI.
 *
 * @param props.templates Available element templates for the selected element.
 * @param props.onSelect Callback invoked with the chosen template.
 * @param props.onCancel Callback invoked when the user dismisses the overlay.
 */
export function ChooserOverlay({ templates, onSelect, onCancel }: ChooserOverlayProps) {
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [focusIndex, setFocusIndex] = useState(-1);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Extract unique categories from templates.
    const categories = useMemo(() => {
        const seen = new Map<string, string>();
        for (const t of templates) {
            if (t.category) {
                seen.set(t.category.id, t.category.name);
            }
        }
        return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
    }, [templates]);

    // Filter templates by search query and active category.
    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return templates.filter((t) => {
            if (activeCategory && t.category?.id !== activeCategory) {
                return false;
            }
            if (!q) {
                return true;
            }
            const haystack = [
                t.name,
                t.description ?? "",
                t.category?.name ?? "",
                ...(t.keywords ?? []),
            ]
                .join(" ")
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [templates, search, activeCategory]);

    const selectedTemplate = useMemo(
        () => filtered.find((t) => t.id === selectedId) ?? null,
        [filtered, selectedId],
    );

    /**
     * Auto-focus the search input on mount.
     */
    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    /**
     * Reset focus index when filter results change.
     */
    useEffect(() => {
        setFocusIndex(-1);
    }, [filtered.length]);

    /**
     * Close on Escape key.
     */
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onCancel();
            }
        };
        document.addEventListener("keydown", handleKey, true);
        return () => document.removeEventListener("keydown", handleKey, true);
    }, [onCancel]);

    // Keyboard navigation within the template list.
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setFocusIndex((prev) => {
                    const next = Math.min(prev + 1, filtered.length - 1);
                    setSelectedId(filtered[next]?.id ?? null);
                    return next;
                });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setFocusIndex((prev) => {
                    const next = Math.max(prev - 1, 0);
                    setSelectedId(filtered[next]?.id ?? null);
                    return next;
                });
            } else if (e.key === "Enter" && selectedTemplate) {
                e.preventDefault();
                onSelect(selectedTemplate);
            }
        },
        [filtered, selectedTemplate, onSelect],
    );

    /**
     * Scroll focused item into view.
     */
    useEffect(() => {
        if (focusIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll(".etc-template-card");
            items[focusIndex]?.scrollIntoView({ block: "nearest" });
        }
    }, [focusIndex]);

    const visiblePropertyCount = (t: ElementTemplate) =>
        t.properties.filter((p) => p.type !== "Hidden").length;

    return (
        <div class="etc-backdrop" onClick={onCancel}>
            <div class="etc-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
                {/* Header */}
                <div class="etc-header">
                    <h2 class="etc-title">Element Templates</h2>
                    <button
                        class="etc-close-btn"
                        onClick={onCancel}
                        aria-label="Close"
                        type="button"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 8.707l3.646 3.647.708-.708L8.707 8l3.647-3.646-.708-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z" />
                        </svg>
                    </button>
                </div>

                {/* Search bar */}
                <div class="etc-search-wrapper">
                    <svg
                        class="etc-search-icon"
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                    >
                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
                    </svg>
                    <input
                        ref={searchRef}
                        class="etc-search-input"
                        type="text"
                        placeholder="Search templates..."
                        value={search}
                        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                    />
                    {search && (
                        <button
                            class="etc-search-clear"
                            onClick={() => {
                                setSearch("");
                                searchRef.current?.focus();
                            }}
                            type="button"
                            aria-label="Clear search"
                        >
                            ×
                        </button>
                    )}
                </div>

                {/* Category filter chips */}
                {categories.length > 0 && (
                    <div class="etc-filters">
                        <button
                            class={`etc-chip ${activeCategory === null ? "etc-chip--active" : ""}`}
                            onClick={() => setActiveCategory(null)}
                            type="button"
                        >
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                class={`etc-chip ${activeCategory === cat.id ? "etc-chip--active" : ""}`}
                                onClick={() =>
                                    setActiveCategory(activeCategory === cat.id ? null : cat.id)
                                }
                                type="button"
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Main content: list + preview */}
                <div class="etc-body">
                    <div class="etc-list-panel" ref={listRef}>
                        {filtered.length === 0 ? (
                            <div class="etc-empty">
                                <p class="etc-empty-text">No templates found</p>
                                {search && (
                                    <p class="etc-empty-hint">Try a different search term</p>
                                )}
                            </div>
                        ) : (
                            filtered.map((t, idx) => (
                                <div
                                    key={t.id}
                                    class={[
                                        "etc-template-card",
                                        selectedId === t.id ? "etc-template-card--selected" : "",
                                        focusIndex === idx ? "etc-template-card--focused" : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    onClick={() => {
                                        setSelectedId(t.id);
                                        setFocusIndex(idx);
                                    }}
                                    onDblClick={() => onSelect(t)}
                                >
                                    <div class="etc-card-header">
                                        {t.icon?.contents ? (
                                            <img
                                                class="etc-card-icon"
                                                src={t.icon.contents}
                                                alt=""
                                            />
                                        ) : (
                                            <div class="etc-card-icon-placeholder">
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 16 16"
                                                    fill="currentColor"
                                                >
                                                    <path d="M4 0h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H4zm1 2h6v1H5V3zm0 3h6v1H5V6zm0 3h4v1H5V9z" />
                                                </svg>
                                            </div>
                                        )}
                                        <div class="etc-card-text">
                                            <span class="etc-card-name">{t.name}</span>
                                            {(() => {
                                                const impl = extractImplementationDetail(
                                                    t.properties,
                                                );
                                                return impl ? (
                                                    <span class="etc-card-impl">
                                                        {impl.label}:<code>{impl.value}</code>
                                                    </span>
                                                ) : null;
                                            })()}
                                            {t.description && (
                                                <span class="etc-card-desc">{t.description}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div class="etc-card-meta">
                                        {t.category && (
                                            <span class="etc-badge etc-badge--category">
                                                {t.category.name}
                                            </span>
                                        )}
                                        <span class="etc-badge etc-badge--props">
                                            {visiblePropertyCount(t)} properties
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Preview panel */}
                    <div class="etc-preview-panel">
                        {selectedTemplate ? (
                            <TemplatePreview
                                template={selectedTemplate}
                                onApply={() => onSelect(selectedTemplate)}
                            />
                        ) : (
                            <div class="etc-preview-empty">
                                <svg
                                    width="48"
                                    height="48"
                                    viewBox="0 0 16 16"
                                    fill="currentColor"
                                    opacity="0.2"
                                >
                                    <path d="M4 0h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H4zm1 2h6v1H5V3zm0 3h6v1H5V6zm0 3h4v1H5V9z" />
                                </svg>
                                <p>Select a template to see its details</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
