/**
 * A diagram with a *collapsed* subprocess, which bpmn-js renders as its own
 * plane the user drills into.
 */
export const COLLAPSED_SUBPROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://miragon.io/test">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:subProcess id="Sub_1" name="Collapsed">
      <bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="SubStart_1"><bpmn:outgoing>SubFlow_1</bpmn:outgoing></bpmn:startEvent>
      <bpmn:task id="SubTask_1"><bpmn:incoming>SubFlow_1</bpmn:incoming><bpmn:outgoing>SubFlow_2</bpmn:outgoing></bpmn:task>
      <bpmn:endEvent id="SubEnd_1"><bpmn:incoming>SubFlow_2</bpmn:incoming></bpmn:endEvent>
      <bpmn:sequenceFlow id="SubFlow_1" sourceRef="SubStart_1" targetRef="SubTask_1" />
      <bpmn:sequenceFlow id="SubFlow_2" sourceRef="SubTask_1" targetRef="SubEnd_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Sub_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Sub_1" targetRef="End_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="700" y="400" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_1_di" bpmnElement="Sub_1"><dc:Bounds x="300" y="180" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1"><dc:Bounds x="900" y="150" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="700" y="418" /><di:waypoint x="350" y="260" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="400" y="220" /><di:waypoint x="918" y="186" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Diagram_Sub_1">
    <bpmndi:BPMNPlane id="Plane_Sub_1" bpmnElement="Sub_1">
      <bpmndi:BPMNShape id="SubStart_1_di" bpmnElement="SubStart_1"><dc:Bounds x="600" y="300" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubTask_1_di" bpmnElement="SubTask_1"><dc:Bounds x="200" y="120" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubEnd_1_di" bpmnElement="SubEnd_1"><dc:Bounds x="800" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="SubFlow_1_di" bpmnElement="SubFlow_1"><di:waypoint x="600" y="318" /><di:waypoint x="250" y="200" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SubFlow_2_di" bpmnElement="SubFlow_2"><di:waypoint x="300" y="160" /><di:waypoint x="818" y="136" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
