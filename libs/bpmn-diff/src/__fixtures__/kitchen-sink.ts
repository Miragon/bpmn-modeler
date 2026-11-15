/** Lanes in lanes, an expanded and a collapsed sub-process on its own plane, boundary and compensation events, data, messages, a group and an unreferenced process. */
export const KITCHEN_SINK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:custom="urn:miragon:custom" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:message id="Msg_1" name="OrderPlaced"><bpmn:extensionElements><zeebe:subscription correlationKey="=orderId" /></bpmn:extensionElements></bpmn:message>
  <bpmn:error id="Err_1" name="Fail" errorCode="E1" />
  <bpmn:signal id="Sig_1" name="Stop" />
  <bpmn:escalation id="Esc_1" name="Late" escalationCode="L1" />
  <bpmn:dataStore id="Store_1" name="DB" />
  <bpmn:itemDefinition id="Item_1" structureRef="string" />
  <bpmn:category id="Cat_1"><bpmn:categoryValue id="CatVal_1" value="Group A" /></bpmn:category>
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Part_1" name="Shop" processRef="Proc_1" />
    <bpmn:participant id="Part_2" name="Customer" />
    <bpmn:messageFlow id="MF_1" sourceRef="Part_2" targetRef="Start_1" messageRef="Msg_1" />
    <bpmn:textAnnotation id="CollabNote_1"><bpmn:text>pool note</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="CollabAssoc_1" sourceRef="CollabNote_1" targetRef="Part_2" />
    <bpmn:group id="Group_1" categoryValueRef="CatVal_1" />
  </bpmn:collaboration>
  <bpmn:process id="Proc_1" isExecutable="true" custom:owner="shop">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_A" name="A">
        <bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Boundary_1</bpmn:flowNodeRef>
        <bpmn:childLaneSet id="LaneSet_A">
          <bpmn:lane id="Lane_A1" name="A1"><bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef></bpmn:lane>
          <bpmn:lane id="Lane_A2" name="A2"><bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef><bpmn:flowNodeRef>Boundary_1</bpmn:flowNodeRef></bpmn:lane>
        </bpmn:childLaneSet>
      </bpmn:lane>
      <bpmn:lane id="Lane_B" name="B">
        <bpmn:flowNodeRef>Gw_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Sub_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Sub_C</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:dataObject id="DO_1" />
    <bpmn:dataObjectReference id="DORef_1" name="Order" dataObjectRef="DO_1" />
    <bpmn:dataStoreReference id="DSRef_1" dataStoreRef="Store_1" />
    <bpmn:startEvent id="Start_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
      <bpmn:messageEventDefinition id="MED_1" messageRef="Msg_1" />
    </bpmn:startEvent>
    <bpmn:serviceTask id="Task_1" name="Check" default="Flow_2" zeebe:modelerTemplate="tpl" custom:b="2" custom:a="1">
      <bpmn:extensionElements><zeebe:taskDefinition type="check" /><custom:meta owner="billing" /></bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:ioSpecification id="IoSpec_1">
        <bpmn:dataInput id="DIn_1" itemSubjectRef="Item_1" />
        <bpmn:dataOutput id="DOut_1" />
        <bpmn:inputSet id="InSet_1"><bpmn:dataInputRefs>DIn_1</bpmn:dataInputRefs></bpmn:inputSet>
        <bpmn:outputSet id="OutSet_1"><bpmn:dataOutputRefs>DOut_1</bpmn:dataOutputRefs></bpmn:outputSet>
      </bpmn:ioSpecification>
      <bpmn:dataInputAssociation id="DIA_1"><bpmn:sourceRef>DORef_1</bpmn:sourceRef><bpmn:targetRef>DIn_1</bpmn:targetRef></bpmn:dataInputAssociation>
      <bpmn:dataOutputAssociation id="DOA_1"><bpmn:targetRef>DSRef_1</bpmn:targetRef></bpmn:dataOutputAssociation>
    </bpmn:serviceTask>
    <bpmn:boundaryEvent id="Boundary_1" attachedToRef="Task_1">
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
      <bpmn:errorEventDefinition id="EED_1" errorRef="Err_1" />
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="CompBoundary_1" attachedToRef="Task_1"><bpmn:compensateEventDefinition id="CED_1" /></bpmn:boundaryEvent>
    <bpmn:serviceTask id="Undo_1" isForCompensation="true" />
    <bpmn:association id="CompAssoc_1" associationDirection="One" sourceRef="CompBoundary_1" targetRef="Undo_1" />
    <bpmn:exclusiveGateway id="Gw_1" default="Flow_4">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:subProcess id="Sub_1" name="Expanded">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
      <bpmn:startEvent id="Sub_1_Start"><bpmn:outgoing>Sub_1_Flow</bpmn:outgoing></bpmn:startEvent>
      <bpmn:endEvent id="Sub_1_End"><bpmn:incoming>Sub_1_Flow</bpmn:incoming><bpmn:signalEventDefinition id="SED_1" signalRef="Sig_1" /></bpmn:endEvent>
      <bpmn:sequenceFlow id="Sub_1_Flow" sourceRef="Sub_1_Start" targetRef="Sub_1_End" />
      <bpmn:textAnnotation id="SubNote_1"><bpmn:text>inner</bpmn:text></bpmn:textAnnotation>
    </bpmn:subProcess>
    <bpmn:subProcess id="Sub_C" name="Collapsed">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:task id="Sub_C_Task" />
      <bpmn:intermediateThrowEvent id="LinkThrow_1"><bpmn:linkEventDefinition id="LED_T" name="L" /></bpmn:intermediateThrowEvent>
      <bpmn:intermediateCatchEvent id="LinkCatch_1"><bpmn:linkEventDefinition id="LED_C" name="L" /></bpmn:intermediateCatchEvent>
    </bpmn:subProcess>
    <bpmn:endEvent id="End_1">
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:escalationEventDefinition id="EscED_1" escalationRef="Esc_1" />
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Gw_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Boundary_1" targetRef="End_1" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Gw_1" targetRef="Sub_1" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Gw_1" targetRef="Sub_C">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">=x &gt; 1</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Sub_1" targetRef="End_1" />
    <bpmn:textAnnotation id="Note_1"><bpmn:text>check it</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Assoc_1" sourceRef="Task_1" targetRef="Note_1" />
  </bpmn:process>
  <bpmn:process id="Proc_Orphan" custom:owner="nobody">
    <bpmn:task id="Task_Orphan" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collab_1">
      <bpmndi:BPMNShape id="Part_1_di" bpmnElement="Part_1" isHorizontal="true"><dc:Bounds x="0" y="0" width="1200" height="400" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_A_di" bpmnElement="Lane_A" isHorizontal="true"><dc:Bounds x="30" y="0" width="1170" height="200" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_A1_di" bpmnElement="Lane_A1" isHorizontal="true"><dc:Bounds x="60" y="0" width="1140" height="100" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_A2_di" bpmnElement="Lane_A2" isHorizontal="true"><dc:Bounds x="60" y="100" width="1140" height="100" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_B_di" bpmnElement="Lane_B" isHorizontal="true"><dc:Bounds x="30" y="200" width="1170" height="200" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="100" y="32" width="36" height="36" /><bpmndi:BPMNLabel><dc:Bounds x="90" y="75" width="56" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1" bioc:stroke="#1e88e5" color:background-color="#bbdefb"><dc:Bounds x="200" y="110" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Boundary_1_di" bpmnElement="Boundary_1"><dc:Bounds x="232" y="172" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="CompBoundary_1_di" bpmnElement="CompBoundary_1"><dc:Bounds x="282" y="172" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Undo_1_di" bpmnElement="Undo_1"><dc:Bounds x="350" y="300" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gw_1_di" bpmnElement="Gw_1" isMarkerVisible="true"><dc:Bounds x="400" y="275" width="50" height="50" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_1_di" bpmnElement="Sub_1" isExpanded="true"><dc:Bounds x="500" y="220" width="300" height="160" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_1_Start_di" bpmnElement="Sub_1_Start"><dc:Bounds x="530" y="282" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_1_End_di" bpmnElement="Sub_1_End"><dc:Bounds x="700" y="282" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubNote_1_di" bpmnElement="SubNote_1"><dc:Bounds x="600" y="230" width="100" height="30" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_C_di" bpmnElement="Sub_C" isExpanded="false"><dc:Bounds x="850" y="260" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1"><dc:Bounds x="1000" y="282" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="DORef_1_di" bpmnElement="DORef_1"><dc:Bounds x="150" y="140" width="36" height="50" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="DSRef_1_di" bpmnElement="DSRef_1"><dc:Bounds x="320" y="20" width="50" height="50" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Note_1_di" bpmnElement="Note_1"><dc:Bounds x="320" y="110" width="100" height="30" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Part_2_di" bpmnElement="Part_2" isHorizontal="true"><dc:Bounds x="0" y="-200" width="1200" height="100" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="CollabNote_1_di" bpmnElement="CollabNote_1"><dc:Bounds x="1250" y="-200" width="100" height="30" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Group_1_di" bpmnElement="Group_1"><dc:Bounds x="80" y="10" width="300" height="200" /><bpmndi:BPMNLabel><dc:Bounds x="200" y="17" width="60" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="MF_1_di" bpmnElement="MF_1"><di:waypoint x="118" y="-100" /><di:waypoint x="118" y="32" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="136" y="50" /><di:waypoint x="200" y="150" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="300" y="150" /><di:waypoint x="425" y="275" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="250" y="208" /><di:waypoint x="1018" y="318" /><bpmndi:BPMNLabel><dc:Bounds x="600" y="390" width="20" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4"><di:waypoint x="450" y="300" /><di:waypoint x="500" y="300" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5"><di:waypoint x="425" y="325" /><di:waypoint x="900" y="340" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6"><di:waypoint x="800" y="300" /><di:waypoint x="1000" y="300" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Sub_1_Flow_di" bpmnElement="Sub_1_Flow"><di:waypoint x="566" y="300" /><di:waypoint x="700" y="300" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="DIA_1_di" bpmnElement="DIA_1"><di:waypoint x="186" y="160" /><di:waypoint x="200" y="160" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="DOA_1_di" bpmnElement="DOA_1"><di:waypoint x="250" y="110" /><di:waypoint x="330" y="70" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Assoc_1_di" bpmnElement="Assoc_1"><di:waypoint x="300" y="130" /><di:waypoint x="320" y="125" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="CompAssoc_1_di" bpmnElement="CompAssoc_1"><di:waypoint x="300" y="208" /><di:waypoint x="400" y="300" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="CollabAssoc_1_di" bpmnElement="CollabAssoc_1"><di:waypoint x="1250" y="-185" /><di:waypoint x="1200" y="-150" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="Diagram_SubC">
    <bpmndi:BPMNPlane id="Plane_SubC" bpmnElement="Sub_C">
      <bpmndi:BPMNShape id="Sub_C_Task_di" bpmnElement="Sub_C_Task"><dc:Bounds x="100" y="100" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="LinkThrow_1_di" bpmnElement="LinkThrow_1"><dc:Bounds x="250" y="122" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="LinkCatch_1_di" bpmnElement="LinkCatch_1"><dc:Bounds x="350" y="122" width="36" height="36" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
