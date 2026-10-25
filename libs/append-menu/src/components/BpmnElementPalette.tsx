/**
 * Right panel of the append menu overlay.
 *
 * A thin renderer of the pre-processed palette (favourites row + categorised
 * groups). Filtering/favourite resolution lives in {@link ../filtering} and
 * the keyboard highlight and previewed item in the parent overlay, so this
 * component only draws buttons, reflects the highlighted key, and shows the
 * previewed item's description card.
 */
import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
    favouriteNavKey,
    groupNavKey,
    isEntryDisabled,
    type PaletteNavItem,
    type ProcessedEntry,
    type ProcessedGroup,
} from "../filtering";
import type { Translate } from "../types";
import { ElementDescriptionCard } from "./ElementDescriptionCard";
import { useHoverCardPosition } from "./useHoverCardPosition";

let descriptionCardCount = 0;

interface BpmnElementPaletteProps {
    favouriteEntries: ProcessedEntry[];
    groups: ProcessedGroup[];
    translate: Translate;
    expanded: boolean;
    /** Nav key of the keyboard-highlighted button, or null when in the other column. */
    highlightedKey: string | null;
    /** The item to preview (mouse hover, else the keyboard highlight), or null. */
    previewedItem: PaletteNavItem | null;
    /** The menu panel; the description card opens beside it so it covers neither column. */
    previewAnchorRef: RefObject<HTMLElement>;
    onToggleExpand: () => void;
    /** Reports hover-peek state so the parent can transiently expand the palette on hover. */
    onPeekChange?: (peek: boolean) => void;
    onEntryHover: (navKey: string, hovered: boolean) => void;
    onPreviewHover: (hovered: boolean) => void;
    onSelect: (entry: ProcessedEntry, event: Event) => void;
}

/**
 * Renders a categorised palette of BPMN element buttons.
 *
 * In collapsed mode, buttons show only icons; expanded mode adds labels.
 * Each button carries a namespaced `data-nav-key` (`fav:…` / `grp:…`) so the
 * keyboard highlight and the preview can target the right instance — a
 * favourite appears both in the favourites row and in its own group.
 *
 * @param props.favouriteEntries Resolved favourite entries (annotated).
 * @param props.groups Annotated BPMN element groups.
 * @param props.expanded Whether the palette shows labels alongside icons.
 * @param props.highlightedKey Nav key of the highlighted button, or null.
 * @param props.previewedItem Item whose description card shows, or null.
 * @param props.previewAnchorRef Element the description card opens beside.
 * @param props.onToggleExpand Callback to toggle expanded/collapsed state.
 * @param props.onPeekChange Callback reporting hover-peek enter/leave.
 * @param props.onEntryHover Callback when the mouse enters or leaves a button.
 * @param props.onPreviewHover Callback when the mouse enters or leaves the description card.
 * @param props.onSelect Callback invoked when a BPMN element button is clicked.
 */
export function BpmnElementPalette({
    favouriteEntries,
    groups,
    translate,
    expanded,
    highlightedKey,
    previewedItem,
    previewAnchorRef,
    onToggleExpand,
    onPeekChange,
    onEntryHover,
    onPreviewHover,
    onSelect,
}: BpmnElementPaletteProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    // Not useId: it restarts per Preact render root, so another root on the page could reuse the id.
    const [descriptionCardId] = useState(() => `am-element-description-${++descriptionCardCount}`);

    /**
     * Scroll the keyboard-highlighted button into view.
     */
    useEffect(() => {
        if (highlightedKey && contentRef.current) {
            const el = contentRef.current.querySelector(`[data-nav-key="${highlightedKey}"]`);
            el?.scrollIntoView({ block: "nearest" });
        }
    }, [highlightedKey]);

    const describedItem = previewedItem?.entry.description ? previewedItem : null;
    const descriptionPosition = useHoverCardPosition(
        previewAnchorRef,
        contentRef,
        (content) =>
            describedItem ? content.querySelector(`[data-nav-key="${describedItem.key}"]`) : null,
        { mayOpenRight: true },
    );

    const renderButton = (processed: ProcessedEntry, navKey: string) => (
        <PaletteButton
            key={navKey}
            processed={processed}
            navKey={navKey}
            expanded={expanded}
            focused={navKey === highlightedKey}
            describedBy={navKey === describedItem?.key ? descriptionCardId : undefined}
            onHoverChange={(hovered) => onEntryHover(navKey, hovered)}
            onSelect={onSelect}
        />
    );

    return (
        <>
            <div
                class={`am-palette-panel ${expanded ? "am-palette-panel--expanded" : ""}`}
                onMouseEnter={() => onPeekChange?.(true)}
                onMouseLeave={() => onPeekChange?.(false)}
            >
                <div class="am-palette-header">
                    <h3 class="am-palette-title">{translate("BPMN")}</h3>
                    <button
                        class="am-palette-toggle"
                        onClick={onToggleExpand}
                        title={expanded ? translate("Collapse") : translate("Expand")}
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
                            {expanded && (
                                <h4 class="am-bpmn-group-title">{translate("Favourites")}</h4>
                            )}
                            <div class={`am-bpmn-grid ${expanded ? "" : "am-bpmn-grid--compact"}`}>
                                {favouriteEntries
                                    .filter((processed) => !processed.hidden)
                                    .map((processed) =>
                                        renderButton(processed, favouriteNavKey(processed.id)),
                                    )}
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
                                {/* Upstream group names arrive already translated; only the
                                synthesized "Other" fallback needs the overlay. */}
                                {expanded && (
                                    <h4 class="am-bpmn-group-title">
                                        {group.id === "other" ? translate(group.name) : group.name}
                                    </h4>
                                )}
                                <div
                                    class={`am-bpmn-grid ${expanded ? "" : "am-bpmn-grid--compact"}`}
                                >
                                    {visibleEntries.map((processed) =>
                                        renderButton(
                                            processed,
                                            groupNavKey(group.id, processed.id),
                                        ),
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Outside the palette panel: resting on the card must not peek the palette open. */}
            {describedItem && descriptionPosition && (
                <ElementDescriptionCard
                    id={descriptionCardId}
                    entry={describedItem.entry}
                    position={descriptionPosition}
                    onHoverChange={onPreviewHover}
                />
            )}
        </>
    );
}

interface PaletteButtonProps {
    processed: ProcessedEntry;
    navKey: string;
    expanded: boolean;
    focused: boolean;
    describedBy: string | undefined;
    onHoverChange: (hovered: boolean) => void;
    onSelect: (entry: ProcessedEntry, event: Event) => void;
}

function PaletteButton({
    processed,
    navKey,
    expanded,
    focused,
    describedBy,
    onHoverChange,
    onSelect,
}: PaletteButtonProps) {
    const { entry } = processed;
    const isDisabled = isEntryDisabled(processed);
    return (
        <button
            data-nav-key={navKey}
            class={`am-bpmn-button ${isDisabled ? "am-bpmn-button--disabled" : ""} ${focused ? "am-bpmn-button--focused" : ""} ${expanded ? "" : "am-bpmn-button--icon-only"}`}
            disabled={isDisabled}
            aria-describedby={describedBy}
            onClick={(e) => onSelect(processed, e as unknown as Event)}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
            // Also the accessible name while the button shows only its icon.
            title={entry.label}
            type="button"
        >
            {entry.className && <span class={`am-bpmn-icon ${entry.className}`} />}
            {expanded && <span class="am-bpmn-label">{entry.label}</span>}
        </button>
    );
}
