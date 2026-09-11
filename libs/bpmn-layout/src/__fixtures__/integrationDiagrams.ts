/**
 * Diagrams for the real-modeler integration tests: valid BPMN with DI that is
 * deliberately untidy, so formatting has something to change.
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

/**
 * Lanes, a boundary event, an expanded subprocess and labelled sequence flows
 * — the shapes the applier has to keep intact — in one diagram, with every
 * shape scattered.
 */
export const MESSY_LANES_BOUNDARY_SUBPROCESS = definitions(
    `<bpmn:process id="Process_1" isExecutable="true">
       <bpmn:laneSet id="LaneSet_1">
         <bpmn:lane id="Lane_1" name="Team">
           <bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef>
           <bpmn:flowNodeRef>Gateway_1</bpmn:flowNodeRef>
           <bpmn:flowNodeRef>Sub_1</bpmn:flowNodeRef>
           <bpmn:flowNodeRef>Boundary_1</bpmn:flowNodeRef>
           <bpmn:flowNodeRef>Task_after</bpmn:flowNodeRef>
           <bpmn:flowNodeRef>End_1</bpmn:flowNodeRef>
         </bpmn:lane>
       </bpmn:laneSet>
       <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
       <bpmn:exclusiveGateway id="Gateway_1">
         <bpmn:incoming>Flow_1</bpmn:incoming>
         <bpmn:outgoing>Flow_yes</bpmn:outgoing><bpmn:outgoing>Flow_no</bpmn:outgoing>
       </bpmn:exclusiveGateway>
       <bpmn:subProcess id="Sub_1" name="Handle">
         <bpmn:incoming>Flow_yes</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing>
         <bpmn:startEvent id="SubStart_1"><bpmn:outgoing>SubFlow_1</bpmn:outgoing></bpmn:startEvent>
         <bpmn:task id="SubTask_1"><bpmn:incoming>SubFlow_1</bpmn:incoming></bpmn:task>
         <bpmn:sequenceFlow id="SubFlow_1" sourceRef="SubStart_1" targetRef="SubTask_1" />
       </bpmn:subProcess>
       <bpmn:boundaryEvent id="Boundary_1" attachedToRef="Sub_1">
         <bpmn:outgoing>Flow_err</bpmn:outgoing>
         <bpmn:errorEventDefinition id="ErrorDef_1" />
       </bpmn:boundaryEvent>
       <bpmn:task id="Task_after" name="Recover">
         <bpmn:incoming>Flow_err</bpmn:incoming><bpmn:incoming>Flow_no</bpmn:incoming>
         <bpmn:outgoing>Flow_4</bpmn:outgoing>
       </bpmn:task>
       <bpmn:endEvent id="End_1">
         <bpmn:incoming>Flow_3</bpmn:incoming><bpmn:incoming>Flow_4</bpmn:incoming>
       </bpmn:endEvent>
       <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Gateway_1" />
       <bpmn:sequenceFlow id="Flow_yes" name="yes" sourceRef="Gateway_1" targetRef="Sub_1" />
       <bpmn:sequenceFlow id="Flow_no" name="no" sourceRef="Gateway_1" targetRef="Task_after" />
       <bpmn:sequenceFlow id="Flow_err" sourceRef="Boundary_1" targetRef="Task_after" />
       <bpmn:sequenceFlow id="Flow_3" sourceRef="Sub_1" targetRef="End_1" />
       <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_after" targetRef="End_1" />
     </bpmn:process>
     <bpmndi:BPMNDiagram id="Diagram_1">
       <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
         <bpmndi:BPMNShape id="Lane_1_di" bpmnElement="Lane_1" isHorizontal="true">
           <dc:Bounds x="160" y="80" width="900" height="400" />
         </bpmndi:BPMNShape>
         <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
           <dc:Bounds x="900" y="420" width="36" height="36" />
         </bpmndi:BPMNShape>
         <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1" isMarkerVisible="true">
           <dc:Bounds x="300" y="120" width="50" height="50" />
         </bpmndi:BPMNShape>
         <bpmndi:BPMNShape id="Sub_1_di" bpmnElement="Sub_1" isExpanded="true">
           <dc:Bounds x="600" y="200" width="350" height="200" />
         </bpmndi:BPMNShape>
         <bpmndi:BPMNShape id="SubStart_1_di" bpmnElement="SubStart_1">
           <dc:Bounds x="640" y="280" width="36" height="36" />
         </bpmndi:BPMNShape>
         <bpmndi:BPMNShape id="SubTask_1_di" bpmnElement="SubTask_1">
           <dc:Bounds x="760" y="258" width="100" height="80" />
         </bpmndi:BPMNShape>
         <bpmndi:BPMNShape id="Boundary_1_di" bpmnElement="Boundary_1">
           <dc:Bounds x="712" y="382" width="36" height="36" />
         </bpmndi:BPMNShape>
         <bpmndi:BPMNShape id="Task_after_di" bpmnElement="Task_after">
           <dc:Bounds x="200" y="300" width="100" height="80" />
         </bpmndi:BPMNShape>
         <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1">
           <dc:Bounds x="1000" y="120" width="36" height="36" />
         </bpmndi:BPMNShape>
         <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
           <di:waypoint x="900" y="438" /><di:waypoint x="325" y="170" />
         </bpmndi:BPMNEdge>
         <bpmndi:BPMNEdge id="Flow_yes_di" bpmnElement="Flow_yes">
           <di:waypoint x="350" y="145" /><di:waypoint x="600" y="300" />
           <bpmndi:BPMNLabel><dc:Bounds x="450" y="200" width="18" height="14" /></bpmndi:BPMNLabel>
         </bpmndi:BPMNEdge>
         <bpmndi:BPMNEdge id="Flow_no_di" bpmnElement="Flow_no">
           <di:waypoint x="325" y="170" /><di:waypoint x="250" y="300" />
           <bpmndi:BPMNLabel><dc:Bounds x="280" y="230" width="14" height="14" /></bpmndi:BPMNLabel>
         </bpmndi:BPMNEdge>
         <bpmndi:BPMNEdge id="Flow_err_di" bpmnElement="Flow_err">
           <di:waypoint x="730" y="418" /><di:waypoint x="300" y="340" />
         </bpmndi:BPMNEdge>
         <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
           <di:waypoint x="950" y="300" /><di:waypoint x="1018" y="156" />
         </bpmndi:BPMNEdge>
         <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
           <di:waypoint x="300" y="340" /><di:waypoint x="1018" y="156" />
         </bpmndi:BPMNEdge>
       </bpmndi:BPMNPlane>
     </bpmndi:BPMNDiagram>`,
);
