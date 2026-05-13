/**
 * Preview panel component that displays detailed information about a
 * selected element template, including its input/output parameters.
 */
import type { ElementTemplate, TemplateProperty } from "../types";
import { classifyBinding, extractImplementationDetail } from "../types";

interface TemplatePreviewProps {
    template: ElementTemplate;
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
export function TemplatePreview({ template, onApply }: TemplatePreviewProps) {
    const inputs = template.properties.filter(
        (p) => classifyBinding(p.binding) === "input" && p.type !== "Hidden",
    );
    const outputs = template.properties.filter(
        (p) => classifyBinding(p.binding) === "output" && p.type !== "Hidden",
    );
    const props = template.properties.filter(
        (p) => classifyBinding(p.binding) === "property" && p.type !== "Hidden",
    );

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
                            <span class="etc-impl-label">{implDetail.label}</span>
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
                            Documentation
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
                    {props.length > 0 && <ParameterSection title="Properties" items={props} />}
                    {inputs.length > 0 && (
                        <ParameterSection title="Input Parameters" items={inputs} />
                    )}
                    {outputs.length > 0 && (
                        <ParameterSection title="Output Parameters" items={outputs} />
                    )}
                    {props.length === 0 && inputs.length === 0 && outputs.length === 0 && (
                        <div class="etc-preview-no-params">
                            <p>No visible parameters</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Apply button — pinned at the bottom */}
            <div class="etc-preview-footer">
                <button class="etc-apply-btn" onClick={onApply} type="button">
                    Apply Template
                </button>
            </div>
        </div>
    );
}

/**
 * Renders a labelled section of template properties.
 *
 * @param props.title Section heading text.
 * @param props.items Property items to display.
 */
function ParameterSection({ title, items }: { title: string; items: TemplateProperty[] }) {
    return (
        <div class="etc-param-section">
            <h4 class="etc-param-title">{title}</h4>
            <ul class="etc-param-list">
                {items.map((p, i) => (
                    <li key={i} class="etc-param-item">
                        <div class="etc-param-header">
                            <span class="etc-param-label">
                                {p.label ?? p.binding.name ?? p.binding.key ?? "Unnamed"}
                            </span>
                            <div class="etc-param-badges">
                                {p.constraints?.notEmpty && (
                                    <span class="etc-badge etc-badge--required">required</span>
                                )}
                                {p.editable === false && (
                                    <span class="etc-badge etc-badge--readonly">read-only</span>
                                )}
                                {p.optional && (
                                    <span class="etc-badge etc-badge--optional">optional</span>
                                )}
                            </div>
                        </div>
                        {p.description && <p class="etc-param-desc">{p.description}</p>}
                        {p.value && <code class="etc-param-value">{p.value}</code>}
                    </li>
                ))}
            </ul>
        </div>
    );
}
