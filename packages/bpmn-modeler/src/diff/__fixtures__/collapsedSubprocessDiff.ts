const definitions = (
    content: string,
    diagrams: string,
): string => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  ${content}
  ${diagrams}
</bpmn:definitions>`;

export const COLLAPSED_SUBPROCESS_BEFORE_XML = definitions(
    `<bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Top_Task" name="Before top" />
    <bpmn:subProcess id="Main_Subprocess" name="Main subprocess">
      <bpmn:startEvent id="Inner_Start" />
      <bpmn:task id="Inner_Task" name="Before inner" />
      <bpmn:subProcess id="Nested_Subprocess" name="Nested subprocess">
        <bpmn:task id="Nested_Task" name="Before nested" />
        <bpmn:task id="Before_Only_Nested" name="Removed nested" />
      </bpmn:subProcess>
      <bpmn:endEvent id="Inner_End" />
      <bpmn:sequenceFlow id="Inner_Flow" name="Before flow" sourceRef="Inner_Start" targetRef="Inner_Task" />
    </bpmn:subProcess>
  </bpmn:process>`,
    `<bpmndi:BPMNDiagram id="Top_Diagram">
    <bpmndi:BPMNPlane id="Process_1_plane" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Top_Task_di" bpmnElement="Top_Task">
        <dc:Bounds x="100" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Main_Subprocess_di" bpmnElement="Main_Subprocess" isExpanded="false">
        <dc:Bounds x="350" y="110" width="120" height="100" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Main_Diagram">
    <bpmndi:BPMNPlane id="Main_Subprocess_plane" bpmnElement="Main_Subprocess">
      <bpmndi:BPMNShape id="Inner_Start_di" bpmnElement="Inner_Start">
        <dc:Bounds x="1800" y="2022" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Inner_Task_di" bpmnElement="Inner_Task">
        <dc:Bounds x="2100" y="2000" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Nested_Subprocess_di" bpmnElement="Nested_Subprocess" isExpanded="false">
        <dc:Bounds x="2400" y="1990" width="120" height="100" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Inner_End_di" bpmnElement="Inner_End">
        <dc:Bounds x="2700" y="2022" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Inner_Flow_di" bpmnElement="Inner_Flow">
        <di:waypoint x="1836" y="2040" />
        <di:waypoint x="2100" y="2040" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Nested_Diagram">
    <bpmndi:BPMNPlane id="Nested_Subprocess_plane" bpmnElement="Nested_Subprocess">
      <bpmndi:BPMNShape id="Nested_Task_di" bpmnElement="Nested_Task">
        <dc:Bounds x="12100" y="8000" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Before_Only_Nested_di" bpmnElement="Before_Only_Nested">
        <dc:Bounds x="12400" y="8000" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`,
);

export const COLLAPSED_SUBPROCESS_AFTER_XML = definitions(
    `<bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Top_Task" name="After top" />
    <bpmn:subProcess id="Main_Subprocess" name="Main subprocess">
      <bpmn:startEvent id="Inner_Start" />
      <bpmn:task id="Inner_Task" name="After inner" />
      <bpmn:task id="After_Only_Inner" name="Added inner" />
      <bpmn:subProcess id="Nested_Subprocess" name="Nested subprocess">
        <bpmn:task id="Nested_Task" name="After nested" />
      </bpmn:subProcess>
      <bpmn:endEvent id="Inner_End" />
      <bpmn:sequenceFlow id="Inner_Flow" name="After flow" sourceRef="Inner_Start" targetRef="Inner_Task" />
    </bpmn:subProcess>
  </bpmn:process>`,
    `<bpmndi:BPMNDiagram id="Top_Diagram">
    <bpmndi:BPMNPlane id="Process_1_plane" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Top_Task_di" bpmnElement="Top_Task">
        <dc:Bounds x="600" y="420" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Main_Subprocess_di" bpmnElement="Main_Subprocess" isExpanded="false">
        <dc:Bounds x="850" y="410" width="120" height="100" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Main_Diagram">
    <bpmndi:BPMNPlane id="Main_Subprocess_plane" bpmnElement="Main_Subprocess">
      <bpmndi:BPMNShape id="Inner_Start_di" bpmnElement="Inner_Start">
        <dc:Bounds x="7800" y="6022" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Inner_Task_di" bpmnElement="Inner_Task">
        <dc:Bounds x="8100" y="6000" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="After_Only_Inner_di" bpmnElement="After_Only_Inner">
        <dc:Bounds x="8400" y="6000" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Nested_Subprocess_di" bpmnElement="Nested_Subprocess" isExpanded="false">
        <dc:Bounds x="8700" y="5990" width="120" height="100" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Inner_End_di" bpmnElement="Inner_End">
        <dc:Bounds x="9000" y="6022" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Inner_Flow_di" bpmnElement="Inner_Flow">
        <di:waypoint x="7836" y="6040" />
        <di:waypoint x="8100" y="6040" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Nested_Diagram">
    <bpmndi:BPMNPlane id="Nested_Subprocess_plane" bpmnElement="Nested_Subprocess">
      <bpmndi:BPMNShape id="Nested_Task_di" bpmnElement="Nested_Task">
        <dc:Bounds x="18100" y="12000" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`,
);
