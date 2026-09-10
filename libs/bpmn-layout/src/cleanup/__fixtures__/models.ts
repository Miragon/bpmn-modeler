/**
 * BPMN fixtures for the cleanup rules, written to parse cleanly under
 * `bpmn-moddle`. Each one names the schema feature it pins down.
 */

const HEAD =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ` +
    `xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ` +
    `xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ` +
    `xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ` +
    `id="Definitions_1" targetNamespace="http://miragon.io/test">`;

function definitions(body: string): string {
    return `${HEAD}${body}</bpmn:definitions>`;
}

function shape(id: string, x = 100, y = 100, w = 100, h = 80): string {
    return (
        `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">` +
        `<dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}" /></bpmndi:BPMNShape>`
    );
}

function edge(id: string, points: [number, number][]): string {
    const waypoints = points.map(([x, y]) => `<di:waypoint x="${x}" y="${y}" />`).join("");
    return `<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${waypoints}</bpmndi:BPMNEdge>`;
}

function plane(root: string, body: string): string {
    return (
        `<bpmndi:BPMNDiagram id="Diagram_1">` +
        `<bpmndi:BPMNPlane id="Plane_1" bpmnElement="${root}">${body}</bpmndi:BPMNPlane>` +
        `</bpmndi:BPMNDiagram>`
    );
}

/**
 * A data input association whose endpoints are a `bpmn:DataObjectReference`
 * and a `bpmn:DataInput` nested under `bpmn:ioSpecification`.
 *
 * The regression fixture: `sourceRef` here is a *collection*, and the target
 * is reachable only through `ioSpecification`. Reading either the way a
 * sequence flow is read reports this valid association as a dangling flow —
 * and that finding carries a `remove-element` action.
 */
export const DATA_ASSOCIATION_VIA_IO_SPECIFICATION = definitions(
    `<bpmn:process id="Process_1" isExecutable="true">
       <bpmn:dataObjectReference id="DataRef_1" dataObjectRef="DataObject_1" />
       <bpmn:dataObject id="DataObject_1" />
       <bpmn:task id="Task_1">
         <bpmn:ioSpecification id="IoSpec_1">
           <bpmn:dataInput id="DataInput_1" name="in" />
           <bpmn:dataOutput id="DataOutput_1" name="out" />
           <bpmn:inputSet id="InputSet_1"><bpmn:dataInputRefs>DataInput_1</bpmn:dataInputRefs></bpmn:inputSet>
           <bpmn:outputSet id="OutputSet_1"><bpmn:dataOutputRefs>DataOutput_1</bpmn:dataOutputRefs></bpmn:outputSet>
         </bpmn:ioSpecification>
         <bpmn:dataInputAssociation id="DataInputAssoc_1">
           <bpmn:sourceRef>DataRef_1</bpmn:sourceRef>
           <bpmn:targetRef>DataInput_1</bpmn:targetRef>
         </bpmn:dataInputAssociation>
         <bpmn:dataOutputAssociation id="DataOutputAssoc_1">
           <bpmn:sourceRef>DataOutput_1</bpmn:sourceRef>
           <bpmn:targetRef>DataRef_1</bpmn:targetRef>
         </bpmn:dataOutputAssociation>
       </bpmn:task>
     </bpmn:process>` +
        plane(
            "Process_1",
            shape("Task_1") +
                shape("DataRef_1", 300, 100, 36, 50) +
                edge("DataInputAssoc_1", [
                    [300, 125],
                    [200, 140],
                ]) +
                edge("DataOutputAssoc_1", [
                    [200, 150],
                    [300, 150],
                ]),
        ),
);

/**
 * The same association, but its *collection-valued* source names an element
 * nothing declares. moddle drops an unresolved reference while parsing, so
 * after the round trip this is indistinguishable from an association that
 * simply declares no source.
 */
export const DATA_ASSOCIATION_WITH_MISSING_SOURCE = definitions(
    `<bpmn:process id="Process_1" isExecutable="true">
       <bpmn:task id="Task_1">
         <bpmn:ioSpecification id="IoSpec_1">
           <bpmn:dataInput id="DataInput_1" />
           <bpmn:inputSet id="InputSet_1"><bpmn:dataInputRefs>DataInput_1</bpmn:dataInputRefs></bpmn:inputSet>
           <bpmn:outputSet id="OutputSet_1" />
         </bpmn:ioSpecification>
         <bpmn:dataInputAssociation id="DataInputAssoc_1">
           <bpmn:sourceRef>DataRef_gone</bpmn:sourceRef>
           <bpmn:targetRef>DataInput_1</bpmn:targetRef>
         </bpmn:dataInputAssociation>
       </bpmn:task>
     </bpmn:process>` + plane("Process_1", shape("Task_1")),
);

/** The same association with a missing *single-valued* target. */
export const DATA_ASSOCIATION_WITH_MISSING_TARGET = definitions(
    `<bpmn:process id="Process_1" isExecutable="true">
       <bpmn:dataObjectReference id="DataRef_1" dataObjectRef="DataObject_1" />
       <bpmn:dataObject id="DataObject_1" />
       <bpmn:task id="Task_1">
         <bpmn:dataInputAssociation id="DataInputAssoc_1">
           <bpmn:sourceRef>DataRef_1</bpmn:sourceRef>
           <bpmn:targetRef>DataInput_gone</bpmn:targetRef>
         </bpmn:dataInputAssociation>
       </bpmn:task>
     </bpmn:process>` + plane("Process_1", shape("Task_1") + shape("DataRef_1", 300, 100, 36, 50)),
);

/**
 * Lanes, a boundary event and an expanded subprocess — the containment shapes
 * a hand-kept property list is most likely to miss.
 */
export const LANES_BOUNDARY_AND_SUBPROCESS = definitions(
    `<bpmn:process id="Process_1" isExecutable="true">
       <bpmn:laneSet id="LaneSet_1">
         <bpmn:lane id="Lane_1">
           <bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef>
           <bpmn:flowNodeRef>Sub_1</bpmn:flowNodeRef>
           <bpmn:flowNodeRef>Boundary_1</bpmn:flowNodeRef>
           <bpmn:flowNodeRef>End_1</bpmn:flowNodeRef>
         </bpmn:lane>
       </bpmn:laneSet>
       <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
       <bpmn:subProcess id="Sub_1">
         <bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing>
         <bpmn:startEvent id="SubStart_1"><bpmn:outgoing>SubFlow_1</bpmn:outgoing></bpmn:startEvent>
         <bpmn:task id="SubTask_1"><bpmn:incoming>SubFlow_1</bpmn:incoming></bpmn:task>
         <bpmn:sequenceFlow id="SubFlow_1" sourceRef="SubStart_1" targetRef="SubTask_1" />
       </bpmn:subProcess>
       <bpmn:boundaryEvent id="Boundary_1" attachedToRef="Sub_1">
         <bpmn:errorEventDefinition id="ErrorDef_1" />
       </bpmn:boundaryEvent>
       <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
       <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Sub_1" />
       <bpmn:sequenceFlow id="Flow_2" sourceRef="Sub_1" targetRef="End_1" />
     </bpmn:process>` +
        plane(
            "Process_1",
            shape("Lane_1", 100, 80, 600, 250) +
                shape("Start_1", 150, 180, 36, 36) +
                shape("Sub_1", 250, 150, 200, 120) +
                shape("Boundary_1", 430, 250, 36, 36) +
                shape("End_1", 550, 180, 36, 36) +
                edge("Flow_1", [
                    [186, 198],
                    [250, 198],
                ]) +
                edge("Flow_2", [
                    [450, 198],
                    [550, 198],
                ]),
        ),
);

/** A collaboration: participants, a message flow and a text annotation. */
export const COLLABORATION_WITH_MESSAGE_FLOW = definitions(
    `<bpmn:collaboration id="Collaboration_1">
       <bpmn:participant id="Participant_1" processRef="Process_1" />
       <bpmn:participant id="Participant_2" processRef="Process_2" />
       <bpmn:messageFlow id="MessageFlow_1" sourceRef="Task_1" targetRef="Task_2" />
     </bpmn:collaboration>
     <bpmn:process id="Process_1" isExecutable="true">
       <bpmn:task id="Task_1" />
       <bpmn:textAnnotation id="Annotation_1"><bpmn:text>note</bpmn:text></bpmn:textAnnotation>
       <bpmn:association id="Association_1" sourceRef="Task_1" targetRef="Annotation_1" />
     </bpmn:process>
     <bpmn:process id="Process_2" isExecutable="false">
       <bpmn:task id="Task_2" />
     </bpmn:process>` +
        plane(
            "Collaboration_1",
            shape("Participant_1", 100, 80, 400, 200) +
                shape("Participant_2", 100, 320, 400, 200) +
                shape("Task_1", 200, 130, 100, 80) +
                shape("Task_2", 200, 370, 100, 80) +
                shape("Annotation_1", 350, 130, 100, 60) +
                edge("MessageFlow_1", [
                    [250, 210],
                    [250, 370],
                ]) +
                edge("Association_1", [
                    [300, 170],
                    [350, 165],
                ]),
        ),
);

/** Real garbage: a shape for a deleted task, and a flow to a deleted target. */
export const DIAGRAM_WITH_REAL_GARBAGE = definitions(
    `<bpmn:process id="Process_1" isExecutable="true">
       <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
       <bpmn:task id="Task_1"><bpmn:incoming>Flow_1</bpmn:incoming></bpmn:task>
       <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
       <bpmn:sequenceFlow id="Flow_orphan" sourceRef="Task_1" targetRef="Task_deleted" />
     </bpmn:process>` +
        plane(
            "Process_1",
            shape("Start_1", 150, 180, 36, 36) +
                shape("Task_1", 250, 150) +
                shape("Task_deleted", 400, 150) +
                edge("Flow_1", [
                    [186, 198],
                    [250, 198],
                ]),
        ),
);
