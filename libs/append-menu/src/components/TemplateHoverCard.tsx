/**
 * Floating hover card that displays detailed template information.
 *
 * Appears to the right of the template panel when the user hovers or
 * focuses a template card, overlaying the BPMN palette.  Structured
 * similarly to the TemplatePreview in element-template-chooser.
 */
import type { EnrichedTemplateEntry, TemplateProperty } from "../types";
import { classifyBinding, extractImplementationDetail } from "../types";

interface TemplateHoverCardProps {
    enrichedEntry: EnrichedTemplateEntry;
    style: { top: number; left: number; maxHeight: number };
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}

/**
 * Renders a fixed-position preview card for a hovered/focused template.
 *
 * Shows the template name, implementation detail, description,
 * documentation link, category, and categorised parameter lists
 * (properties, inputs, outputs).
 *
 * @param props.enrichedEntry The template entry to preview.
 * @param props.style Positioning: top/left in viewport coords, maxHeight for clamping.
 * @param props.onMouseEnter Called when the mouse enters the card (keeps it visible).
 * @param props.onMouseLeave Called when the mouse leaves the card (triggers hide delay).
 */
export function TemplateHoverCard({
    enrichedEntry,
    style,
    onMouseEnter,
    onMouseLeave,
}: TemplateHoverCardProps) {
    const { entry, template } = enrichedEntry;

    const implDetail = template ? extractImplementationDetail(template.properties) : undefined;

    const inputs =
        template?.properties.filter(
            (p) => classifyBinding(p.binding) === "input" && p.type !== "Hidden",
        ) ?? [];
    const outputs =
        template?.properties.filter(
            (p) => classifyBinding(p.binding) === "output" && p.type !== "Hidden",
        ) ?? [];
    const props =
        template?.properties.filter(
            (p) => classifyBinding(p.binding) === "property" && p.type !== "Hidden",
        ) ?? [];

    return (
        <div
            class="am-hover-card"
            style={{
                position: "fixed",
                top: `${style.top}px`,
                left: `${style.left}px`,
                maxHeight: `${style.maxHeight}px`,
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div class="am-hover-card-scroll">
                {/* Header: name + implementation detail */}
                <div class="am-hover-card-header">
                    <h4 class="am-hover-card-name">{entry.label}</h4>
                    {implDetail && (
                        <div class="am-impl-detail">
                            <span class="am-impl-label">{implDetail.label}</span>
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
                            Documentation
                        </a>
                    )}
                    <div class="am-hover-card-meta">
                        {template?.category && (
                            <span class="am-badge am-badge--category">
                                {template.category.name}
                            </span>
                        )}
                        {template && <span class="am-hover-card-id">{template.id}</span>}
                    </div>
                </div>

                {/* Parameter sections */}
                <div class="am-hover-card-params">
                    {props.length > 0 && <ParameterSection title="Properties" items={props} />}
                    {inputs.length > 0 && (
                        <ParameterSection title="Input Parameters" items={inputs} />
                    )}
                    {outputs.length > 0 && (
                        <ParameterSection title="Output Parameters" items={outputs} />
                    )}
                    {props.length === 0 && inputs.length === 0 && outputs.length === 0 && (
                        <p class="am-hover-card-no-params">No visible parameters</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Renders a labelled section of template properties inside the hover card.
 *
 * @param props.title Section heading text.
 * @param props.items Property items to display.
 */
function ParameterSection({ title, items }: { title: string; items: TemplateProperty[] }) {
    return (
        <div class="am-hover-param-section">
            <h5 class="am-hover-param-title">{title}</h5>
            <ul class="am-hover-param-list">
                {items.map((p, i) => (
                    <li key={i} class="am-hover-param-item">
                        <div class="am-hover-param-header">
                            <span class="am-hover-param-label">
                                {p.label ?? p.binding.name ?? p.binding.key ?? "Unnamed"}
                            </span>
                            <div class="am-hover-param-badges">
                                {p.constraints?.notEmpty && (
                                    <span class="am-badge am-badge--required">required</span>
                                )}
                                {p.editable === false && (
                                    <span class="am-badge am-badge--readonly">read-only</span>
                                )}
                                {p.optional && (
                                    <span class="am-badge am-badge--optional">optional</span>
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
