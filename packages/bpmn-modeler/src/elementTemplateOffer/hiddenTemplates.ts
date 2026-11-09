import {
    elementTemplateRefKey,
    elementTemplateRefOf,
    isSameElementTemplateRef,
    type ElementTemplateRef,
} from "@miragon/bpmn-modeler-types";

/** The templates kept out of new choices, matched by id and version as upstream indexes them. */
export class HiddenTemplates {
    static readonly NONE = new HiddenTemplates(new Set());

    static of(refs: readonly ElementTemplateRef[]): HiddenTemplates {
        return new HiddenTemplates(new Set(refs.map(elementTemplateRefKey)));
    }

    private constructor(private readonly hiddenKeys: ReadonlySet<string>) {}

    /**
     * Offered unless it, or the latest version of its id, is hidden: no older
     * version takes a hidden latest one's place. A template without an id is
     * always offered.
     */
    offers(template: unknown, latestOfItsId: unknown): boolean {
        return !this.hides(template) && !this.hides(latestOfItsId);
    }

    /**
     * Also offered to the element that applies it as the latest version of
     * its id: re-applying it changes nothing but its preset.
     */
    offersTo(template: unknown, latestOfItsId: unknown, appliedTemplate: unknown): boolean {
        return (
            this.offers(template, latestOfItsId) ||
            (isSameTemplate(template, appliedTemplate) && isSameTemplate(template, latestOfItsId))
        );
    }

    private hides(template: unknown): boolean {
        const ref = elementTemplateRefOf(template);
        return ref !== undefined && this.hiddenKeys.has(elementTemplateRefKey(ref));
    }
}

function isSameTemplate(template: unknown, other: unknown): boolean {
    const ref = elementTemplateRefOf(template);
    const otherRef = elementTemplateRefOf(other);
    return ref !== undefined && otherRef !== undefined && isSameElementTemplateRef(ref, otherRef);
}
