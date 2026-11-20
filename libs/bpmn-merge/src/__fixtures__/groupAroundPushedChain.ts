const bounds = (x: number, y: number, width: number, height: number) =>
    `<dc:Bounds x="${x}" y="${y}" width="${width}" height="${height}" />`;

const shape = (id: string, x: number, y: number, width: number, height: number, extra = "") =>
    `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${extra}>${bounds(x, y, width, height)}</bpmndi:BPMNShape>`;

const GROUP = '<bpmn:group id="Group_K" />';
const NAMED_GROUP = '<bpmn:group id="Group_K" categoryValueRef="CategoryValue_K" />';
const CATEGORY =
    '<bpmn:category id="Category_K"><bpmn:categoryValue id="CategoryValue_K" value="K part" /></bpmn:category>';
const GROUP_SHAPE = shape("Group_K", 790, 110, 230, 140);
const NAMED_GROUP_SHAPE = `<bpmndi:BPMNShape id="Group_K_di" bpmnElement="Group_K">${bounds(790, 110, 230, 140)}<bpmndi:BPMNLabel>${bounds(880, 117, 50, 14)}</bpmndi:BPMNLabel></bpmndi:BPMNShape>`;

const edge = (id: string, fromX: number, toX: number, y: number) =>
    `<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}"><di:waypoint x="${fromX}" y="${y}" /><di:waypoint x="${toX}" y="${y}" /></bpmndi:BPMNEdge>`;

/**
 * Both sides added a task after A in the sub-process at one place, X and Y;
 * Group_K encloses task K and the end event right of the sub-process. Making
 * room for Y pushes B, grows the sub-process and pushes K and the end event.
 */
const groupAroundPushedChain = (named: boolean) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  ${named ? CATEGORY : ""}
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Pool" processRef="Process_1" />
    ${named ? NAMED_GROUP : GROUP}
  </bpmn:collaboration>
  <bpmn:process id="Process_1">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_Top">
        <bpmn:flowNodeRef>Start</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Sub</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>SubStart</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_A</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_X</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Y</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_B</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_K</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_K</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_Low">
        <bpmn:flowNodeRef>Start_Low</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Low</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_Low</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start" />
    <bpmn:subProcess id="Sub">
      <bpmn:startEvent id="SubStart" />
      <bpmn:task id="Task_A" />
      <bpmn:task id="Task_X" />
      <bpmn:task id="Task_Y" />
      <bpmn:task id="Task_B" />
      <bpmn:sequenceFlow id="F_sa" sourceRef="SubStart" targetRef="Task_A" />
      <bpmn:sequenceFlow id="F_ax" sourceRef="Task_A" targetRef="Task_X" />
      <bpmn:sequenceFlow id="F_xb" sourceRef="Task_X" targetRef="Task_Y" />
      <bpmn:sequenceFlow id="F_yb" sourceRef="Task_Y" targetRef="Task_B" />
    </bpmn:subProcess>
    <bpmn:task id="Task_K" />
    <bpmn:endEvent id="End_K" />
    <bpmn:startEvent id="Start_Low" />
    <bpmn:task id="Task_Low" />
    <bpmn:endEvent id="End_Low" />
    <bpmn:sequenceFlow id="F_s" sourceRef="Start" targetRef="Sub" />
    <bpmn:sequenceFlow id="F_sk" sourceRef="Sub" targetRef="Task_K" />
    <bpmn:sequenceFlow id="F_ke" sourceRef="Task_K" targetRef="End_K" />
    <bpmn:sequenceFlow id="F_l1" sourceRef="Start_Low" targetRef="Task_Low" />
    <bpmn:sequenceFlow id="F_l2" sourceRef="Task_Low" targetRef="End_Low" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      ${shape("Pool", 100, 40, 1100, 420, ' isHorizontal="true"')}
      ${shape("Lane_Top", 130, 40, 1070, 260, ' isHorizontal="true"')}
      ${shape("Lane_Low", 130, 300, 1070, 160, ' isHorizontal="true"')}
      ${shape("Start", 170, 162, 36, 36)}
      ${shape("Sub", 240, 80, 520, 200, ' isExpanded="true"')}
      ${shape("SubStart", 262, 162, 36, 36)}
      ${shape("Task_A", 330, 140, 100, 80)}
      ${shape("Task_X", 470, 140, 100, 80)}
      ${shape("Task_Y", 470, 140, 100, 80)}
      ${shape("Task_B", 620, 140, 100, 80)}
      ${shape("Task_K", 810, 140, 100, 80)}
      ${shape("End_K", 962, 162, 36, 36)}
      ${named ? NAMED_GROUP_SHAPE : GROUP_SHAPE}
      ${shape("Start_Low", 170, 362, 36, 36)}
      ${shape("Task_Low", 560, 340, 100, 80)}
      ${shape("End_Low", 1002, 362, 36, 36)}
      ${edge("F_sa", 298, 330, 180)}
      ${edge("F_ax", 430, 470, 180)}
      ${edge("F_xb", 570, 620, 180)}
      ${edge("F_yb", 570, 620, 180)}
      ${edge("F_s", 206, 240, 180)}
      ${edge("F_sk", 760, 810, 180)}
      ${edge("F_ke", 910, 962, 180)}
      ${edge("F_l1", 206, 560, 380)}
      ${edge("F_l2", 660, 1002, 380)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export const GROUP_AROUND_PUSHED_CHAIN = groupAroundPushedChain(false);

/** The same with the group named, its name drawn at its top middle as bpmn-js draws it. */
export const NAMED_GROUP_AROUND_PUSHED_CHAIN = groupAroundPushedChain(true);
