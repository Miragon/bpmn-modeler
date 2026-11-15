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
