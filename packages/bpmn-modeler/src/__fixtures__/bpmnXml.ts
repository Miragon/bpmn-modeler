/** Diagrams shared by the browser specs; all are untagged unless passed through {@link tagAsCamunda7}. */

/** The smallest diagram a surface can round-trip: one start event near the origin. */
export const START_EVENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="173" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/**
 * Shapes around x=5000, far from the origin, so an initial fit, a restored
 * viewbox, and an untouched origin viewbox are all distinguishable.
 */
export const FAR_FROM_ORIGIN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_1" name="A" />
    <bpmn:task id="Task_2" name="B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="5000" y="4000" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="5100" y="3980" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2">
        <dc:Bounds x="5300" y="3980" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/**
 * Every inline-script surface: an inline and an external-resource script task,
 * a class and a script execution listener, and a script task listener.
 */
export const SCRIPTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:scriptTask id="ScriptTask_1" scriptFormat="groovy">
      <bpmn:script>x = 1</bpmn:script>
    </bpmn:scriptTask>
    <bpmn:scriptTask id="ScriptTask_External" scriptFormat="groovy" camunda:resource="deployment://script.groovy" />
    <bpmn:task id="Task_Listeners">
      <bpmn:extensionElements>
        <camunda:executionListener class="org.example.Audit" event="start" />
        <camunda:executionListener event="end">
          <camunda:script scriptFormat="javascript">done = true</camunda:script>
        </camunda:executionListener>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:userTask id="UserTask_1">
      <bpmn:extensionElements>
        <camunda:taskListener event="create">
          <camunda:script scriptFormat="groovy">priority = 1</camunda:script>
        </camunda:taskListener>
      </bpmn:extensionElements>
    </bpmn:userTask>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="ScriptTask_1_di" bpmnElement="ScriptTask_1">
        <dc:Bounds x="160" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ScriptTask_External_di" bpmnElement="ScriptTask_External">
        <dc:Bounds x="320" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Listeners_di" bpmnElement="Task_Listeners">
        <dc:Bounds x="160" y="220" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UserTask_1_di" bpmnElement="UserTask_1">
        <dc:Bounds x="320" y="220" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/** Stamps the Camunda 7 execution platform onto an untagged diagram, so `detectEngine` reports `c7`. */
export function tagAsCamunda7(xml: string): string {
    return xml.replace(
        "<bpmn:definitions ",
        '<bpmn:definitions xmlns:modeler="http://camunda.org/schema/modeler/1.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.24.0" ',
    );
}

export const C7_SCRIPTS_XML = tagAsCamunda7(SCRIPTS_XML);

/**
 * The event-based gateway and boundary event cases of bpmn-js's modeling behaviours: task A →
 * receive task R (with a boundary event), gateway G → catch event C, task B, and gateway X →
 * receive task S (with a boundary event), which task B also flows into.
 */
export const EVENT_BASED_GATEWAY_TARGETS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:message id="Message_1" name="Message_1" />
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_A" name="A">
      <bpmn:outgoing>Flow_A</bpmn:outgoing>
    </bpmn:task>
    <bpmn:receiveTask id="ReceiveTask_R" name="R" messageRef="Message_1">
      <bpmn:incoming>Flow_A</bpmn:incoming>
    </bpmn:receiveTask>
    <bpmn:boundaryEvent id="Boundary_R" attachedToRef="ReceiveTask_R">
      <bpmn:timerEventDefinition id="TimerDefinition_R" />
    </bpmn:boundaryEvent>
    <bpmn:sequenceFlow id="Flow_A" sourceRef="Task_A" targetRef="ReceiveTask_R" />
    <bpmn:eventBasedGateway id="Gateway_G">
      <bpmn:outgoing>Flow_G</bpmn:outgoing>
    </bpmn:eventBasedGateway>
    <bpmn:intermediateCatchEvent id="Catch_C" name="C">
      <bpmn:incoming>Flow_G</bpmn:incoming>
      <bpmn:messageEventDefinition id="MessageDefinition_C" messageRef="Message_1" />
    </bpmn:intermediateCatchEvent>
    <bpmn:sequenceFlow id="Flow_G" sourceRef="Gateway_G" targetRef="Catch_C" />
    <bpmn:task id="Task_B" name="B">
      <bpmn:outgoing>Flow_B</bpmn:outgoing>
    </bpmn:task>
    <bpmn:exclusiveGateway id="Gateway_X">
      <bpmn:outgoing>Flow_X</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:receiveTask id="ReceiveTask_S" name="S" messageRef="Message_1">
      <bpmn:incoming>Flow_X</bpmn:incoming>
      <bpmn:incoming>Flow_B</bpmn:incoming>
    </bpmn:receiveTask>
    <bpmn:boundaryEvent id="Boundary_S" attachedToRef="ReceiveTask_S">
      <bpmn:timerEventDefinition id="TimerDefinition_S" />
    </bpmn:boundaryEvent>
    <bpmn:sequenceFlow id="Flow_X" sourceRef="Gateway_X" targetRef="ReceiveTask_S" />
    <bpmn:sequenceFlow id="Flow_B" sourceRef="Task_B" targetRef="ReceiveTask_S" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="100" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ReceiveTask_R_di" bpmnElement="ReceiveTask_R">
        <dc:Bounds x="300" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Boundary_R_di" bpmnElement="Boundary_R">
        <dc:Bounds x="332" y="142" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_A_di" bpmnElement="Flow_A">
        <di:waypoint x="200" y="120" />
        <di:waypoint x="300" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="Gateway_G_di" bpmnElement="Gateway_G">
        <dc:Bounds x="125" y="245" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Catch_C_di" bpmnElement="Catch_C">
        <dc:Bounds x="332" y="252" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_G_di" bpmnElement="Flow_G">
        <di:waypoint x="175" y="270" />
        <di:waypoint x="332" y="270" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="100" y="380" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_X_di" bpmnElement="Gateway_X" isMarkerVisible="true">
        <dc:Bounds x="125" y="545" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ReceiveTask_S_di" bpmnElement="ReceiveTask_S">
        <dc:Bounds x="300" y="530" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Boundary_S_di" bpmnElement="Boundary_S">
        <dc:Bounds x="332" y="592" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_X_di" bpmnElement="Flow_X">
        <di:waypoint x="175" y="570" />
        <di:waypoint x="300" y="570" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_B_di" bpmnElement="Flow_B">
        <di:waypoint x="200" y="420" />
        <di:waypoint x="250" y="420" />
        <di:waypoint x="250" y="550" />
        <di:waypoint x="300" y="550" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/**
 * Two paths for token simulation: Start_G → event-based gateway → message catch (→ End_M) or
 * timer catch (→ End_T), and Start_W → task W, whose interrupting boundary event leads to End_B.
 */
export const SIMULATED_GATEWAY_AND_BOUNDARY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:message id="Message_1" name="Message_1" />
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_G">
      <bpmn:outgoing>Flow_SG</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:eventBasedGateway id="Gateway_E">
      <bpmn:incoming>Flow_SG</bpmn:incoming>
      <bpmn:outgoing>Flow_EM</bpmn:outgoing>
      <bpmn:outgoing>Flow_ET</bpmn:outgoing>
    </bpmn:eventBasedGateway>
    <bpmn:intermediateCatchEvent id="Catch_M">
      <bpmn:incoming>Flow_EM</bpmn:incoming>
      <bpmn:outgoing>Flow_MEnd</bpmn:outgoing>
      <bpmn:messageEventDefinition id="MessageDefinition_M" messageRef="Message_1" />
    </bpmn:intermediateCatchEvent>
    <bpmn:intermediateCatchEvent id="Catch_T">
      <bpmn:incoming>Flow_ET</bpmn:incoming>
      <bpmn:outgoing>Flow_TEnd</bpmn:outgoing>
      <bpmn:timerEventDefinition id="TimerDefinition_T" />
    </bpmn:intermediateCatchEvent>
    <bpmn:endEvent id="End_M">
      <bpmn:incoming>Flow_MEnd</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_T">
      <bpmn:incoming>Flow_TEnd</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_SG" sourceRef="Start_G" targetRef="Gateway_E" />
    <bpmn:sequenceFlow id="Flow_EM" sourceRef="Gateway_E" targetRef="Catch_M" />
    <bpmn:sequenceFlow id="Flow_ET" sourceRef="Gateway_E" targetRef="Catch_T" />
    <bpmn:sequenceFlow id="Flow_MEnd" sourceRef="Catch_M" targetRef="End_M" />
    <bpmn:sequenceFlow id="Flow_TEnd" sourceRef="Catch_T" targetRef="End_T" />
    <bpmn:startEvent id="Start_W">
      <bpmn:outgoing>Flow_SW</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_W" name="W">
      <bpmn:incoming>Flow_SW</bpmn:incoming>
      <bpmn:outgoing>Flow_WEnd</bpmn:outgoing>
    </bpmn:task>
    <bpmn:boundaryEvent id="Boundary_W" attachedToRef="Task_W">
      <bpmn:outgoing>Flow_BEnd</bpmn:outgoing>
      <bpmn:timerEventDefinition id="TimerDefinition_W" />
    </bpmn:boundaryEvent>
    <bpmn:endEvent id="End_W">
      <bpmn:incoming>Flow_WEnd</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_B">
      <bpmn:incoming>Flow_BEnd</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_SW" sourceRef="Start_W" targetRef="Task_W" />
    <bpmn:sequenceFlow id="Flow_WEnd" sourceRef="Task_W" targetRef="End_W" />
    <bpmn:sequenceFlow id="Flow_BEnd" sourceRef="Boundary_W" targetRef="End_B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_G_di" bpmnElement="Start_G">
        <dc:Bounds x="100" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_E_di" bpmnElement="Gateway_E">
        <dc:Bounds x="200" y="95" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Catch_M_di" bpmnElement="Catch_M">
        <dc:Bounds x="320" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Catch_T_di" bpmnElement="Catch_T">
        <dc:Bounds x="320" y="202" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_M_di" bpmnElement="End_M">
        <dc:Bounds x="420" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_T_di" bpmnElement="End_T">
        <dc:Bounds x="420" y="202" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_SG_di" bpmnElement="Flow_SG">
        <di:waypoint x="136" y="120" />
        <di:waypoint x="200" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_EM_di" bpmnElement="Flow_EM">
        <di:waypoint x="250" y="120" />
        <di:waypoint x="320" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_ET_di" bpmnElement="Flow_ET">
        <di:waypoint x="225" y="145" />
        <di:waypoint x="225" y="220" />
        <di:waypoint x="320" y="220" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_MEnd_di" bpmnElement="Flow_MEnd">
        <di:waypoint x="356" y="120" />
        <di:waypoint x="420" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_TEnd_di" bpmnElement="Flow_TEnd">
        <di:waypoint x="356" y="220" />
        <di:waypoint x="420" y="220" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="Start_W_di" bpmnElement="Start_W">
        <dc:Bounds x="100" y="342" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_W_di" bpmnElement="Task_W">
        <dc:Bounds x="200" y="320" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Boundary_W_di" bpmnElement="Boundary_W">
        <dc:Bounds x="232" y="382" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_W_di" bpmnElement="End_W">
        <dc:Bounds x="372" y="342" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_B_di" bpmnElement="End_B">
        <dc:Bounds x="372" y="462" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_SW_di" bpmnElement="Flow_SW">
        <di:waypoint x="136" y="360" />
        <di:waypoint x="200" y="360" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_WEnd_di" bpmnElement="Flow_WEnd">
        <di:waypoint x="300" y="360" />
        <di:waypoint x="372" y="360" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_BEnd_di" bpmnElement="Flow_BEnd">
        <di:waypoint x="250" y="418" />
        <di:waypoint x="250" y="480" />
        <di:waypoint x="372" y="480" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/**
 * A message flow for token simulation: pool A's Start_A → send task (→ End_A) sends to pool B's
 * message start event MsgStart_B → End_B.
 */
export const SIMULATED_MESSAGE_FLOW_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:message id="Message_1" name="Message_1" />
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_A" name="A" processRef="Process_A" />
    <bpmn:participant id="Participant_B" name="B" processRef="Process_B" />
    <bpmn:messageFlow id="MessageFlow_1" sourceRef="SendTask_A" targetRef="MsgStart_B" />
  </bpmn:collaboration>
  <bpmn:process id="Process_A" isExecutable="true">
    <bpmn:startEvent id="Start_A">
      <bpmn:outgoing>Flow_SA</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sendTask id="SendTask_A" name="Send">
      <bpmn:incoming>Flow_SA</bpmn:incoming>
      <bpmn:outgoing>Flow_AEnd</bpmn:outgoing>
    </bpmn:sendTask>
    <bpmn:endEvent id="End_A">
      <bpmn:incoming>Flow_AEnd</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_SA" sourceRef="Start_A" targetRef="SendTask_A" />
    <bpmn:sequenceFlow id="Flow_AEnd" sourceRef="SendTask_A" targetRef="End_A" />
  </bpmn:process>
  <bpmn:process id="Process_B" isExecutable="true">
    <bpmn:startEvent id="MsgStart_B">
      <bpmn:outgoing>Flow_BEnd</bpmn:outgoing>
      <bpmn:messageEventDefinition id="MessageDefinition_B" messageRef="Message_1" />
    </bpmn:startEvent>
    <bpmn:endEvent id="End_B">
      <bpmn:incoming>Flow_BEnd</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_BEnd" sourceRef="MsgStart_B" targetRef="End_B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_A_di" bpmnElement="Participant_A" isHorizontal="true">
        <dc:Bounds x="100" y="50" width="500" height="200" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Start_A_di" bpmnElement="Start_A">
        <dc:Bounds x="170" y="132" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SendTask_A_di" bpmnElement="SendTask_A">
        <dc:Bounds x="260" y="110" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_A_di" bpmnElement="End_A">
        <dc:Bounds x="432" y="132" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_SA_di" bpmnElement="Flow_SA">
        <di:waypoint x="206" y="150" />
        <di:waypoint x="260" y="150" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_AEnd_di" bpmnElement="Flow_AEnd">
        <di:waypoint x="360" y="150" />
        <di:waypoint x="432" y="150" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="Participant_B_di" bpmnElement="Participant_B" isHorizontal="true">
        <dc:Bounds x="100" y="350" width="500" height="200" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="MsgStart_B_di" bpmnElement="MsgStart_B">
        <dc:Bounds x="292" y="432" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_B_di" bpmnElement="End_B">
        <dc:Bounds x="432" y="432" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_BEnd_di" bpmnElement="Flow_BEnd">
        <di:waypoint x="328" y="450" />
        <di:waypoint x="432" y="450" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="MessageFlow_1_di" bpmnElement="MessageFlow_1">
        <di:waypoint x="310" y="190" />
        <di:waypoint x="310" y="432" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/** Two expanded pools whose tasks send each other a message flow, one in each direction. */
export const MESSAGE_FLOWS_BETWEEN_POOLS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_A" name="A" processRef="Process_A" />
    <bpmn:participant id="Participant_B" name="B" processRef="Process_B" />
    <bpmn:messageFlow id="MessageFlow_AB" sourceRef="Task_PA" targetRef="Task_PB" />
    <bpmn:messageFlow id="MessageFlow_BA" sourceRef="Task_PB" targetRef="Task_PA" />
  </bpmn:collaboration>
  <bpmn:process id="Process_A" isExecutable="true">
    <bpmn:task id="Task_PA" name="Send A" />
  </bpmn:process>
  <bpmn:process id="Process_B" isExecutable="true">
    <bpmn:task id="Task_PB" name="Send B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_A_di" bpmnElement="Participant_A" isHorizontal="true">
        <dc:Bounds x="100" y="50" width="500" height="200" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_PA_di" bpmnElement="Task_PA">
        <dc:Bounds x="250" y="110" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Participant_B_di" bpmnElement="Participant_B" isHorizontal="true">
        <dc:Bounds x="100" y="350" width="500" height="200" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_PB_di" bpmnElement="Task_PB">
        <dc:Bounds x="250" y="410" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="MessageFlow_AB_di" bpmnElement="MessageFlow_AB">
        <di:waypoint x="280" y="190" />
        <di:waypoint x="280" y="410" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="MessageFlow_BA_di" bpmnElement="MessageFlow_BA">
        <di:waypoint x="320" y="410" />
        <di:waypoint x="320" y="190" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
