/** The names one version of the order process gives its process and tasks; absent means none. */
export interface OrderProcessNames {
    readonly process?: string;
    readonly check?: string;
    readonly pack?: string;
    /** The flow from the check to the pack task. */
    readonly packFlow?: string;
    /** This version deleted the pack task with its two flows. */
    readonly withoutPack?: boolean;
}

const nameAttribute = (name: string | undefined) => (name === undefined ? "" : ` name="${name}"`);

/**
 * A drawn process, Start_1 → Task_Check → Task_Pack → End_1, whose versions
 * differ only in the names given, so a merge of three of them classifies each
 * task and the process (which has no shape) by those names alone.
 */
export function orderProcessXml(names: OrderProcessNames = {}): string {
    const pack = !names.withoutPack;
    const packOnly = (xml: string) => (pack ? xml : "");
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1"${nameAttribute(names.process)} isExecutable="false">
    <bpmn:startEvent id="Start_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_Check"${nameAttribute(names.check)}>
      <bpmn:incoming>Flow_1</bpmn:incoming>
${packOnly("      <bpmn:outgoing>Flow_2</bpmn:outgoing>\n")}    </bpmn:task>
${packOnly(`    <bpmn:task id="Task_Pack"${nameAttribute(names.pack)}>
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
`)}    <bpmn:endEvent id="End_1">
${packOnly("      <bpmn:incoming>Flow_3</bpmn:incoming>\n")}    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_Check" />
${packOnly(`    <bpmn:sequenceFlow id="Flow_2"${nameAttribute(names.packFlow)} sourceRef="Task_Check" targetRef="Task_Pack" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_Pack" targetRef="End_1" />
`)}  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
        <dc:Bounds x="152" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Check_di" bpmnElement="Task_Check">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
${packOnly(`      <bpmndi:BPMNShape id="Task_Pack_di" bpmnElement="Task_Pack">
        <dc:Bounds x="400" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
`)}      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1">
        <dc:Bounds x="562" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="120" />
        <di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
${packOnly(`      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="120" />
        <di:waypoint x="400" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="500" y="120" />
        <di:waypoint x="562" y="120" />
      </bpmndi:BPMNEdge>
`)}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

/**
 * Git's three stages of a conflicted order process: current renamed the
 * check (taken from current), both renamed the pack task differently and
 * both named the process differently (two conflicts, one without a shape).
 */
export const ORDER_MERGE_STAGES = {
    base: orderProcessXml(),
    current: orderProcessXml({ process: "Order A", check: "Check order now", pack: "Pack parcel" }),
    incoming: orderProcessXml({ process: "Order B", pack: "Pack box" }),
} as const;

/** The same file conflicted again after the first conflict was resolved. */
export const ORDER_MERGE_STAGES_AGAIN = {
    base: orderProcessXml({ process: "Order A" }),
    current: orderProcessXml({ process: "Order A", pack: "Pack crate" }),
    incoming: orderProcessXml({ process: "Order A", pack: "Pack bag" }),
} as const;

/**
 * Current deleted the pack task with the flows into and out of it; incoming
 * kept it as it was, and renamed the flow into it in the blocked variant.
 */
export const ORDER_REMOVAL_STAGES = {
    base: orderProcessXml(),
    current: orderProcessXml({ withoutPack: true }),
    incoming: orderProcessXml({ check: "Check order" }),
} as const;

/** As {@link ORDER_REMOVAL_STAGES}, with incoming renaming the flow current removed: a conflict on it. */
export const ORDER_REMOVED_FLOW_STAGES = {
    ...ORDER_REMOVAL_STAGES,
    incoming: orderProcessXml({ packFlow: "Ready to pack" }),
} as const;

/** The names one version gives the two tasks inside the packing sub-process. */
export interface PackingNames {
    readonly wrap?: string;
    readonly label?: string;
}

/** A process whose expanded sub-process Sub_Packing holds Task_Wrap and Task_Label. */
export function packingProcessXml(names: PackingNames = {}): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:subProcess id="Sub_Packing" name="Packing">
      <bpmn:task id="Task_Wrap"${nameAttribute(names.wrap)} />
      <bpmn:task id="Task_Label"${nameAttribute(names.label)} />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Sub_Packing_di" bpmnElement="Sub_Packing" isExpanded="true">
        <dc:Bounds x="100" y="60" width="400" height="200" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Wrap_di" bpmnElement="Task_Wrap">
        <dc:Bounds x="140" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Label_di" bpmnElement="Task_Label">
        <dc:Bounds x="320" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

/** Both sides renamed both tasks inside the sub-process differently: two conflicts inside it. */
export const PACKING_MERGE_STAGES = {
    base: packingProcessXml(),
    current: packingProcessXml({ wrap: "Wrap in paper", label: "Print label" }),
    incoming: packingProcessXml({ wrap: "Wrap in foil", label: "Write label" }),
} as const;

/** What Git LFS hands over for a stage: its pointer file, not BPMN. */
export const LFS_POINTER_TEXT = `version https://git-lfs.github.com/spec/v1
oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
size 12345
`;
