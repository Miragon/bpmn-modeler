import { type ElementSnapshot, elementSnapshots, loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { scenarioNamed } from "./__fixtures__/mergeScenarios";
import {
    type BuildExpectations,
    checkMergedXml,
    requireDrawingsOnTheirContainersPlane,
    requireDrawingsReachableFromTheirRootPlane,
    requireEdgesOnThePlaneOfTheirEnds,
    requireNoParserWarnings,
    requireOneDrawingPerDrawnElement,
    requireRebuiltDerivedReferences,
    requireSourceContent,
} from "./buildChecks";
import { DiagramIndex } from "./diagramIndex";
import { moddleFor } from "./engineModdle";
import { isMergeElement } from "./mergeElements";

const valid = scenarioNamed("table: unchanged").current;
const TASK_CHECK_SHAPE = /<bpmndi:BPMNShape id="Task_Check_di"[\s\S]*?<\/bpmndi:BPMNShape>/;
const NONE_RESTORED: ReadonlyMap<string, string> = new Map();

async function parse(xml: string) {
    return (await loadBpmnModdle())().fromXML(xml);
}

function snapshotsOf(xml: string) {
    return elementSnapshots(xml, { prefixSources: [valid], isUnit: isMergeElement });
}

function laneMembersOf(snapshots: ReadonlyMap<string, ElementSnapshot>) {
    const members = new Map<string, Set<string>>();
    for (const snapshot of snapshots.values()) {
        if (snapshot.type === "bpmn:Lane")
            members.set(snapshot.id, members.get(snapshot.id) ?? new Set());
        for (const lane of snapshot.lanes) {
            members.set(lane, (members.get(lane) ?? new Set()).add(snapshot.id));
        }
    }
    return members;
}

async function expectationsFor(xml: string): Promise<BuildExpectations> {
    const snapshots = await snapshotsOf(xml);
    return {
        sourceSnapshots: snapshots,
        drawnByShape: new Set(["Task_Check", "Flow_Start", "Lane_Clerk"]),
        laneMembers: laneMembersOf(snapshots),
        restoredDefaults: NONE_RESTORED,
    };
}

describe("checkMergedXml", () => {
    it("accepts a file that holds what was decided", async () => {
        await expect(
            checkMergedXml(valid, await expectationsFor(valid), await moddleFor([valid])),
        ).resolves.toBeUndefined();
    });

    it("refuses a file that dropped an unknown attribute of a taken element", async () => {
        const dropped = valid.replace(' custom:owner="billing"', "");

        await expect(
            checkMergedXml(dropped, await expectationsFor(valid), await moddleFor([valid])),
        ).rejects.toThrow("elements differ from the side they are taken from: Task_Check");
    });
});

describe("requireNoParserWarnings", () => {
    it.each([
        {
            broken: "an unresolved reference",
            xml: valid.replace('sourceRef="Start_Order"', 'sourceRef="Missing_Node"'),
            named: "Missing_Node",
        },
        {
            broken: "a duplicate id",
            xml: valid.replace('id="Task_Reject"', 'id="Task_Check"'),
            named: "duplicate ID <Task_Check>",
        },
        {
            broken: "an undeclared prefix",
            xml: valid.replace('custom:owner="billing"', 'custom:owner="billing" foo:flag="yes"'),
            named: "foo",
        },
    ])("refuses $broken", async ({ xml, named }) => {
        const parsed = await parse(xml);

        expect(() => requireNoParserWarnings(parsed)).toThrow(named);
    });

    it("accepts a file that parses cleanly", async () => {
        const parsed = await parse(valid);

        expect(() => requireNoParserWarnings(parsed)).not.toThrow();
    });
});

describe("requireOneDrawingPerDrawnElement", () => {
    const drawn = new Set(["Task_Check"]);

    it("refuses an element with two shapes", async () => {
        const shape = TASK_CHECK_SHAPE.exec(valid)![0];
        const twice = valid.replace(
            shape,
            `${shape}\n${shape.replace('id="Task_Check_di"', 'id="Task_Check_di_2"')}`,
        );

        const definitions = (await parse(twice)).rootElement;

        expect(() => requireOneDrawingPerDrawnElement(DiagramIndex.of(definitions), drawn)).toThrow(
            "elements have more than one shape or edge: Task_Check",
        );
    });

    it("refuses a drawn element without a shape", async () => {
        const undrawn = valid.replace(TASK_CHECK_SHAPE, "");

        const definitions = (await parse(undrawn)).rootElement;

        expect(() => requireOneDrawingPerDrawnElement(DiagramIndex.of(definitions), drawn)).toThrow(
            "drawn elements have no shape or edge: Task_Check",
        );
    });

    it("accepts one shape per drawn element", async () => {
        const definitions = (await parse(valid)).rootElement;

        expect(() =>
            requireOneDrawingPerDrawnElement(DiagramIndex.of(definitions), drawn),
        ).not.toThrow();
    });
});

describe("requireRebuiltDerivedReferences", () => {
    it("refuses a stale outgoing flow", async () => {
        const stale = valid.replace("<bpmn:outgoing>Flow_Checked</bpmn:outgoing>", "");
        const { laneMembers } = await expectationsFor(valid);

        const definitions = (await parse(stale)).rootElement;

        expect(() => requireRebuiltDerivedReferences(definitions, laneMembers)).toThrow(
            "derived references do not match the flows and lane decisions: Task_Check",
        );
    });

    it("refuses a stale incoming flow", async () => {
        const stale = valid.replace("<bpmn:incoming>Flow_Checked</bpmn:incoming>", "");
        const { laneMembers } = await expectationsFor(valid);

        const definitions = (await parse(stale)).rootElement;

        expect(() => requireRebuiltDerivedReferences(definitions, laneMembers)).toThrow(
            "Gateway_Ok",
        );
    });

    it("refuses a lane whose nodes differ from the lane decisions", async () => {
        const { laneMembers } = await expectationsFor(valid);
        const moved = new Map(laneMembers);
        moved.set(
            "Lane_Clerk",
            new Set([...laneMembers.get("Lane_Clerk")!].filter((id) => id !== "Task_Check")),
        );

        const definitions = (await parse(valid)).rootElement;

        expect(() => requireRebuiltDerivedReferences(definitions, moved)).toThrow(
            "derived references do not match the flows and lane decisions: Lane_Clerk",
        );
    });

    it("refuses a lane that lists one node twice and misses another", async () => {
        const { laneMembers } = await expectationsFor(valid);
        const [kept, missed] = [...laneMembers.get("Lane_Clerk")!];
        const repeated = valid.replace(
            `<bpmn:flowNodeRef>${missed}</bpmn:flowNodeRef>`,
            `<bpmn:flowNodeRef>${kept}</bpmn:flowNodeRef>`,
        );

        const definitions = (await parse(repeated)).rootElement;

        expect(() => requireRebuiltDerivedReferences(definitions, laneMembers)).toThrow(
            "derived references do not match the flows and lane decisions: Lane_Clerk",
        );
    });

    it("refuses a boundary event an activity lists while it is attached to another", async () => {
        const stale = valid.replace(
            "<bpmn:outgoing>Flow_Rejected</bpmn:outgoing>",
            "<bpmn:outgoing>Flow_Rejected</bpmn:outgoing>\n      <bpmn:boundaryEventRefs>Boundary_Timeout</bpmn:boundaryEventRefs>",
        );
        const { laneMembers } = await expectationsFor(valid);

        const definitions = (await parse(stale)).rootElement;

        expect(() => requireRebuiltDerivedReferences(definitions, laneMembers)).toThrow(
            "derived references do not match the flows and lane decisions: Task_Reject",
        );
    });

    it("accepts a boundary event its host lists", async () => {
        const listed = valid.replace(
            "<bpmn:outgoing>Flow_Checked</bpmn:outgoing>",
            "<bpmn:outgoing>Flow_Checked</bpmn:outgoing>\n      <bpmn:boundaryEventRefs>Boundary_Timeout</bpmn:boundaryEventRefs>",
        );
        const { laneMembers } = await expectationsFor(valid);

        const definitions = (await parse(listed)).rootElement;

        expect(() => requireRebuiltDerivedReferences(definitions, laneMembers)).not.toThrow();
    });

    it("accepts references that match", async () => {
        const { laneMembers } = await expectationsFor(valid);

        const definitions = (await parse(valid)).rootElement;

        expect(() => requireRebuiltDerivedReferences(definitions, laneMembers)).not.toThrow();
    });
});

describe("requireSourceContent", () => {
    it("refuses an element whose content differs from its side's", async () => {
        const renamed = await snapshotsOf(
            valid.replace('name="Check order"', 'name="Check later"'),
        );

        const source = await snapshotsOf(valid);

        expect(() => requireSourceContent(renamed, source, NONE_RESTORED)).toThrow(
            "elements differ from the side they are taken from: Task_Check",
        );
    });

    it("refuses an element in another lane than its side's", async () => {
        const source = await snapshotsOf(valid);
        const moved = new Map(source);
        moved.set("Task_Reject", { ...source.get("Task_Reject")!, lanes: ["Lane_Clerk"] });

        expect(() => requireSourceContent(moved, source, NONE_RESTORED)).toThrow(": Task_Reject");
    });

    it("refuses an element in another container than its side's", async () => {
        const source = await snapshotsOf(valid);
        const moved = new Map(source);
        moved.set("Task_Reject", { ...source.get("Task_Reject")!, parent: "Sub_Ship" });

        expect(() => requireSourceContent(moved, source, NONE_RESTORED)).toThrow(": Task_Reject");
    });

    it("refuses a missing and an unexpected element", async () => {
        const source = await snapshotsOf(valid);
        const result = new Map(source);
        result.delete("Task_Reject");
        result.set("Task_Stray", source.get("Task_Check")!);

        expect(() => requireSourceContent(result, source, NONE_RESTORED)).toThrow(
            ": Task_Reject, Task_Stray",
        );
    });

    describe("with a default flow the build restored", () => {
        const withoutDefault = valid.replace(' default="Flow_No"', "");
        const restored = new Map([["Gateway_Ok", "Flow_No"]]);

        it("accepts the source as its side wrote it with that default added", async () => {
            expect(withoutDefault).not.toBe(valid);
            const source = await snapshotsOf(withoutDefault);
            const result = await snapshotsOf(valid);

            expect(() => requireSourceContent(result, source, restored)).not.toThrow();
        });

        it.each([
            ["without the default", withoutDefault],
            ["naming another default", valid.replace('default="Flow_No"', 'default="Flow_Yes"')],
        ])("refuses the source %s", async (_name, merged) => {
            const source = await snapshotsOf(withoutDefault);
            const result = await snapshotsOf(merged);

            expect(() => requireSourceContent(result, source, restored)).toThrow(": Gateway_Ok");
        });
    });
});

describe("requireDrawingsReachableFromTheirRootPlane", () => {
    const withSecondPoolOnTheRootPlane = valid
        .replace(
            '<bpmn:collaboration id="Collaboration_1">',
            `<bpmn:collaboration id="Collaboration_2">
    <bpmn:participant id="Participant_Store" name="Store" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:collaboration id="Collaboration_1">`,
        )
        .replace(
            '<bpmndi:BPMNShape id="Participant_Shop_di"',
            `<bpmndi:BPMNShape id="Participant_Store_di" bpmnElement="Participant_Store" isHorizontal="true">
        <dc:Bounds x="120" y="600" width="1100" height="400" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Participant_Shop_di"`,
        );

    it("refuses a pool drawn on the plane of another collaboration", async () => {
        const parsed = await parse(withSecondPoolOnTheRootPlane);

        expect(() =>
            requireDrawingsReachableFromTheirRootPlane(DiagramIndex.of(parsed.rootElement)),
        ).toThrow("drawings lie on a root plane that does not reach them: Participant_Store");
    });

    it("accepts a process with lanes that no pool names on a collaboration's plane", async () => {
        const parsed = await parse(valid.replace(' processRef="Process_1"', ""));

        expect(() =>
            requireDrawingsReachableFromTheirRootPlane(DiagramIndex.of(parsed.rootElement)),
        ).not.toThrow();
    });

    it("accepts a collaboration's plane that draws its pools, their processes and its message flows", async () => {
        const parsed = await parse(valid);

        expect(() =>
            requireDrawingsReachableFromTheirRootPlane(DiagramIndex.of(parsed.rootElement)),
        ).not.toThrow();
    });

    describe("a task of a process without lanes", () => {
        const taskOnThePlaneOf = (
            planeOwner: string,
            participant: string,
        ) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collab_1">${participant}</bpmn:collaboration>
  <bpmn:process id="Process_A"><bpmn:task id="Task_A" /></bpmn:process>
  <bpmn:process id="Process_B" />
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="${planeOwner}">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="100" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
        const check = async (xml: string) => {
            const index = DiagramIndex.of((await parse(xml)).rootElement);
            return () => requireDrawingsReachableFromTheirRootPlane(index);
        };

        it.each<[string, string, string]>([
            ["its own process's plane", "Process_A", ""],
            [
                "the plane of a collaboration a participant without an id names it in",
                "Collab_1",
                '<bpmn:participant processRef="Process_A" />',
            ],
        ])("is accepted on %s", async (_case, planeOwner, participant) => {
            expect(await check(taskOnThePlaneOf(planeOwner, participant))).not.toThrow();
        });

        it.each<[string, string, string]>([
            ["another process's plane", "Process_B", ""],
            [
                "the plane of a collaboration that names only another process",
                "Collab_1",
                '<bpmn:participant id="Pool_B" processRef="Process_B" />',
            ],
        ])("is refused on %s", async (_case, planeOwner, participant) => {
            expect(await check(taskOnThePlaneOf(planeOwner, participant))).toThrow(
                "drawings lie on a root plane that does not reach them: Task_A",
            );
        });
    });
});

describe("requireDrawingsOnTheirContainersPlane", () => {
    const definitionsWith = (subProcessShape: string, subProcessPlane: string, rootExtra = "") =>
        `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:subProcess id="Sub_1">
      <bpmn:subProcess id="Sub_2">
        <bpmn:task id="Task_Deep" />
      </bpmn:subProcess>
      <bpmn:task id="Task_In" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
${subProcessShape}${rootExtra}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>${subProcessPlane}
</bpmn:definitions>
`;
    const shape = (id: string, extra = "") =>
        `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${extra}>
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>`;
    const subPlane = (content: string) => `
  <bpmndi:BPMNDiagram id="BPMNDiagram_Sub_1">
    <bpmndi:BPMNPlane id="BPMNPlane_Sub_1" bpmnElement="Sub_1">
${content}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;
    const contents = [shape("Sub_2", ' isExpanded="true"'), shape("Task_Deep"), shape("Task_In")];

    it.each([
        {
            drawing: "children of an expanded sub-process on its plane",
            xml: definitionsWith(
                [shape("Sub_1", ' isExpanded="true"'), ...contents].join("\n"),
                "",
            ),
        },
        {
            drawing:
                "children of an expanded sub-process with a plane of its own on its shape's plane",
            xml: definitionsWith(
                [shape("Sub_1", ' isExpanded="true"'), ...contents].join("\n"),
                subPlane(""),
            ),
        },
        {
            drawing: "children of a collapsed sub-process on its own plane",
            xml: definitionsWith(shape("Sub_1"), subPlane(contents.join("\n"))),
        },
        {
            drawing: "children of a collapsed sub-process without a plane of its own on its plane",
            xml: definitionsWith([shape("Sub_1"), ...contents].join("\n"), ""),
        },
    ])("accepts $drawing", async ({ xml }) => {
        const definitions = (await parse(xml)).rootElement;

        expect(() =>
            requireDrawingsOnTheirContainersPlane(DiagramIndex.of(definitions)),
        ).not.toThrow();
    });

    it.each([
        {
            drawing: "a child of a collapsed sub-process on the root plane",
            xml: definitionsWith(
                shape("Sub_1"),
                subPlane([shape("Sub_2", ' isExpanded="true"'), shape("Task_Deep")].join("\n")),
                `\n${shape("Task_In")}`,
            ),
            refused: ": Task_In",
        },
        {
            drawing: "a child of an expanded sub-process on another plane",
            xml: definitionsWith(
                [shape("Sub_1", ' isExpanded="true"'), shape("Sub_2", ' isExpanded="true"')].join(
                    "\n",
                ),
                subPlane([shape("Task_Deep"), shape("Task_In")].join("\n")),
            ),
            refused: ": Task_Deep, Task_In",
        },
    ])("refuses $drawing", async ({ xml, refused }) => {
        const definitions = (await parse(xml)).rootElement;

        expect(() => requireDrawingsOnTheirContainersPlane(DiagramIndex.of(definitions))).toThrow(
            `drawings lie on another plane than their sub-process implies${refused}`,
        );
    });
});

describe("requireEdgesOnThePlaneOfTheirEnds", () => {
    const definitionsWith = (rootPlane: string, subProcessPlane: string) =>
        `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:dataObject id="DataObject_1" />
    <bpmn:dataObjectReference id="DataRef_1" dataObjectRef="DataObject_1" />
    <bpmn:subProcess id="Sub_1">
      <bpmn:dataInputAssociation id="DataInput_Sub">
        <bpmn:sourceRef>DataRef_1</bpmn:sourceRef>
      </bpmn:dataInputAssociation>
      <bpmn:task id="Task_In" />
      <bpmn:sequenceFlow id="Flow_Out" sourceRef="Task_In" targetRef="Task_Out" />
    </bpmn:subProcess>
    <bpmn:task id="Task_Out" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
${rootPlane}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Sub_1">
    <bpmndi:BPMNPlane id="BPMNPlane_Sub_1" bpmnElement="Sub_1">
${subProcessPlane}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
    const shape = (id: string) =>
        `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>`;
    const edge = (id: string) =>
        `      <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">
        <di:waypoint x="100" y="100" />
        <di:waypoint x="200" y="100" />
      </bpmndi:BPMNEdge>`;
    const rootShapes = [shape("DataRef_1"), shape("Sub_1"), shape("Task_Out")];

    const planeChecksOf = async (xml: string) => {
        const diagramIndex = DiagramIndex.of((await parse(xml)).rootElement);
        return () => {
            requireEdgesOnThePlaneOfTheirEnds(diagramIndex);
            requireDrawingsOnTheirContainersPlane(diagramIndex);
        };
    };

    it("accepts a data input of a collapsed sub-process on the plane of the sub-process's shape", async () => {
        const xml = definitionsWith(
            [...rootShapes, edge("DataInput_Sub")].join("\n"),
            shape("Task_In"),
        );

        expect(await planeChecksOf(xml)).not.toThrow();
    });

    it.each([
        {
            edge: "a data input of a collapsed sub-process on the sub-process's own plane",
            xml: definitionsWith(
                rootShapes.join("\n"),
                [shape("Task_In"), edge("DataInput_Sub")].join("\n"),
            ),
            refused: "DataInput_Sub",
        },
        {
            edge: "a flow whose source lies on another plane",
            xml: definitionsWith([...rootShapes, edge("Flow_Out")].join("\n"), shape("Task_In")),
            refused: "Flow_Out",
        },
        {
            edge: "a flow whose target lies on another plane",
            xml: definitionsWith(
                rootShapes.join("\n"),
                [shape("Task_In"), edge("Flow_Out")].join("\n"),
            ),
            refused: "Flow_Out",
        },
    ])("refuses $edge", async ({ xml, refused }) => {
        expect(await planeChecksOf(xml)).toThrow(
            `edges lie on a plane that does not draw both of their ends: ${refused}`,
        );
    });

    it("makes checkMergedXml refuse a flow drawn on a plane without its ends", async () => {
        const offItsEnds = valid.replace(
            /(<bpmndi:BPMNEdge id="Flow_Ship_1_di"[\s\S]*?<\/bpmndi:BPMNEdge>)([\s\S]*?<\/bpmndi:BPMNDiagram>)/,
            `$2
  <bpmndi:BPMNDiagram id="BPMNDiagram_Sub_Ship">
    <bpmndi:BPMNPlane id="BPMNPlane_Sub_Ship" bpmnElement="Sub_Ship">
      $1
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`,
        );

        expect(offItsEnds).toContain('<bpmndi:BPMNPlane id="BPMNPlane_Sub_Ship"');
        await expect(
            checkMergedXml(offItsEnds, await expectationsFor(valid), await moddleFor([valid])),
        ).rejects.toThrow(
            "edges lie on a plane that does not draw both of their ends: Flow_Ship_1",
        );
    });
});
