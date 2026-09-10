/**
 * BPMN XML fixtures for the engine adapter.
 *
 * Deliberately DI-free: the engine discards diagram interchange anyway, so
 * carrying any would only obscure that the geometry in the result is generated
 * rather than passed through.
 */

const HEAD =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ` +
    `xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ` +
    `xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ` +
    `xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ` +
    `id="Definitions_1" targetNamespace="http://miragon.io/test">`;

const TAIL = `</bpmn:definitions>`;

function definitions(body: string): string {
    return `${HEAD}${body}${TAIL}`;
}

export const LINEAR_PROCESS = definitions(`
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1" name="Do the thing">
      <bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
  </bpmn:process>`);

export const PARALLEL_GATEWAY = definitions(`
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:parallelGateway id="Split_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing><bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:parallelGateway>
    <bpmn:task id="Task_A"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_4</bpmn:outgoing></bpmn:task>
    <bpmn:task id="Task_B"><bpmn:incoming>Flow_3</bpmn:incoming><bpmn:outgoing>Flow_5</bpmn:outgoing></bpmn:task>
    <bpmn:parallelGateway id="Join_1">
      <bpmn:incoming>Flow_4</bpmn:incoming><bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:parallelGateway>
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_6</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Split_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Split_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Split_1" targetRef="Task_B" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_A" targetRef="Join_1" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Task_B" targetRef="Join_1" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Join_1" targetRef="End_1" />
  </bpmn:process>`);

export const BOUNDARY_EVENT = definitions(`
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:task>
    <bpmn:boundaryEvent id="Boundary_1" attachedToRef="Task_1">
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
      <bpmn:timerEventDefinition id="Timer_1" />
    </bpmn:boundaryEvent>
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="End_2"><bpmn:incoming>Flow_3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Boundary_1" targetRef="End_2" />
  </bpmn:process>`);

export const EXPANDED_SUB_PROCESS = definitions(`
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1">
      <bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="Inner_Start"><bpmn:outgoing>Inner_Flow</bpmn:outgoing></bpmn:startEvent>
      <bpmn:task id="Inner_Task"><bpmn:incoming>Inner_Flow</bpmn:incoming></bpmn:task>
      <bpmn:sequenceFlow id="Inner_Flow" sourceRef="Inner_Start" targetRef="Inner_Task" />
    </bpmn:subProcess>
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="SubProcess_1" targetRef="End_1" />
  </bpmn:process>`);

export const COLLABORATION_TWO_POOLS = definitions(`
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_A" name="Customer" processRef="Process_A" />
    <bpmn:participant id="Participant_B" name="Supplier" processRef="Process_B" />
    <bpmn:messageFlow id="Message_1" sourceRef="Task_A" targetRef="Task_B" />
  </bpmn:collaboration>
  <bpmn:process id="Process_A" isExecutable="true">
    <bpmn:startEvent id="Start_A"><bpmn:outgoing>Flow_A</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_A"><bpmn:incoming>Flow_A</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="Flow_A" sourceRef="Start_A" targetRef="Task_A" />
  </bpmn:process>
  <bpmn:process id="Process_B" isExecutable="true">
    <bpmn:task id="Task_B"><bpmn:outgoing>Flow_B</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End_B"><bpmn:incoming>Flow_B</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_B" sourceRef="Task_B" targetRef="End_B" />
  </bpmn:process>`);

export const PROCESS_WITH_LANES = definitions(`
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Company" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_A" name="Sales">
        <bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_B" name="Delivery">
        <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:task>
    <bpmn:task id="Task_2"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="End_1" />
  </bpmn:process>`);

export const TEXT_ANNOTATION = definitions(`
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1"><bpmn:incoming>Flow_1</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:textAnnotation id="Annotation_1"><bpmn:text>Mind the gap</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Association_1" sourceRef="Task_1" targetRef="Annotation_1" />
  </bpmn:process>`);

/** A sequence flow whose target does not exist — the engine rejects this. */
export const BROKEN_FLOW = definitions(`
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_missing" />
  </bpmn:process>`);

/**
 * A group that references no visible members. The engine reports it as a
 * warning and generates no DI for it — the case that proves omissions are
 * survivable, because the geometry-only port simply leaves such an element's
 * existing DI alone.
 */
export const GROUP_WITHOUT_MEMBERS = definitions(`
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1"><bpmn:incoming>Flow_1</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:group id="Group_1" categoryValueRef="CategoryValue_1" />
  </bpmn:process>
  <bpmn:category id="Category_1">
    <bpmn:categoryValue id="CategoryValue_1" value="Empty" />
  </bpmn:category>`);
