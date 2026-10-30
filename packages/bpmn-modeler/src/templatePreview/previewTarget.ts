/** Where a preview puts a template: on a fresh shape, or nowhere yet. */
export type PreviewTarget = { kind: "shape" } | { kind: "unsupported"; type: string };

// Selecting a templated process or flow throws inside create-append-anything's
// remove-template replace entry, so these cannot be shown until that is fixed.
const UNSUPPORTED_TYPES = new Set(["bpmn:Process", "bpmn:SequenceFlow"]);

/** Decided by the type the template creates: its `elementType`, else its first `appliesTo`. */
export function previewTargetOf(template: Record<string, unknown>): PreviewTarget {
    const type = targetType(template);
    return type !== undefined && UNSUPPORTED_TYPES.has(type)
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
