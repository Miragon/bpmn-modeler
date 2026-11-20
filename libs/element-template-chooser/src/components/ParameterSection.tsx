/**
 * A labelled list of template properties, shared by the chooser's preview and
 * the append menu's hover card; each styles it under its own class names.
 */
import { TEMPLATE_DETAIL_TEXTS } from "../chooserTexts";
import {
    propertyDisplayLabel,
    templatePropertyBadges,
    templatePropertyDisplayText,
} from "../templateProperties";
import type { TemplateProperty, TemplatePropertyBadge, Translate } from "../types";

/** The class names and heading level a parameter section renders with. */
export interface ParameterSectionVariant {
    /** Prefix of the section's own classes, such as `etc-param` for `etc-param-item`. */
    classPrefix: string;
    /** Base class of a badge, such as `etc-badge` for `etc-badge etc-badge--required`. */
    badgeClass: string;
    heading: "h4" | "h5";
}

const BADGE_MODIFIERS: Record<TemplatePropertyBadge, string> = {
    required: "required",
    readOnly: "readonly",
    optional: "optional",
};

interface ParameterSectionProps {
    title: string;
    items: TemplateProperty[];
    translate: Translate;
    variant: ParameterSectionVariant;
}

export function ParameterSection({ title, items, translate, variant }: ParameterSectionProps) {
    const { classPrefix, badgeClass, heading: Heading } = variant;
    return (
        <div class={`${classPrefix}-section`}>
            <Heading class={`${classPrefix}-title`}>{title}</Heading>
            <ul class={`${classPrefix}-list`}>
                {items.map((property, index) => {
                    const displayText = templatePropertyDisplayText(property);
                    return (
                        <li key={index} class={`${classPrefix}-item`}>
                            <div class={`${classPrefix}-header`}>
                                <span class={`${classPrefix}-label`}>
                                    {propertyDisplayLabel(property) ??
                                        translate(TEMPLATE_DETAIL_TEXTS.unnamedProperty)}
                                </span>
                                <div class={`${classPrefix}-badges`}>
                                    {templatePropertyBadges(property).map((badge) => (
                                        <span
                                            key={badge}
                                            class={`${badgeClass} ${badgeClass}--${BADGE_MODIFIERS[badge]}`}
                                        >
                                            {translate(TEMPLATE_DETAIL_TEXTS[badge])}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            {property.description && (
                                <p class={`${classPrefix}-desc`}>{property.description}</p>
                            )}
                            {displayText && (
                                <code class={`${classPrefix}-value`}>{displayText}</code>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
