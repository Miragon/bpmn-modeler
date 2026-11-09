import { elementTemplateRefOf, type ElementTemplateRef } from "@miragon/bpmn-modeler-types";

import { HiddenTemplates } from "./hiddenTemplates";

/** The members of bpmn-js-element-templates' `elementTemplates` service the offer reads. */
export interface OfferedElementTemplates {
    getLatest(templateId: string, options: { deprecated: boolean }): unknown[] | undefined;
}

/**
 * Which element templates new choices may offer. `get`, `getLatest` and
 * `getAll` stay unfiltered: the properties panel reads applied templates
 * through them.
 */
export class ElementTemplateOffer {
    static $inject = ["elementTemplates"];

    private hidden = HiddenTemplates.NONE;

    constructor(private readonly elementTemplates: OfferedElementTemplates) {}

    /** Replaces the previous set. */
    setHidden(refs: readonly ElementTemplateRef[]): void {
        this.hidden = HiddenTemplates.of(refs);
    }

    isOffered(template: unknown): boolean {
        const ref = elementTemplateRefOf(template);
        return this.hidden.offers(template, ref && this.latestOf(ref.id));
    }

    isTemplateIdOffered(templateId: string): boolean {
        return this.isOffered(this.latestOf(templateId));
    }

    // Deprecated too: a deprecated latest version still shadows the older ones.
    private latestOf(templateId: string): unknown {
        return this.elementTemplates.getLatest(templateId, { deprecated: true })?.[0];
    }
}
