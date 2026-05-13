/**
 * Root Preact component for the custom append/create menu overlay.
 *
 * Renders a positioned panel anchored near the trigger point (context pad
 * or palette toolbar) with a two-panel layout: templates on the left and
 * a collapsible BPMN element palette on the right.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "preact/hooks";
import type {
    EnrichedTemplateEntry,
    BpmnElementGroup,
    PopupMenuEntryAction,
} from "../types";
import { TemplatePanel } from "./TemplatePanel";
import { BpmnElementPalette } from "./BpmnElementPalette";

interface AppendMenuOverlayProps {
    templateEntries: EnrichedTemplateEntry[];
    bpmnGroups: BpmnElementGroup[];
    favourites: string[];
    position: { x: number; y: number };
    canvasBounds: { right: number; bottom: number };
    onSelect: (action: PopupMenuEntryAction, event: Event) => void;
    onCancel: () => void;
}

/** Margin from viewport edges when clamping the panel position. */
const VIEWPORT_MARGIN = 8;

/**
 * Clamps the panel position so it stays within the canvas area.
 *
 * Uses the canvas container's bounds rather than the full viewport
 * to avoid overlapping the properties panel on the right.
 *
 * @param pos The desired top-left position in viewport coordinates.
 * @param panelRect The panel's bounding rect after initial render.
 * @param canvasBounds The right and bottom edges of the canvas container.
 * @returns Clamped `{ left, top }` values for CSS.
 */
function clampToCanvas(
    pos: { x: number; y: number },
    panelRect: { width: number; height: number },
    canvasBounds: { right: number; bottom: number },
): { left: number; top: number } {
    const maxLeft = canvasBounds.right - panelRect.width - VIEWPORT_MARGIN;
    const maxTop = canvasBounds.bottom - panelRect.height - VIEWPORT_MARGIN;

    return {
        left: Math.max(VIEWPORT_MARGIN, Math.min(pos.x, maxLeft)),
        top: Math.max(VIEWPORT_MARGIN, Math.min(pos.y, maxTop)),
    };
}

/**
 * Positioned panel that presents the append/create menu anchored near the
 * trigger point.
 *
 * The search bar is shared across both panels: it filters templates on the
 * left and BPMN elements on the right.  Searching for a BPMN type name
 * (e.g. "service task") also surfaces templates that apply to that type.
 *
 * Clicking a single-type template immediately creates the element.
 * Clicking a multi-type template selects it and filters the BPMN palette
 * to only show the matching element types.
 *
 * @param props.templateEntries Enriched element template entries for the left panel.
 * @param props.bpmnGroups BPMN element entries grouped by category for the right panel.
 * @param props.position Viewport coordinates to anchor the panel near.
 * @param props.onSelect Callback invoked with the chosen entry's action.
 * @param props.onCancel Callback invoked when the user dismisses the overlay.
 */
export function AppendMenuOverlay({
    templateEntries,
    bpmnGroups,
    favourites,
    position,
    canvasBounds,
    onSelect,
    onCancel,
}: AppendMenuOverlayProps) {
    const hasTemplates = templateEntries.length > 0;

    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [selectedTemplate, setSelectedTemplate] =
        useState<EnrichedTemplateEntry | null>(null);
    // When the workspace has no element templates, default to the expanded
    // palette so users see the full BPMN element list instead of an awkward
    // icon-only column next to an empty template panel.
    const [paletteExpanded, setPaletteExpanded] = useState(!hasTemplates);
    const searchRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelStyle, setPanelStyle] = useState<{ left: number; top: number } | null>(
        null,
    );

    // The set of BPMN types the selected multi-type template applies to.
    const appliesToFilter = useMemo<Set<string> | null>(() => {
        if (!selectedTemplate?.template) {
            return null;
        }
        return new Set(selectedTemplate.template.appliesTo);
    }, [selectedTemplate]);

    // Position the panel after initial render, clamped to canvas area.
    useEffect(() => {
        if (panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect();
            setPanelStyle(clampToCanvas(position, rect, canvasBounds));
        }
    }, [position, canvasBounds]);

    // Auto-focus the search input on mount.
    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    // Close on Escape key.
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

    /**
     * Handles a template card click.
     *
     * Single-type templates are applied immediately.
     * Multi-type templates are selected so the palette can be filtered.
     */
    const handleTemplateClick = useCallback(
        (enriched: EnrichedTemplateEntry, event: Event) => {
            const appliesTo = enriched.template?.appliesTo ?? [];

            if (appliesTo.length <= 1) {
                onSelect(enriched.entry.action, event);
            } else {
                setSelectedTemplate(enriched);
            }
        },
        [onSelect],
    );

    /**
     * Handles a BPMN element button click in the palette.
     *
     * If a multi-type template is selected, creates the element using
     * the template's action.  Otherwise, creates a plain BPMN element.
     */
    const handleBpmnSelect = useCallback(
        (action: PopupMenuEntryAction, event: Event) => {
            if (selectedTemplate) {
                onSelect(selectedTemplate.entry.action, event);
            } else {
                onSelect(action, event);
            }
        },
        [onSelect, selectedTemplate],
    );

    return (
        <div class="am-click-away" onClick={onCancel}>
            <div
                ref={panelRef}
                class={`am-panel ${hasTemplates ? "" : "am-panel--palette-only"}`}
                style={
                    panelStyle
                        ? { left: `${panelStyle.left}px`, top: `${panelStyle.top}px` }
                        : { left: `${position.x}px`, top: `${position.y}px` }
                }
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search bar */}
                <div class="am-search-wrapper">
                    <svg
                        class="am-search-icon"
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                    >
                        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
                    </svg>
                    <input
                        ref={searchRef}
                        class="am-search-input"
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                    />
                    {search && (
                        <button
                            class="am-search-clear"
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

                {/* Main content: template list + BPMN palette */}
                <div class="am-body">
                    {hasTemplates && (
                        <TemplatePanel
                            entries={templateEntries}
                            search={search}
                            activeCategory={activeCategory}
                            selectedTemplateId={selectedTemplate?.id ?? null}
                            onCategoryChange={setActiveCategory}
                            onTemplateClick={handleTemplateClick}
                        />
                    )}
                    <BpmnElementPalette
                        groups={bpmnGroups}
                        favourites={favourites}
                        search={search}
                        appliesToFilter={appliesToFilter}
                        expanded={paletteExpanded}
                        onToggleExpand={() => setPaletteExpanded((prev) => !prev)}
                        onSelect={handleBpmnSelect}
                    />
                </div>
            </div>
        </div>
    );
}
