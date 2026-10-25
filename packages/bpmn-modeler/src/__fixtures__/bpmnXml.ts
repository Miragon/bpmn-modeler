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
