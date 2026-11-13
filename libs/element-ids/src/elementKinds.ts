import type { ElementIdKind } from "@miragon/bpmn-modeler-types";

const TASKS = [
    "Task",
    "UserTask",
    "ServiceTask",
    "SendTask",
    "ReceiveTask",
    "ManualTask",
    "BusinessRuleTask",
    "ScriptTask",
];

const KIND_OF_TYPE: Readonly<Record<string, ElementIdKind>> = {
    Process: "process",
    Participant: "participant",
    Lane: "lane",
    ...Object.fromEntries(
        [...TASKS, "SubProcess", "Transaction", "AdHocSubProcess", "CallActivity"].map((type) => [
            type,
            "activity",
        ]),
    ),
    ...Object.fromEntries(
        [
            "StartEvent",
            "EndEvent",
            "IntermediateCatchEvent",
            "IntermediateThrowEvent",
            "BoundaryEvent",
        ].map((type) => [type, "event"]),
    ),
    ...Object.fromEntries(
        [
            "ExclusiveGateway",
            "ParallelGateway",
            "InclusiveGateway",
            "ComplexGateway",
            "EventBasedGateway",
        ].map((type) => [type, "gateway"]),
    ),
    SequenceFlow: "flow",
    MessageFlow: "flow",
};

/** `bpmn:UserTask` → `UserTask`, the way bpmn-js strips the prefix. */
export function localType(bpmnType: string): string {
    return bpmnType.replace(/^[^:]*:/, "");
}

export function elementKindOf(bpmnType: string): ElementIdKind {
    return KIND_OF_TYPE[localType(bpmnType)] ?? "other";
}

/**
 * A process ID is the deployment key that deployments, call activities and
 * tests name, so the review leaves it unchecked and it never follows a name.
 */
export function keepsIdUnlessAsked(bpmnType: string): boolean {
    return elementKindOf(bpmnType) === "process";
}

// bpmn-js names a new ID after the element's kind since v7, and after its type before and in templates.
const SHARED_PREFIX: Partial<Record<ElementIdKind, string>> = {
    activity: "Activity",
    event: "Event",
    gateway: "Gateway",
    flow: "Flow",
};

/**
 * The prefixes bpmn-js and diagram templates give an element of this type. A
 * replaced element keeps its ID, so a user task may still carry `Task_1hcentk`:
 * every type name of the kind counts.
 */
export function defaultIdPrefixesOf(bpmnType: string): string[] {
    const kind = elementKindOf(bpmnType);
    const shared = SHARED_PREFIX[kind];
    if (shared === undefined) {
        return [localType(bpmnType)];
    }
    return [shared, ...Object.keys(KIND_OF_TYPE).filter((type) => KIND_OF_TYPE[type] === kind)];
}
