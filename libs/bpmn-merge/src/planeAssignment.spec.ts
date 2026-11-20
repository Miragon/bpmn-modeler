import { type ModdleElement, isModdleElement, loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { beforeAll, describe, expect, it } from "vitest";

import { type DiagramIndex, diagramIndexOf } from "./diagramIndex";
import { DrawingSides } from "./drawingSides";
import type { MergeSide } from "./mergeResult";
import { PlaneAssignment } from "./planeAssignment";
import { type PlaneSlot, PlaneSlots } from "./planeSlots";

const SEMANTIC = `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_1" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="Start_1" />
    <bpmn:task id="Task_A" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_A" />
    <bpmn:subProcess id="Sub_1">
      <bpmn:ioSpecification id="Io_Sub_1">
        <bpmn:dataInput id="Input_Sub" />
      </bpmn:ioSpecification>
      <bpmn:task id="Task_In" />
      <bpmn:task id="Task_In2" />
      <bpmn:task id="Task_Gone" />
      <bpmn:sequenceFlow id="Flow_In" sourceRef="Task_In" targetRef="Task_In2" />
    </bpmn:subProcess>
    <bpmn:subProcess id="Sub_2">
      <bpmn:task id="Task_Ex" />
      <bpmn:task id="Task_Dropped" />
    </bpmn:subProcess>
    <bpmn:textAnnotation id="Note_1" />
    <bpmn:association id="Association_ToFlow" sourceRef="Flow_1" targetRef="Note_1" />
    <bpmn:association id="Association_Across" sourceRef="Note_1" targetRef="Task_In" />
    <bpmn:association id="Association_Loose" sourceRef="Task_A" />
  </bpmn:process>
  <bpmn:process id="Process_2">
    <bpmn:task id="Task_Other" />
  </bpmn:process>`;

const shape = (element: string, extra = "") =>
    `<bpmndi:BPMNShape id="${element}_di" bpmnElement="${element}"${extra}><dc:Bounds x="0" y="0" width="100" height="80" /></bpmndi:BPMNShape>`;

const edge = (element: string) =>
    `<bpmndi:BPMNEdge id="${element}_di" bpmnElement="${element}"><di:waypoint x="0" y="0" /><di:waypoint x="10" y="0" /></bpmndi:BPMNEdge>`;

const plane = (owner: string, drawings: readonly string[]) => `
  <bpmndi:BPMNDiagram id="Diagram_${owner}">
    <bpmndi:BPMNPlane id="Plane_${owner}" bpmnElement="${owner}">${drawings.join("")}</bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;

const document = (diagrams: readonly string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${SEMANTIC}${diagrams.join("")}
</bpmn:definitions>`;

const rootDrawings = (sub1Drawings: readonly string[] = [shape("Sub_1")]) => [
    shape("Start_1"),
    shape("Task_A"),
    ...sub1Drawings,
    shape("Note_1"),
    edge("Flow_1"),
    edge("Association_ToFlow"),
    edge("Association_Across"),
    edge("Association_Loose"),
];
const ROOT_DRAWINGS = rootDrawings();
const SUB_1_PLANE = plane("Sub_1", [
    shape("Input_Sub"),
    shape("Task_In"),
    shape("Task_In2"),
    shape("Task_Gone"),
    edge("Flow_In"),
]);

/**
 * Current draws both sub-processes collapsed on the process's root plane. Incoming draws Sub_2
 * expanded on the collaboration's root plane, and Process_2 on a root plane of its own.
 */
const CURRENT = document([
    plane("Process_1", [...ROOT_DRAWINGS, shape("Sub_2")]),
    SUB_1_PLANE,
    plane("Sub_2", [shape("Task_Ex"), shape("Task_Dropped")]),
]);
const INCOMING = document([
    plane("Collab_1", [
        shape("Pool_1"),
        ...ROOT_DRAWINGS,
        shape("Sub_2", ' isExpanded="true"'),
        shape("Task_Ex"),
    ]),
    SUB_1_PLANE,
    plane("Process_2", [shape("Task_Other")]),
]);

const FROM_INCOMING = new Set(["Pool_1", "Sub_2", "Task_Ex", "Task_Other"]);
const UNDECIDED = new Set(["Task_Gone", "Task_Dropped"]);
const PARTS = new Set(["Input_Sub"]);

interface AssignedSlots {
    readonly assignment: PlaneAssignment;
    readonly slots: PlaneSlots;
    readonly keptSlots: readonly PlaneSlot[];
}

async function assignmentOf(currentXml: string, incomingXml: string): Promise<AssignedSlots> {
    const createModdle = await loadBpmnModdle();
    const current = await createModdle().fromXML(currentXml);
    const incoming = await createModdle().fromXML(incomingXml);
    const indexes: Record<MergeSide, DiagramIndex> = {
        current: diagramIndexOf(current.rootElement),
        incoming: diagramIndexOf(incoming.rootElement),
    };
    const resultUnits = new Map(
        Object.entries(current.elementsById).flatMap(([id, element]) =>
            isModdleElement(element) && !UNDECIDED.has(id) && !PARTS.has(id)
                ? [[id, element as ModdleElement] as const]
                : [],
        ),
    );
    const sides = Object.fromEntries(
        [...resultUnits.keys(), ...PARTS].map((id) => [
            id,
            FROM_INCOMING.has(id) ? "incoming" : "current",
        ]),
    ) as Record<string, MergeSide>;
    const slots = new PlaneSlots(indexes);
    const keptSlots = ["Process_1", "Sub_1"].map((owner) => slots.slotOf(owner));
    const assignment = PlaneAssignment.of({
        indexes,
        drawingSides: new DrawingSides(sides, PARTS, new Set(resultUnits.keys())),
        resultUnits,
        slots,
        keptSlots,
    });
    return { assignment, slots, keptSlots };
}

let assignment: PlaneAssignment;
let slots: PlaneSlots;
let keptSlots: readonly PlaneSlot[];

beforeAll(async () => {
    ({ assignment, slots, keptSlots } = await assignmentOf(CURRENT, INCOMING));
});

const slotDrawing = (elementId: string) =>
    keptSlots.filter((slot) => assignment.membersOf(slot).has(elementId));

describe("PlaneAssignment", () => {
    it.each<[string, string, string | undefined]>([
        ["a shape inside a collapsed sub-process", "Task_In", "Sub_1"],
        ["a part inside a collapsed sub-process", "Input_Sub", "Sub_1"],
        ["a shape inside a sub-process its drawing side expands", "Task_Ex", "Process_1"],
        ["a shape of a process", "Task_A", "Process_1"],
        [
            "a shape on a collaboration's plane, which shares its process's root slot",
            "Pool_1",
            "Process_1",
        ],
        [
            "a shape whose own root slot the result lacks, on the first root slot",
            "Task_Other",
            "Process_1",
        ],
        ["a shape of no decided element, where current draws it", "Task_Gone", "Sub_1"],
        ["a shape of no decided element on a plane the result drops", "Task_Dropped", undefined],
        ["an edge whose ends share a slot", "Flow_In", "Sub_1"],
        ["an edge to an edge", "Association_ToFlow", "Process_1"],
        ["an edge whose ends lie on different slots", "Association_Across", undefined],
        ["an edge that lacks an end", "Association_Loose", undefined],
    ])("puts %s (%s) on the plane of %s", (_case, elementId, planeOwner) => {
        expect(slotDrawing(elementId)).toEqual(
            planeOwner === undefined ? [] : [slots.slotOf(planeOwner)],
        );
    });

    it("returns the edges no slot draws both ends of with their ends", () => {
        expect(assignment.undrawnEdges).toEqual([
            { id: "Association_Across", ends: { source: "Note_1", target: "Task_In" } },
            { id: "Association_Loose", ends: { source: "Task_A" } },
        ]);
    });

    it("gives a slot no drawing goes on no members", () => {
        expect(assignment.membersOf(slots.slotOf("Sub_2")).size).toBe(0);
    });

    describe("of a sub-process drawn twice", () => {
        const UNBOUNDED = `<bpmndi:BPMNShape id="Sub_1_unbounded" bpmnElement="Sub_1" />`;
        const EXPANDED = shape("Sub_1", ' isExpanded="true"');

        it.each([
            ["past a first drawing without bounds", [UNBOUNDED, EXPANDED]],
            ["before a later drawing without bounds", [EXPANDED, UNBOUNDED]],
        ])(
            "keeps the shape the layout reads and puts the contents where it does, %s",
            async (_case, sub1Drawings) => {
                const drawnTwice = await assignmentOf(
                    document([plane("Process_1", rootDrawings(sub1Drawings)), SUB_1_PLANE]),
                    INCOMING,
                );
                const rootMembers = drawnTwice.assignment.membersOf(
                    drawnTwice.slots.slotOf("Process_1"),
                );

                expect(rootMembers.get("Sub_1")?.id).toBe("Sub_1_di");
                expect(rootMembers.has("Task_In")).toBe(true);
            },
        );
    });

    it("puts the contents of a sub-process whose only shape lacks bounds where that shape does", async () => {
        const expandedWithoutBounds = await assignmentOf(
            document([
                plane(
                    "Process_1",
                    rootDrawings([
                        `<bpmndi:BPMNShape id="Sub_1_unbounded" bpmnElement="Sub_1" isExpanded="true" />`,
                    ]),
                ),
                SUB_1_PLANE,
            ]),
            INCOMING,
        );

        expect(
            expandedWithoutBounds.assignment
                .membersOf(expandedWithoutBounds.slots.slotOf("Process_1"))
                .has("Task_In"),
        ).toBe(true);
    });
});
