import {
    type ModdleElement,
    idOf,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff/domain";

export interface ConnectionEnds {
    readonly source?: string;
    readonly target?: string;
}

/** An edge no plane draws both ends of, which the build leaves out of the drawing. */
export interface UndrawnEdge {
    readonly id: string;
    readonly ends: ConnectionEnds;
}

const SOURCE_TO_TARGET_TYPES = ["bpmn:SequenceFlow", "bpmn:MessageFlow", "bpmn:Association"];

/**
 * The elements bpmn-js joins a connection's edge to: a data input association runs from its
 * first source into the activity holding it, a data output association out of that activity.
 * None for an element no edge draws.
 */
export function connectionEndsOf(
    element: ModdleElement,
    holder: unknown = element.$parent,
): ConnectionEnds | undefined {
    if (isType(element, "bpmn:DataInputAssociation")) {
        return endsOf(moddleElements(element.sourceRef)[0], holder);
    }
    if (isType(element, "bpmn:DataOutputAssociation")) return endsOf(holder, element.targetRef);
    if (SOURCE_TO_TARGET_TYPES.some((type) => isType(element, type))) {
        return endsOf(element.sourceRef, element.targetRef);
    }
    return undefined;
}

/**
 * The plane an edge lies on, as bpmn-js can draw it: the one that draws both its ends; none
 * when no plane does. The build places edges by it and the check refuses a file that does not
 * follow it.
 */
export function edgePlaneOf<Plane>(
    { source, target }: ConnectionEnds,
    planeOfEnd: (id: string) => Plane | undefined,
): Plane | undefined {
    if (source === undefined || target === undefined) return undefined;
    const plane = planeOfEnd(source);
    return plane !== undefined && plane === planeOfEnd(target) ? plane : undefined;
}

function endsOf(source: unknown, target: unknown): ConnectionEnds {
    const sourceId = idOf(source);
    const targetId = idOf(target);
    return {
        ...(sourceId === undefined ? {} : { source: sourceId }),
        ...(targetId === undefined ? {} : { target: targetId }),
    };
}
