import {
    type ModdleElement,
    isModdleElement,
    isType,
    moddleElements,
} from "../../moddle/domain/moddleElement";

const TRACKED_TYPES = [
    "bpmn:Participant",
    "bpmn:Collaboration",
    "bpmn:FlowElement",
    "bpmn:SequenceFlow",
    "bpmn:MessageFlow",
    "bpmn:Lane",
    "bpmn:DataAssociation",
];

/**
 * The element whose id the diff reports `element`'s changes under, or
 * `undefined` when the diff does not track it; a change inside an untracked
 * element counts for its nearest tracked ancestor. A copy of bpmn-js-differ's
 * `ChangeHandler._isTracked`, pinned to it by a spec in `upstreamInternals/`.
 */
export function trackedElementOf(element: ModdleElement): ModdleElement | undefined {
    if (isType(element, "bpmn:DataObject")) return undefined;
    if (isType(element, "bpmn:Process")) return poolOf(element);
    return TRACKED_TYPES.some((type) => isType(element, type)) ? element : undefined;
}

export function isTrackedElement(element: ModdleElement): boolean {
    return trackedElementOf(element) !== undefined;
}

/**
 * In a collaboration the diff reports a process's changes under the first
 * participant that references it, and not at all when none does.
 */
function poolOf(process: ModdleElement): ModdleElement | undefined {
    const collaboration = listOf(process.$parent, "rootElements").find((rootElement) =>
        isType(rootElement, "bpmn:Collaboration"),
    );
    if (!collaboration) return process;
    return listOf(collaboration, "participants").find(
        (participant) => participant.processRef === process,
    );
}

function listOf(owner: unknown, property: string): ModdleElement[] {
    return isModdleElement(owner) ? moddleElements(owner[property]) : [];
}
