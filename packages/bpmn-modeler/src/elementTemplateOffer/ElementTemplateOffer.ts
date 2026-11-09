import type { TemplateOffer } from "@miragon/bpmn-modeler-element-template-chooser";
import { elementTemplateRefOf, type ElementTemplateRef } from "@miragon/bpmn-modeler-types";

import { HiddenTemplates } from "./hiddenTemplates";

/** The members of bpmn-js-element-templates' `elementTemplates` service the offer reads. */
export interface OfferedElementTemplates {
    get(element: unknown): unknown;
    getLatest(templateId: string, options: { deprecated: boolean }): unknown[] | undefined;
    getAll(element: unknown): { isDefault?: unknown }[];
    getDefault(element: unknown): unknown;
}

/**
 * Which element templates new choices may offer. `get`, `getLatest` and
 * `getAll` stay unfiltered: the properties panel reads applied templates
 * through them. `getDefault` is narrowed on the instance, because upstream
 * applies its pick to every new shape and connection.
 */
export class ElementTemplateOffer implements TemplateOffer {
    static $inject = ["elementTemplates"];

    private hidden = HiddenTemplates.NONE;

    constructor(private readonly elementTemplates: OfferedElementTemplates) {
        elementTemplates.getDefault = (element) =>
            elementTemplates
                .getAll(element)
                .find((template) => template.isDefault && this.isOffered(template)) ?? null;
    }

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

    isTemplateIdOfferedTo(element: unknown, templateId: string): boolean {
        const latest = this.latestOf(templateId);
        return this.hidden.offersTo(latest, latest, this.elementTemplates.get(element));
    }

    // Deprecated too: a deprecated latest version still shadows the older ones.
    private latestOf(templateId: string): unknown {
        return this.elementTemplates.getLatest(templateId, { deprecated: true })?.[0];
    }
}
