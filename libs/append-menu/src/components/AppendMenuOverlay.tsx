/**
 * Root Preact component for the custom append/create menu overlay.
 *
 * Renders a positioned panel anchored near the trigger point (context pad
 * or palette toolbar) with a two-panel layout: templates on the left and
 * a collapsible BPMN element palette on the right.
 *
 * The overlay owns all filter *inputs* (search, category, template selection)
 * and derives both columns' navigable order once (see {@link ../filtering}),
 * driving a single keyboard highlight (see {@link ../navigation}). The panels
 * are thin renderers. Keyboard: the search input keeps focus permanently while
 * ↑/↓ move a highlight in the active column, ←/→ switch columns, Enter selects.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "preact/hooks";
import type { EnrichedTemplateEntry, BpmnElementGroup, PopupMenuEntryAction } from "../types";
import {
    filterTemplates,
    extractCategories,
    processPaletteGroups,
    flattenPaletteItems,
} from "../filtering";
import {
    initialHighlight,
    moveVertical,
    moveHorizontal,
    type Highlight,
    type NavColumns,
} from "../navigation";
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

// Margin from viewport edges when clamping the panel position.
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
    const [selectedTemplate, setSelectedTemplate] = useState<EnrichedTemplateEntry | null>(null);
    // When the workspace has no element templates, default to the expanded
    // palette so users see the full BPMN element list instead of an awkward
    // icon-only column next to an empty template panel.
    const [paletteExpanded, setPaletteExpanded] = useState(!hasTemplates);
    const [highlight, setHighlight] = useState<Highlight | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelStyle, setPanelStyle] = useState<{ left: number; top: number } | null>(null);

    // The set of BPMN types the selected multi-type template applies to.
    const appliesToFilter = useMemo<Set<string> | null>(() => {
        if (!selectedTemplate?.template) {
            return null;
        }
        return new Set(selectedTemplate.template.appliesTo);
    }, [selectedTemplate]);

    // --- Derived, shared filter state (single source of truth) -------------
    const filteredTemplates = useMemo(
        () => filterTemplates(templateEntries, search, activeCategory),
        [templateEntries, search, activeCategory],
    );
    const categories = useMemo(() => extractCategories(templateEntries), [templateEntries]);
    const processedPalette = useMemo(
        () => processPaletteGroups(bpmnGroups, favourites, search, appliesToFilter),
        [bpmnGroups, favourites, search, appliesToFilter],
    );
    const paletteItems = useMemo(() => flattenPaletteItems(processedPalette), [processedPalette]);
    // Only visible (non-hidden) items are navigable; disabled ones stay in the
    // list so navigation can skip over them but the highlight can still land
    // adjacent to them.
    const paletteNav = useMemo(() => paletteItems.filter((i) => !i.hidden), [paletteItems]);
    const navColumns = useMemo<NavColumns>(
        () => ({
            templates: filteredTemplates.map(() => ({ disabled: false })),
            palette: paletteNav.map((i) => ({ disabled: i.disabled })),
        }),
        [filteredTemplates, paletteNav],
    );

    // Refs let the stable Escape capture listener read the latest values
    // without re-registering on every keystroke.
    const navColumnsRef = useRef(navColumns);
    navColumnsRef.current = navColumns;
    const selectedTemplateRef = useRef(selectedTemplate);
    selectedTemplateRef.current = selectedTemplate;

    /**
     * Position the panel after initial render, clamped to canvas area.
     */
    useEffect(() => {
        if (panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect();
            setPanelStyle(clampToCanvas(position, rect, canvasBounds));
        }
    }, [position, canvasBounds]);

    /**
     * Auto-focus the search input on mount. The input keeps focus for the
     * whole session; navigation keydowns bubble from it up to the panel.
     */
    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    // A signature of the *visible* items in both columns. Changes only when
    // filtering reshuffles membership (search/category), not when selecting a
    // template merely toggles palette entries' disabled state — so an
    // intentional programmatic highlight move survives a template selection.
    const listsSignature = useMemo(
        () =>
            filteredTemplates.map((t) => t.id).join("|") +
            "##" +
            paletteNav.map((i) => i.key).join("|"),
        [filteredTemplates, paletteNav],
    );

    /**
     * Re-seed the highlight to the first enabled item whenever the visible
     * lists change. Default = first item (like the standard popup) so `A`
     * then `Enter` appends the top hit immediately.
     */
    useEffect(() => {
        // Re-run on membership change only; navColumns is read via ref.
        setHighlight(initialHighlight(navColumnsRef.current));
    }, [listsSignature]);

    /**
     * Selecting a multi-type template always leads to picking the concrete
     * type next, so expand the palette and move the highlight to its first
     * enabled item (icon-only highlight would be unreadable).
     */
    useEffect(() => {
        if (!selectedTemplate) {
            return;
        }
        setPaletteExpanded(true);
        const idx = navColumnsRef.current.palette.findIndex((i) => !i.disabled);
        if (idx >= 0) {
            setHighlight({ column: "palette", index: idx });
        }
    }, [selectedTemplate]);

    /**
     * Staged Escape. Registered in the capture phase with `stopPropagation`
     * so it fires before — and shields — the webview-level "Escape → focus
     * canvas" handler. A first Escape with a template selected only clears
     * that selection (back to the templates column); otherwise it cancels.
     */
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") {
                return;
            }
            e.stopPropagation();
            if (selectedTemplateRef.current) {
                setSelectedTemplate(null);
                setHighlight(initialHighlight(navColumnsRef.current));
            } else {
                onCancel();
            }
        };
        document.addEventListener("keydown", handleKey, true);
        return () => document.removeEventListener("keydown", handleKey, true);
    }, [onCancel]);

    /**
     * Handles a template card click / Enter.
     *
     * Single-type templates are applied immediately. Multi-type templates are
     * selected so the palette can be filtered (see the selection effect).
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
     * Handles a BPMN element button click / Enter in the palette.
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

    /**
     * Activates the currently highlighted item (Enter).
     */
    const activateHighlight = useCallback(
        (event: Event) => {
            if (!highlight) {
                return;
            }
            if (highlight.column === "templates") {
                const enriched = filteredTemplates[highlight.index];
                if (enriched) {
                    handleTemplateClick(enriched, event);
                }
            } else {
                const item = paletteNav[highlight.index];
                if (item && !item.disabled) {
                    handleBpmnSelect(item.entry.action, event);
                }
            }
        },
        [highlight, filteredTemplates, paletteNav, handleTemplateClick, handleBpmnSelect],
    );

    /**
     * Keyboard navigation for the whole overlay.
     *
     * Bound on the panel div, not the input, so the search field keeps focus
     * while its keydowns bubble up here — the trick the diagram-js standard
     * popup uses. ←/→ deliberately sacrifice the input's caret movement (same
     * trade-off as the standard popup); Home/End/Backspace still work.
     */
    const handlePanelKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (!highlight) {
                return;
            }
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setHighlight(moveVertical(highlight, 1, navColumns));
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setHighlight(moveVertical(highlight, -1, navColumns));
                    break;
                case "ArrowRight": {
                    e.preventDefault();
                    const next = moveHorizontal(highlight, 1, navColumns);
                    setHighlight(next);
                    // Expand on arrival: an icon-only highlight is unreadable.
                    if (next.column === "palette" && !paletteExpanded) {
                        setPaletteExpanded(true);
                    }
                    break;
                }
                case "ArrowLeft":
                    e.preventDefault();
                    setHighlight(moveHorizontal(highlight, -1, navColumns));
                    break;
                case "Enter":
                    e.preventDefault();
                    activateHighlight(e as unknown as Event);
                    break;
            }
        },
        [highlight, navColumns, paletteExpanded, activateHighlight],
    );

    const highlightedTemplateIndex = highlight?.column === "templates" ? highlight.index : -1;
    const highlightedPaletteKey =
        highlight?.column === "palette" ? (paletteNav[highlight.index]?.key ?? null) : null;

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
                onKeyDown={handlePanelKeyDown}
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
                            entries={filteredTemplates}
                            categories={categories}
                            search={search}
                            activeCategory={activeCategory}
                            selectedTemplateId={selectedTemplate?.id ?? null}
                            highlightedIndex={highlightedTemplateIndex}
                            onCategoryChange={setActiveCategory}
                            onTemplateClick={handleTemplateClick}
                        />
                    )}
                    <BpmnElementPalette
                        favouriteEntries={processedPalette.favouriteEntries}
                        groups={processedPalette.groups}
                        expanded={paletteExpanded}
                        highlightedKey={highlightedPaletteKey}
                        onToggleExpand={() => setPaletteExpanded((prev) => !prev)}
                        onSelect={handleBpmnSelect}
                    />
                </div>
            </div>
        </div>
    );
}
