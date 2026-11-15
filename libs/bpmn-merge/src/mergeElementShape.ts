import type { MergeElement } from "./mergeResult";

// A process or collaboration owns the root plane, which counts as drawn, yet no shape shows it.
const PLANE_OWNER_TYPES: ReadonlySet<string> = new Set(["bpmn:Process", "bpmn:Collaboration"]);

/** Whether no canvas draws the element, so a pane lists it instead of marking it. */
export function hasNoShape(element: MergeElement): boolean {
    return (
        PLANE_OWNER_TYPES.has(element.type) ||
        Object.values(element.versions).every((version) => !version?.drawn)
    );
}

/**
 * The sub-process whose plane draws the element, from the first side that
 * draws it, or none on the plane a pane opens with (the process's or the
 * collaboration's) and for an element no canvas draws.
 */
export function subProcessPlaneOf(
    element: MergeElement,
    typeOf: (id: string) => string | undefined,
): string | undefined {
    const plane = [element.versions.current, element.versions.incoming].find(
        (version) => version?.drawn,
    )?.plane;
    if (plane === undefined) return undefined;
    const ownerType = typeOf(plane);
    return ownerType === undefined || PLANE_OWNER_TYPES.has(ownerType) ? undefined : plane;
}
