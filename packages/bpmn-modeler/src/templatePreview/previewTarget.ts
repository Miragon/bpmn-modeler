import { isPreviewableElementType } from "@miragon/bpmn-modeler-types";

/** Where a preview puts a template: on a fresh shape, or nowhere yet. */
export type PreviewTarget = { kind: "shape" } | { kind: "unsupported"; type: string };

/** Decided by the type the template creates: its `elementType`, else its first `appliesTo`. */
export function previewTargetOf(template: Record<string, unknown>): PreviewTarget {
    const type = targetType(template);
    return type !== undefined && !isPreviewableElementType(type)
        ? { kind: "unsupported", type }
        : { kind: "shape" };
}

function targetType(template: Record<string, unknown>): string | undefined {
    const { elementType, appliesTo } = template;
    const elementTypeValue =
        typeof elementType === "object" && elementType !== null
            ? (elementType as Record<string, unknown>).value
            : undefined;
    if (typeof elementTypeValue === "string") {
        return elementTypeValue;
    }
    return Array.isArray(appliesTo) && typeof appliesTo[0] === "string" ? appliesTo[0] : undefined;
}
