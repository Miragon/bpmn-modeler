/**
 * A compact template card that shows the template name, icon, and category.
 *
 * Detailed information is displayed in a floating {@link TemplateHoverCard}
 * managed by the parent {@link TemplatePanel}.
 */
import type { EnrichedTemplateEntry } from "../types";
import { bpmnTypeToIconClass } from "../types";

interface TemplateCardProps {
    enrichedEntry: EnrichedTemplateEntry;
    focused: boolean;
    selected: boolean;
    onClick: (event: Event) => void;
    onHoverChange: (hovered: boolean) => void;
}

/**
 * Renders a template entry as a compact card row.
 *
 * Shows: BPMN type icon, template name, category badge, and template icon.
 * Hover/focus state is communicated to the parent so it can display the
 * floating hover card with full details.
 *
 * @param props.enrichedEntry The template entry with optional full template data.
 * @param props.focused Whether this card has keyboard focus.
 * @param props.selected Whether this card is the currently selected template.
 * @param props.onClick Callback invoked when the card is clicked.
 * @param props.onHoverChange Callback invoked when mouse enters or leaves the card.
 */
export function ExpandableTemplateCard({
    enrichedEntry,
    focused,
    selected,
    onClick,
    onHoverChange,
}: TemplateCardProps) {
    const { entry, template } = enrichedEntry;
    const appliesTo = template?.appliesTo ?? [];

    return (
        <div
            class={[
                "am-template-card",
                focused ? "am-template-card--focused" : "",
                selected ? "am-template-card--selected" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            onMouseEnter={() => onHoverChange(true)}
            onMouseLeave={() => onHoverChange(false)}
            onClick={(e) => onClick(e as unknown as Event)}
        >
            <div class="am-card-header">
                {appliesTo.length === 1 ? (
                    <span
                        class={`am-card-bpmn-icon ${bpmnTypeToIconClass(appliesTo[0])}`}
                    />
                ) : (
                    <span class="am-card-bpmn-icon bpmn-icon-task" />
                )}
                <div class="am-card-text">
                    <span class="am-card-name">{entry.label}</span>
                    {template?.category && (
                        <span class="am-badge am-badge--category">
                            {template.category.name}
                        </span>
                    )}
                </div>
                {entry.imageUrl && (
                    <img class="am-card-template-icon" src={entry.imageUrl} alt="" />
                )}
            </div>
        </div>
    );
}
