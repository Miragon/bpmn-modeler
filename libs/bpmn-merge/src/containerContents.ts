import { type ModdleElement, isType } from "@miragon/bpmn-modeler-diff";

/** A sub-process, of any kind, and a lane draw their contents inside their own shape; a process, a pool and an activity do not. */
export function isEnclosingContainer(element: ModdleElement | undefined): boolean {
    return (
        element !== undefined &&
        (isType(element, "bpmn:SubProcess") || isType(element, "bpmn:Lane"))
    );
}

/** The sub-process whose plane, or whose shape's plane, draws the element; none for an element of a process. */
export function enclosingSubProcessOf(element: ModdleElement | undefined): string | undefined {
    for (
        let container = element?.$parent as ModdleElement | undefined;
        container !== undefined && !isType(container, "bpmn:Process");
        container = container.$parent as ModdleElement | undefined
    ) {
        if (isType(container, "bpmn:SubProcess")) return container.id;
    }
    return undefined;
}

/**
 * The plane a sub-process's contents lie on, as bpmn-js reads them: its own
 * plane when it has one and its shape is not expanded, otherwise the plane
 * its shape lies on. The build places the contents by it and the check
 * refuses a file that does not follow it.
 */
export function contentsPlaneOf<Plane, Shape extends { readonly element: ModdleElement }>(
    ownPlane: Plane | undefined,
    shape: Shape | undefined,
    planeOfShape: (shape: Shape) => Plane | undefined,
): Plane | undefined {
    if (shape === undefined || (ownPlane !== undefined && shape.element.isExpanded !== true)) {
        return ownPlane;
    }
    return planeOfShape(shape);
}
