/**
 * A template card that expands on hover/focus to reveal additional details
 * such as description, implementation detail, and documentation link.
 */
import { useState } from "preact/hooks";
import type { EnrichedTemplateEntry } from "../types";
import { extractImplementationDetail, bpmnTypeToIconClass } from "../types";

interface ExpandableTemplateCardProps {
    enrichedEntry: EnrichedTemplateEntry;
    focused: boolean;
    selected: boolean;
    onClick: (event: Event) => void;
}

/**
 * Renders a template entry as a card that expands on hover or keyboard focus.
 *
 * Collapsed state shows: icon, name, category badge.
 * Expanded state adds: description, implementation detail, documentation
 * link, and visible property count.
 *
 * @param props.enrichedEntry The template entry with optional full template data.
 * @param props.focused Whether this card has keyboard focus.
 * @param props.selected Whether this card is the currently selected template.
 * @param props.onClick Callback invoked when the card is clicked.
 */
export function ExpandableTemplateCard({
    enrichedEntry,
    focused,
    selected,
    onClick,
}: ExpandableTemplateCardProps) {
    const [hovered, setHovered] = useState(false);
    const { entry, template } = enrichedEntry;
    const expanded = hovered || focused || selected;

    const appliesTo = template?.appliesTo ?? [];

    const implDetail = template
        ? extractImplementationDetail(template.properties)
        : undefined;

    const visiblePropertyCount = template
        ? template.properties.filter((p) => p.type !== "Hidden").length
        : undefined;

    return (
        <div
          class={[
                "am-template-card",
                focused ? "am-template-card--focused" : "",
                selected ? "am-template-card--selected" : "",
                expanded ? "am-template-card--expanded" : "",
            ]
                .filter(Boolean)
                .join(" ")}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={(e) => onClick(e as unknown as Event)}
        >
            {/* Collapsed content — always visible */}
            <div class="am-card-header">
                {appliesTo.length === 1
? (
                    <span class={`am-card-bpmn-icon ${bpmnTypeToIconClass(appliesTo[0])}`} />
                )
: (
                    <span class="am-card-bpmn-icon bpmn-icon-task" />
                )}
                <div class="am-card-text">
                    <span class="am-card-name">{entry.label}</span>
                    {template?.category && (
                        <span class="am-badge am-badge--category">{template.category.name}</span>
                    )}
                </div>
                {entry.imageUrl && (
                    <img class="am-card-template-icon" src={entry.imageUrl} alt="" />
                )}
            </div>

            {/* Expanded content — visible on hover/focus */}
            {expanded && (
                <div class="am-card-details">
                    {implDetail && (
                        <div class="am-impl-detail">
                            <span class="am-impl-label">{implDetail.label}</span>
                            <code class="am-impl-value">{implDetail.value}</code>
                        </div>
                    )}
                    {entry.description && (
                        <p class="am-card-desc">{entry.description}</p>
                    )}
                    <div class="am-card-meta">
                        {entry.documentationRef && (
                            <a
                              class="am-card-docs-link"
                              href={entry.documentationRef}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M4.715 6.542L3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.001 1.001 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z" />
                                    <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 0 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 0 0-4.243-4.243L6.586 4.672z" />
                                </svg>
                                Docs
                            </a>
                        )}
                        {visiblePropertyCount !== undefined && (
                            <span class="am-badge am-badge--props">
                                {visiblePropertyCount}
{" "}
properties
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
