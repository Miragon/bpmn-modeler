import type { ElementTemplate } from "../types";

export function template(
    partial: Partial<ElementTemplate> & Pick<ElementTemplate, "id" | "name">,
): ElementTemplate {
    return {
        appliesTo: ["bpmn:ServiceTask"],
        properties: [],
        ...partial,
    };
}
