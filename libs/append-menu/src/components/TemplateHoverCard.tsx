/**
 * Floating hover card that displays detailed template information.
 *
 * Opens beside the menu when the user hovers or keyboard-highlights a
 * template card. Structured similarly to the TemplatePreview in
 * element-template-chooser.
 */
// Deep import: the chooser barrel value-imports the DI module (and with it
// minisearch), which must stay out of the engine-neutral /design graph.
import {
    applyTemplatePreset,
    extractImplementationDetail,
    partitionVisibleProperties,
    propertyDisplayLabel,
    type TemplateProperty,
} from "@miragon/bpmn-modeler-element-template-chooser/types";
import type { HoverCardPosition } from "../positioning";
import type { EnrichedTemplateEntry, Translate } from "../types";
import { HoverCard } from "./HoverCard";

interface TemplateHoverCardProps {
    enrichedEntry: EnrichedTemplateEntry;
    translate: Translate;
    position: HoverCardPosition;
    onHoverChange: (hovered: boolean) => void;
}

/**
 * Renders a fixed-position preview card for a hovered/focused template.
 *
 * Shows the template name, implementation detail, description,
 * documentation link, category, and categorised parameter lists
 * (properties, inputs, outputs).
 *
 * @param props.enrichedEntry The template entry to preview.
 * @param props.position Top/left in viewport coords, maxHeight for clamping.
 * @param props.onHoverChange Called when the mouse enters (keeps it visible) or leaves the card.
 */
export function TemplateHoverCard({
    enrichedEntry,
    translate,
    position,
    onHoverChange,
}: TemplateHoverCardProps) {
    const { entry, presetId } = enrichedEntry;
    const template =
        enrichedEntry.template && applyTemplatePreset(enrichedEntry.template, presetId);

    const implDetail = template ? extractImplementationDetail(template.properties) : undefined;

    const { properties, inputs, outputs } = partitionVisibleProperties(template?.properties ?? []);

    return (
        <HoverCard position={position} onHoverChange={onHoverChange}>
            {/* Header: name + implementation detail */}
            <div class="am-hover-card-header">
                <h4 class="am-hover-card-name">{entry.label}</h4>
                {implDetail && (
                    <div class="am-impl-detail">
                        <span class="am-impl-label">{translate(implDetail.label)}</span>
                        <code class="am-impl-value">{implDetail.value}</code>
                    </div>
                )}
            </div>

            {/* Description + metadata */}
            <div class="am-hover-card-details">
                {entry.description && <p class="am-hover-card-desc">{entry.description}</p>}
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
                        {translate("Documentation")}
                    </a>
                )}
                <div class="am-hover-card-meta">
                    {template?.category && (
                        <span class="am-badge am-badge--category">{template.category.name}</span>
                    )}
                    {template && <span class="am-hover-card-id">{template.id}</span>}
                </div>
            </div>

            {/* Parameter sections */}
            <div class="am-hover-card-params">
                {properties.length > 0 && (
                    <ParameterSection
                        title={translate("Properties")}
                        items={properties}
                        translate={translate}
                    />
                )}
                {inputs.length > 0 && (
                    <ParameterSection
                        title={translate("Input Parameters")}
                        items={inputs}
                        translate={translate}
                    />
                )}
                {outputs.length > 0 && (
                    <ParameterSection
                        title={translate("Output Parameters")}
                        items={outputs}
                        translate={translate}
                    />
                )}
                {properties.length === 0 && inputs.length === 0 && outputs.length === 0 && (
                    <p class="am-hover-card-no-params">{translate("No visible parameters")}</p>
                )}
            </div>
        </HoverCard>
    );
}

/**
 * Renders a labelled section of template properties inside the hover card.
 *
 * @param props.title Section heading text.
 * @param props.items Property items to display.
 */
function ParameterSection({
    title,
    items,
    translate,
}: {
    title: string;
    items: TemplateProperty[];
    translate: Translate;
}) {
    return (
        <div class="am-hover-param-section">
            <h5 class="am-hover-param-title">{title}</h5>
            <ul class="am-hover-param-list">
                {items.map((p, i) => (
                    <li key={i} class="am-hover-param-item">
                        <div class="am-hover-param-header">
                            <span class="am-hover-param-label">
                                {propertyDisplayLabel(p) ?? translate("Unnamed")}
                            </span>
                            <div class="am-hover-param-badges">
                                {p.constraints?.notEmpty && (
                                    <span class="am-badge am-badge--required">
                                        {translate("required")}
                                    </span>
                                )}
                                {p.editable === false && (
                                    <span class="am-badge am-badge--readonly">
                                        {translate("read-only")}
                                    </span>
                                )}
                                {p.optional && (
                                    <span class="am-badge am-badge--optional">
                                        {translate("optional")}
                                    </span>
                                )}
                            </div>
                        </div>
                        {p.description && <p class="am-hover-param-desc">{p.description}</p>}
                        {p.value && <code class="am-hover-param-value">{p.value}</code>}
                    </li>
                ))}
            </ul>
        </div>
    );
}
