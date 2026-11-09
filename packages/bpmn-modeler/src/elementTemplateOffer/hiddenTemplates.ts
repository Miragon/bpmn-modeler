import {
    elementTemplateRefKey,
    elementTemplateRefOf,
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

    private hides(template: unknown): boolean {
        const ref = elementTemplateRefOf(template);
        return ref !== undefined && this.hiddenKeys.has(elementTemplateRefKey(ref));
    }
}
