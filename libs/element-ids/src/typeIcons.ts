import { localType } from "./elementKinds";

// bpmn-js ships the bpmn-font on every editable surface; the review reuses its glyphs.
const ICON_OF_TYPE: Readonly<Record<string, string>> = {
    Process: "bpmn-icon-participant",
    Participant: "bpmn-icon-participant",
    Lane: "bpmn-icon-lane",
    Task: "bpmn-icon-task",
    UserTask: "bpmn-icon-user-task",
    ServiceTask: "bpmn-icon-service-task",
    SendTask: "bpmn-icon-send-task",
    ReceiveTask: "bpmn-icon-receive-task",
    ManualTask: "bpmn-icon-manual-task",
    BusinessRuleTask: "bpmn-icon-business-rule-task",
    ScriptTask: "bpmn-icon-script-task",
    CallActivity: "bpmn-icon-call-activity",
    SubProcess: "bpmn-icon-subprocess-collapsed",
    Transaction: "bpmn-icon-transaction",
    AdHocSubProcess: "bpmn-icon-ad-hoc-subprocess-collapsed",
    StartEvent: "bpmn-icon-start-event-none",
    EndEvent: "bpmn-icon-end-event-none",
    IntermediateCatchEvent: "bpmn-icon-intermediate-event-none",
    IntermediateThrowEvent: "bpmn-icon-intermediate-event-none",
    BoundaryEvent: "bpmn-icon-intermediate-event-none",
    ExclusiveGateway: "bpmn-icon-gateway-xor",
    ParallelGateway: "bpmn-icon-gateway-parallel",
    InclusiveGateway: "bpmn-icon-gateway-or",
    ComplexGateway: "bpmn-icon-gateway-complex",
    EventBasedGateway: "bpmn-icon-gateway-eventbased",
    SequenceFlow: "bpmn-icon-connection",
    MessageFlow: "bpmn-icon-connection-multi",
    DataObjectReference: "bpmn-icon-data-object",
    DataStoreReference: "bpmn-icon-data-store",
};

export function iconClassOf(bpmnType: string): string {
    return ICON_OF_TYPE[localType(bpmnType)] ?? "bpmn-icon-task";
}
