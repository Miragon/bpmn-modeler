import {
    type ModdleElement,
    idOf,
    idsOf,
    isType,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";

/**
 * Sets what the modeler derives from the rest: each flow node's `incoming`
 * and `outgoing` from the sequence flows, each lane's `flowNodeRef` from the
 * lane decisions. The order an element already has is kept and the missing
 * ones are appended in document order, as bpmn-js appends on reconnect. An
 * activity's `boundaryEventRefs` only loses what is no longer attached to it:
 * bpmn-js never writes it, so appending would rewrite files that lack it.
 */
export function rebuildDerivedReferences(
    definitions: ModdleElement,
    laneMembers: ReadonlyMap<string, ReadonlySet<string>>,
): void {
    const { flowElements, flowNodes, sequenceFlows, lanes, activities } =
        semanticElementsOf(definitions);
    const flowsByTarget = flowsByTargetOf(sequenceFlows);
    const flowsBySource = flowsBySourceOf(sequenceFlows);
    for (const node of flowNodes) {
        setInOrder(node, "incoming", flowsByTarget.get(node.id ?? "") ?? []);
        setInOrder(node, "outgoing", flowsBySource.get(node.id ?? "") ?? []);
    }
    const documentIndex = new Map(flowElements.map((element, index) => [element.id, index]));
    const flowElementsById = new Map(flowElements.map((element) => [element.id, element]));
    for (const lane of lanes) {
        const members = [...(laneMembers.get(lane.id ?? "") ?? [])]
            .map((id) => flowElementsById.get(id))
            .filter((member): member is ModdleElement => member !== undefined)
            .sort((left, right) => documentIndex.get(left.id)! - documentIndex.get(right.id)!);
        setInOrder(lane, "flowNodeRef", members);
    }
    const flowNodesById = new Map(flowNodes.map((node) => [node.id, node]));
    for (const activity of activities) {
        const listed = idsOf(activity.boundaryEventRefs);
        if (listed.length === 0) continue;
        activity.boundaryEventRefs = listed
            .map((id) => flowNodesById.get(id))
            .filter(
                (node): node is ModdleElement =>
                    node !== undefined && isAttachedBoundaryEvent(node, activity),
            );
    }
}

export function isAttachedBoundaryEvent(element: ModdleElement, activity: ModdleElement): boolean {
    return isType(element, "bpmn:BoundaryEvent") && idOf(element.attachedToRef) === activity.id;
}

/** The sequence flows by the id of their source, in document order. */
export function flowsBySourceOf(
    sequenceFlows: readonly ModdleElement[],
): Map<string, ModdleElement[]> {
    return flowsByEnd(sequenceFlows, (flow) => flow.sourceRef);
}

/** The sequence flows by the id of their target, in document order. */
export function flowsByTargetOf(
    sequenceFlows: readonly ModdleElement[],
): Map<string, ModdleElement[]> {
    return flowsByEnd(sequenceFlows, (flow) => flow.targetRef);
}

function flowsByEnd(
    sequenceFlows: readonly ModdleElement[],
    endOf: (flow: ModdleElement) => unknown,
): Map<string, ModdleElement[]> {
    const flows = new Map<string, ModdleElement[]>();
    for (const flow of sequenceFlows) {
        const endId = idOf(endOf(flow));
        if (endId === undefined) continue;
        const flowsAtEnd = flows.get(endId) ?? [];
        flowsAtEnd.push(flow);
        flows.set(endId, flowsAtEnd);
    }
    return flows;
}

/** bpmn-js lists data object and data store references in a lane too, so lane members are flow elements. */
export function semanticElementsOf(definitions: ModdleElement) {
    const flowElements: ModdleElement[] = [];
    const flowNodes: ModdleElement[] = [];
    const sequenceFlows: ModdleElement[] = [];
    const lanes: ModdleElement[] = [];
    const activities: ModdleElement[] = [];
    walkContainment(definitions, (element) => {
        if (isType(element, "bpmn:FlowElement")) flowElements.push(element);
        if (isType(element, "bpmn:Activity")) activities.push(element);
        if (isType(element, "bpmn:FlowNode")) flowNodes.push(element);
        else if (isType(element, "bpmn:SequenceFlow")) sequenceFlows.push(element);
        else if (isType(element, "bpmn:Lane")) lanes.push(element);
    });
    return { flowElements, flowNodes, sequenceFlows, lanes, activities };
}

function setInOrder(
    element: ModdleElement,
    property: string,
    expected: readonly ModdleElement[],
): void {
    const existing = idsOf(element[property]);
    if (expected.length === 0 && existing.length === 0) return;
    const position = (candidate: ModdleElement) => {
        const index = existing.indexOf(candidate.id ?? "");
        return index === -1 ? existing.length : index;
    };
    element[property] = expected
        .map((candidate, documentIndex) => ({ candidate, documentIndex }))
        .sort(
            (left, right) =>
                position(left.candidate) - position(right.candidate) ||
                left.documentIndex - right.documentIndex,
        )
        .map(({ candidate }) => candidate);
}
