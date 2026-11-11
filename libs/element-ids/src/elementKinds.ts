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
