/** The kinds the review groups elements by. */
export type ElementKind =
    "process" | "participant" | "lane" | "activity" | "event" | "gateway" | "flow" | "other";

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

const KIND_OF_TYPE: Readonly<Record<string, ElementKind>> = {
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

export function elementKindOf(bpmnType: string): ElementKind {
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
const SHARED_PREFIX: Partial<Record<ElementKind, string>> = {
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

const SUFFIX_OF_TYPE: Readonly<Record<string, string>> = {
    ...Object.fromEntries(TASKS.filter((type) => type !== "Task").map((type) => [type, "Task"])),
    IntermediateCatchEvent: "Event",
    IntermediateThrowEvent: "Event",
    ExclusiveGateway: "Gateway",
    ParallelGateway: "Gateway",
    ComplexGateway: "Gateway",
    EventBasedGateway: "Gateway",
};

/** The suffix the Camunda Modeler plugin rename-technical-ids appends; it keeps an inclusive gateway's full name. */
export function idSuffixOf(bpmnType: string): string {
    const type = localType(bpmnType);
    return SUFFIX_OF_TYPE[type] ?? type;
}
