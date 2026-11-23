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
    return ownerType === undefined || ownsRootPlane(ownerType) ? undefined : plane;
}

/**
 * Whether two sides draw an element on one plane of the result: the same
 * plane, or two root planes the result keeps, which one side names after its
 * collaboration and the other after its process when only one wraps the
 * process in a pool. `typeInResult` knows no element the result drops.
 */
export function onOnePlane(
    first: string | undefined,
    second: string | undefined,
    typeInResult: (id: string) => string | undefined,
): boolean {
    if (first === undefined || second === undefined || first === second) return first === second;
    return ownsRootPlane(typeInResult(first)) && ownsRootPlane(typeInResult(second));
}

function ownsRootPlane(type: string | undefined): boolean {
    return type !== undefined && PLANE_OWNER_TYPES.has(type);
}
