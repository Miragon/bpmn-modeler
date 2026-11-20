/**
 * Preview panel component that displays detailed information about a
 * selected element template, including its input/output parameters.
 */
import type { ElementTemplate, Translate } from "../types";
import { extractImplementationDetail, partitionVisibleProperties } from "../templateProperties";
import { CHOOSER_TEXTS, TEMPLATE_DETAIL_TEXTS } from "../chooserTexts";
import { ParameterSection, type ParameterSectionVariant } from "./ParameterSection";

const PREVIEW_PARAMETERS: ParameterSectionVariant = {
    classPrefix: "etc-param",
    badgeClass: "etc-badge",
    heading: "h4",
};

interface TemplatePreviewProps {
    template: ElementTemplate;
    translate: Translate;
    onApply: () => void;
}

/**
 * Renders the right-side detail panel for the selected template.
 *
 * Shows the template name, description, documentation link, and
 * categorised parameter lists (inputs, outputs, properties).
 *
 * @param props.template The template to preview.
 * @param props.onApply Callback invoked when the user clicks "Apply Template".
 */
export function TemplatePreview({ template, translate, onApply }: TemplatePreviewProps) {
    const { properties, inputs, outputs } = partitionVisibleProperties(template.properties);

    const implDetail = extractImplementationDetail(template.properties);

    return (
        <div class="etc-preview">
            {/* Scrollable area — name + impl detail stick at top */}
            <div class="etc-preview-scroll">
                {/* Sticky: pinned while scrolling, like a frozen row */}
                <div class="etc-preview-sticky">
                    <h3 class="etc-preview-name">{template.name}</h3>
                    {implDetail && (
                        <div class="etc-impl-detail">
                            <span class="etc-impl-label">{translate(implDetail.label)}</span>
                            <code class="etc-impl-value">{implDetail.value}</code>
                        </div>
                    )}
                </div>

                {/* Collapsible details — scroll away as the user scrolls down */}
                <div class="etc-preview-details">
                    {template.description && <p class="etc-preview-desc">{template.description}</p>}
                    {template.documentationRef && (
                        <a
                            class="etc-preview-docs-link"
                            href={template.documentationRef}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M4.715 6.542L3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.001 1.001 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z" />
                                <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 0 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 0 0-4.243-4.243L6.586 4.672z" />
                            </svg>
                            {translate(TEMPLATE_DETAIL_TEXTS.documentation)}
                        </a>
                    )}
                    <div class="etc-preview-meta">
                        {template.category && (
                            <span class="etc-badge etc-badge--category">
                                {template.category.name}
                            </span>
                        )}
                        <span class="etc-preview-id">{template.id}</span>
                    </div>
                </div>

                {/* Parameter sections */}
                <div class="etc-preview-params">
                    {properties.length > 0 && (
                        <ParameterSection
                            title={translate(TEMPLATE_DETAIL_TEXTS.properties)}
                            items={properties}
                            translate={translate}
                            variant={PREVIEW_PARAMETERS}
                        />
                    )}
                    {inputs.length > 0 && (
                        <ParameterSection
                            title={translate(TEMPLATE_DETAIL_TEXTS.inputParameters)}
                            items={inputs}
                            translate={translate}
                            variant={PREVIEW_PARAMETERS}
                        />
                    )}
                    {outputs.length > 0 && (
                        <ParameterSection
                            title={translate(TEMPLATE_DETAIL_TEXTS.outputParameters)}
                            items={outputs}
                            translate={translate}
                            variant={PREVIEW_PARAMETERS}
                        />
                    )}
                    {properties.length === 0 && inputs.length === 0 && outputs.length === 0 && (
                        <div class="etc-preview-no-params">
                            <p>{translate(TEMPLATE_DETAIL_TEXTS.noVisibleParameters)}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Apply button — pinned at the bottom */}
            <div class="etc-preview-footer">
                <button class="etc-apply-btn" onClick={onApply} type="button">
                    {translate(CHOOSER_TEXTS.apply)}
                </button>
            </div>
        </div>
    );
}
