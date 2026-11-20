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
} from "@miragon/bpmn-modeler-element-template-chooser/templateProperties";
import { TEMPLATE_DETAIL_TEXTS } from "@miragon/bpmn-modeler-element-template-chooser/chooserTexts";
import {
    ParameterSection,
    type ParameterSectionVariant,
} from "@miragon/bpmn-modeler-element-template-chooser/components/ParameterSection";
import type { HoverCardPosition } from "../positioning";
import type { EnrichedTemplateEntry, Translate } from "../types";
import { HoverCard } from "./HoverCard";

const HOVER_CARD_PARAMETERS: ParameterSectionVariant = {
    classPrefix: "am-hover-param",
    badgeClass: "am-badge",
    heading: "h5",
};

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
                        {translate(TEMPLATE_DETAIL_TEXTS.documentation)}
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
                        title={translate(TEMPLATE_DETAIL_TEXTS.properties)}
                        items={properties}
                        translate={translate}
                        variant={HOVER_CARD_PARAMETERS}
                    />
                )}
                {inputs.length > 0 && (
                    <ParameterSection
                        title={translate(TEMPLATE_DETAIL_TEXTS.inputParameters)}
                        items={inputs}
                        translate={translate}
                        variant={HOVER_CARD_PARAMETERS}
                    />
                )}
                {outputs.length > 0 && (
                    <ParameterSection
                        title={translate(TEMPLATE_DETAIL_TEXTS.outputParameters)}
                        items={outputs}
                        translate={translate}
                        variant={HOVER_CARD_PARAMETERS}
                    />
                )}
                {properties.length === 0 && inputs.length === 0 && outputs.length === 0 && (
                    <p class="am-hover-card-no-params">
                        {translate(TEMPLATE_DETAIL_TEXTS.noVisibleParameters)}
                    </p>
                )}
            </div>
        </HoverCard>
    );
}
