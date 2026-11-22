import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_EXECUTION_PROPERTY_FIXTURES } from "./__fixtures__/execution-properties";
import { KITCHEN_SINK_XML } from "./__fixtures__/kitchen-sink";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "./__fixtures__/mock-diff";
import { loadBpmnModdle } from "./bpmnModdleFactory";
import { type ElementSnapshot, elementSnapshots } from "./elementSnapshots";
import { elementXml } from "./elementXml";
import { walkContainment } from "./moddleContainment";
import { type ModdleElement, isType } from "./moddleElement";
import { isNamespaceDeclaration } from "./namespaceDeclarations";
import { trackedElementOf } from "./trackedElements";

const parseCount = vi.hoisted(() => ({ value: 0 }));

vi.mock("./bpmnModdleFactory", async (importOriginal) => {
    const original = await importOriginal<typeof import("./bpmnModdleFactory")>();
    return {
        ...original,
        loadBpmnModdle: async () => {
            const createBpmnModdle = await original.loadBpmnModdle();
            return (...args: Parameters<typeof createBpmnModdle>) => {
                const moddle = createBpmnModdle(...args);
                const fromXML = moddle.fromXML.bind(moddle);
                moddle.fromXML = (xml) => {
                    parseCount.value++;
                    return fromXML(xml);
                };
                return moddle;
            };
        },
    };
});

const BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";

const MERGE_LIKE_UNIT_TYPES = [
    "bpmn:Process",
    "bpmn:TextAnnotation",
    "bpmn:Association",
    "bpmn:Group",
    "bpmn:DataObject",
    "bpmn:Message",
    "bpmn:Error",
    "bpmn:Signal",
    "bpmn:Escalation",
    "bpmn:DataStore",
    "bpmn:ItemDefinition",
    "bpmn:Category",
];

function isMergeLikeUnit(element: ModdleElement): boolean {
    return (
        trackedElementOf(element) === element ||
        MERGE_LIKE_UNIT_TYPES.some((type) => isType(element, type))
    );
}

const TWO_POOLS_ONE_PROCESS_XML = `<bpmn:definitions xmlns:bpmn="${BPMN}" id="Definitions_1">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
    <bpmn:participant id="Participant_2" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" /></bpmn:process>
</bpmn:definitions>`;

const ASSOCIATION_WITHOUT_ID_XML = (
    source: string,
) => `<bpmn:definitions xmlns:bpmn="${BPMN}" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:dataObjectReference id="Ref_A" dataObjectRef="DataObject_1" />
    <bpmn:dataObjectReference id="Ref_B" dataObjectRef="DataObject_1" />
    <bpmn:dataObject id="DataObject_1" />
    <bpmn:task id="Task_1">
      <bpmn:property id="Property_1" />
      <bpmn:dataInputAssociation>
        <bpmn:sourceRef>${source}</bpmn:sourceRef>
        <bpmn:targetRef>Property_1</bpmn:targetRef>
      </bpmn:dataInputAssociation>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;

const SINGLE_DOCUMENTS: ReadonlyArray<readonly [string, string]> = [
    ["the kitchen sink", KITCHEN_SINK_XML],
    ["the mock diff before", MOCK_DIFF_BEFORE_XML],
    ["the mock diff after", MOCK_DIFF_AFTER_XML],
    ["two pools on one process", TWO_POOLS_ONE_PROCESS_XML],
    ["a data association without an id", ASSOCIATION_WITHOUT_ID_XML("Ref_A")],
];

const VERSION_PAIRS = ALL_EXECUTION_PROPERTY_FIXTURES.flatMap(({ name, before, after }) => [
    [`${name} (before)`, before, [before, after]] as const,
    [`${name} (after)`, after, [before, after]] as const,
]);

async function idsTrackedAsThemselves(xml: string): Promise<string[]> {
    const { rootElement } = await (await loadBpmnModdle())().fromXML(xml);
    const ids: string[] = [];
    walkContainment(rootElement, (element) => {
        if (element.id && trackedElementOf(element) === element) ids.push(element.id);
    });
    return ids;
}

async function expectXmlOfEveryUnitToMatchElementXml(
    xml: string,
    prefixSources?: readonly string[],
): Promise<void> {
    const snapshots = await elementSnapshots(xml, prefixSources ? { prefixSources } : undefined);

    expect([...snapshots.keys()].sort()).toEqual((await idsTrackedAsThemselves(xml)).sort());
    for (const [id, snapshot] of snapshots) {
        expect(snapshot.xml, id).toBe(await elementXml(xml, id, prefixSources));
    }
}

function bounds(x: number, y: number, width: number, height: number) {
    return { "type": "dc:Bounds", "dc:x": x, "dc:y": y, "dc:width": width, "dc:height": height };
}

function snapshotOf(snapshots: ReadonlyMap<string, ElementSnapshot>, id: string): ElementSnapshot {
    const snapshot = snapshots.get(id);
    if (!snapshot) throw new Error(`No snapshot for ${id}`);
    return snapshot;
}

describe("elementSnapshots", () => {
    beforeEach(() => {
        parseCount.value = 0;
    });

    describe("under the diff's unit rule", () => {
        it.each(SINGLE_DOCUMENTS)(
            "gives every unit of %s the text elementXml gives it",
            async (_label, xml) => {
                await expectXmlOfEveryUnitToMatchElementXml(xml);
            },
        );

        it.each(VERSION_PAIRS)(
            "gives every unit of %s the text elementXml gives it with shared prefix sources",
            async (_label, xml, prefixSources) => {
                await expectXmlOfEveryUnitToMatchElementXml(xml, prefixSources);
            },
        );

        it("lists the units in document order", async () => {
            const snapshots = await elementSnapshots(TWO_POOLS_ONE_PROCESS_XML);

            expect([...snapshots.keys()]).toEqual([
                "Collaboration_1",
                "Participant_1",
                "Participant_2",
                "Task_1",
            ]);
        });

        it("names the participant a pooled process is folded into as its elements' parent", async () => {
            const snapshots = await elementSnapshots(KITCHEN_SINK_XML);

            expect(snapshotOf(snapshots, "Task_1").parent).toBe("Part_1");
            expect(snapshotOf(snapshots, "Lane_A").parent).toBe("Part_1");
            expect(snapshotOf(snapshots, "Task_Orphan").parent).toBeUndefined();
            expect(snapshots.has("Proc_1")).toBe(false);
        });
    });

    describe("with a custom unit rule", () => {
        const PROCESS_AND_NOTES_XML = `<bpmn:definitions xmlns:bpmn="${BPMN}" id="Definitions_1">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
    <bpmn:textAnnotation id="CollabNote_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" />
    <bpmn:textAnnotation id="Note_1"><bpmn:text>check</bpmn:text></bpmn:textAnnotation>
  </bpmn:process>
</bpmn:definitions>`;
        const isProcessOrNoteUnit = (element: ModdleElement) =>
            trackedElementOf(element) === element ||
            isType(element, "bpmn:Process") ||
            isType(element, "bpmn:TextAnnotation");

        it("strips the custom units out of their parent and gives each its own snapshot", async () => {
            const snapshots = await elementSnapshots(PROCESS_AND_NOTES_XML, {
                isUnit: isProcessOrNoteUnit,
            });

            expect([...snapshots.keys()]).toEqual([
                "Collaboration_1",
                "Participant_1",
                "CollabNote_1",
                "Process_1",
                "Task_1",
                "Note_1",
            ]);
            expect(snapshotOf(snapshots, "Collaboration_1").xml).toBe(
                `<bpmn:collaboration xmlns:bpmn="${BPMN}" id="Collaboration_1" />`,
            );
            expect(snapshotOf(snapshots, "Participant_1").xml).toBe(
                `<bpmn:participant xmlns:bpmn="${BPMN}" id="Participant_1" processRef="Process_1" />`,
            );
            expect(snapshotOf(snapshots, "Process_1").xml).toBe(
                `<bpmn:process xmlns:bpmn="${BPMN}" id="Process_1" isExecutable="true" />`,
            );
            expect(snapshotOf(snapshots, "Note_1")).toMatchObject({
                type: "bpmn:TextAnnotation",
                parent: "Process_1",
                xml: `<bpmn:textAnnotation xmlns:bpmn="${BPMN}" id="Note_1">
  <bpmn:text>check</bpmn:text>
</bpmn:textAnnotation>`,
            });
            expect(snapshotOf(snapshots, "Task_1").parent).toBe("Process_1");
        });

        it.each([
            ["the diff's rule", undefined],
            ["a merge-like rule", isMergeLikeUnit],
        ])(
            "under %s, keeps an element without an id in its enclosing unit with its references",
            async (_label, isUnit) => {
                const options = isUnit ? { isUnit } : {};
                const [withRefA, withRefB] = await Promise.all([
                    elementSnapshots(ASSOCIATION_WITHOUT_ID_XML("Ref_A"), options),
                    elementSnapshots(ASSOCIATION_WITHOUT_ID_XML("Ref_B"), options),
                ]);
                const task = snapshotOf(withRefB, "Task_1");

                expect(task.content).toContain("<bpmn:sourceRef>Ref_B</bpmn:sourceRef>");
                expect(task.content).not.toBe(snapshotOf(withRefA, "Task_1").content);
                expect(task.references).toEqual([
                    { property: "bpmn:DataInputAssociation#sourceRef", target: "Ref_B" },
                ]);
            },
        );

        it("asks the rule only about semantic elements", async () => {
            const askedTypes = new Set<string>();

            await elementSnapshots(KITCHEN_SINK_XML, {
                isUnit: (element) => {
                    askedTypes.add(element.$type);
                    return isMergeLikeUnit(element);
                },
            });

            expect([...askedTypes].filter((type) => !type.startsWith("bpmn:"))).toEqual([]);
            expect(askedTypes.has("bpmn:Definitions")).toBe(false);
        });
    });

    describe("content", () => {
        it("is the xml the element has in the same document without derived references", async () => {
            const withoutDerived = KITCHEN_SINK_XML.replace(
                /<bpmn:(incoming|outgoing|flowNodeRef)>[^<]*<\/bpmn:\1>/g,
                "",
            );
            const [original, stripped] = await Promise.all([
                elementSnapshots(KITCHEN_SINK_XML),
                elementSnapshots(withoutDerived),
            ]);

            expect(withoutDerived).not.toBe(KITCHEN_SINK_XML);
            for (const [id, snapshot] of original) {
                expect(snapshot.content, id).toBe(snapshotOf(stripped, id).xml);
            }
            expect(snapshotOf(original, "Task_1").xml).toContain(
                "<bpmn:incoming>Flow_1</bpmn:incoming>",
            );
            expect(snapshotOf(original, "Lane_A").xml).toContain("<bpmn:flowNodeRef>");
        });

        it("does not change when only a flow is added at a node", async () => {
            const withFlow = KITCHEN_SINK_XML.replace(
                "<bpmn:incoming>Flow_4</bpmn:incoming>",
                "<bpmn:incoming>Flow_4</bpmn:incoming><bpmn:incoming>Flow_7</bpmn:incoming>",
            ).replace(
                '<bpmn:sequenceFlow id="Flow_6"',
                '<bpmn:sequenceFlow id="Flow_7" sourceRef="Start_1" targetRef="Sub_1" /><bpmn:sequenceFlow id="Flow_6"',
            );
            const [before, after] = await Promise.all([
                elementSnapshots(KITCHEN_SINK_XML),
                elementSnapshots(withFlow),
            ]);

            expect(snapshotOf(after, "Sub_1").xml).not.toBe(snapshotOf(before, "Sub_1").xml);
            expect(snapshotOf(after, "Sub_1").content).toBe(snapshotOf(before, "Sub_1").content);
        });

        it("does not change when an extension's namespace is the default instead of a prefix", async () => {
            const taskContentOf = async (task: string) =>
                snapshotOf(
                    await elementSnapshots(
                        `<bpmn:definitions xmlns:bpmn="${BPMN}" xmlns:x="urn:x" id="Definitions_1"><bpmn:process id="Process_1">${task}</bpmn:process></bpmn:definitions>`,
                    ),
                    "Task_1",
                ).content;
            const prefixed = await taskContentOf(
                '<bpmn:task id="Task_1"><bpmn:extensionElements><x:note /></bpmn:extensionElements></bpmn:task>',
            );

            await expect(
                taskContentOf(
                    '<bpmn:task id="Task_1" xmlns="urn:x"><bpmn:extensionElements><note /></bpmn:extensionElements></bpmn:task>',
                ),
            ).resolves.toBe(prefixed);
            await expect(taskContentOf('<bpmn:task id="Task_1" xmlns="urn:x" />')).resolves.toBe(
                await taskContentOf('<bpmn:task id="Task_1" />'),
            );
        });
    });

    describe("attributes", () => {
        /** The attribute names of the snippet's first start tag, namespace declarations left out. */
        function startTagAttributeNames(xml: string): string[] {
            const attributes = /^<[^\s/>]+([^>]*?)\/?>/.exec(xml)?.[1] ?? "";
            return [...attributes.matchAll(/([^\s=]+)="/g)]
                .map(([, name]) => name)
                .filter((name) => !isNamespaceDeclaration(name))
                .sort();
        }

        it.each([
            ...SINGLE_DOCUMENTS.map(([label, xml]) => [label, xml, undefined] as const),
            ...VERSION_PAIRS,
        ])(
            "are the ones each unit's start tag writes in %s",
            async (_label, xml, prefixSources) => {
                const snapshots = await elementSnapshots(xml, {
                    isUnit: isMergeLikeUnit,
                    ...(prefixSources === undefined ? {} : { prefixSources }),
                });

                for (const [id, snapshot] of snapshots) {
                    expect({ id, names: Object.keys(snapshot.attributes).sort() }).toStrictEqual({
                        id,
                        names: startTagAttributeNames(snapshot.xml),
                    });
                }
            },
        );

        it("keep an engine attribute at its default, and leave out a BPMN default, as the start tag does", async () => {
            const snapshots = await elementSnapshots(
                `<bpmn:definitions xmlns:bpmn="${BPMN}" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:itemDefinition id="Item_1" />
  <bpmn:error id="Error_1" structureRef="Item_1" />
  <bpmn:dataStore id="DataStore_1" name="Ledger" isUnlimited="true" />
  <bpmn:process id="Process_1" isExecutable="false" camunda:isStartableInTasklist="true" />
</bpmn:definitions>`,
                { isUnit: isMergeLikeUnit },
            );

            expect(snapshotOf(snapshots, "Process_1").attributes).toStrictEqual({
                "id": "Process_1",
                "isExecutable": "false",
                "camunda:isStartableInTasklist": "true",
            });
            expect(snapshotOf(snapshots, "DataStore_1").attributes).toStrictEqual({
                id: "DataStore_1",
                name: "Ledger",
            });
            expect(snapshotOf(snapshots, "Error_1").attributes).toStrictEqual({
                id: "Error_1",
                structureRef: "Item_1",
            });
        });
    });

    describe("on the kitchen sink with merge-like units", () => {
        let snapshots: ReadonlyMap<string, ElementSnapshot>;

        beforeEach(async () => {
            snapshots = await elementSnapshots(KITCHEN_SINK_XML, { isUnit: isMergeLikeUnit });
        });

        it.each([
            ["Collab_1", undefined],
            ["Part_1", "Collab_1"],
            ["MF_1", "Collab_1"],
            ["Group_1", "Collab_1"],
            ["CollabNote_1", "Collab_1"],
            ["Proc_1", undefined],
            ["Lane_A", "Proc_1"],
            ["Lane_A2", "Lane_A"],
            ["Task_1", "Proc_1"],
            ["Boundary_1", "Proc_1"],
            ["DO_1", "Proc_1"],
            ["Assoc_1", "Proc_1"],
            ["DIA_1", "Task_1"],
            ["Sub_1_Start", "Sub_1"],
            ["SubNote_1", "Sub_1"],
            ["Sub_C_Task", "Sub_C"],
            ["Task_Orphan", "Proc_Orphan"],
            ["Msg_1", undefined],
            ["Cat_1", undefined],
        ])("gives %s the parent %s", (id, parent) => {
            expect(snapshotOf(snapshots, id).parent).toBe(parent);
        });

        it.each([
            ["Start_1", ["Lane_A", "Lane_A1"]],
            ["Task_1", ["Lane_A", "Lane_A2"]],
            ["Gw_1", ["Lane_B"]],
            ["Undo_1", []],
            ["Flow_1", []],
            ["Lane_A2", []],
        ])("gives %s the lanes %j, outermost first", (id, lanes) => {
            expect(snapshotOf(snapshots, id).lanes).toEqual(lanes);
        });

        it.each([
            [
                "Task_1",
                [
                    { property: "bpmn:ServiceTask#default", target: "Flow_2" },
                    { property: "bpmn:DataInput#itemSubjectRef", target: "Item_1" },
                ],
            ],
            [
                "Boundary_1",
                [
                    { property: "bpmn:BoundaryEvent#attachedToRef", target: "Task_1" },
                    { property: "bpmn:ErrorEventDefinition#errorRef", target: "Err_1" },
                ],
            ],
            [
                "MF_1",
                [
                    { property: "bpmn:MessageFlow#sourceRef", target: "Part_2" },
                    { property: "bpmn:MessageFlow#targetRef", target: "Start_1" },
                    { property: "bpmn:MessageFlow#messageRef", target: "Msg_1" },
                ],
            ],
            [
                "DIA_1",
                [
                    { property: "bpmn:DataInputAssociation#sourceRef", target: "DORef_1" },
                    {
                        property: "bpmn:DataInputAssociation#targetRef",
                        target: "Task_1",
                        targetPart: "DIn_1",
                    },
                ],
            ],
            [
                "Group_1",
                [
                    {
                        property: "bpmn:Group#categoryValueRef",
                        target: "Cat_1",
                        targetPart: "CatVal_1",
                    },
                ],
            ],
            ["Part_1", [{ property: "bpmn:Participant#processRef", target: "Proc_1" }]],
            ["DORef_1", [{ property: "bpmn:DataObjectReference#dataObjectRef", target: "DO_1" }]],
            ["DSRef_1", [{ property: "bpmn:DataStoreReference#dataStoreRef", target: "Store_1" }]],
            ["Start_1", [{ property: "bpmn:MessageEventDefinition#messageRef", target: "Msg_1" }]],
            [
                "CompAssoc_1",
                [
                    { property: "bpmn:Association#sourceRef", target: "CompBoundary_1" },
                    { property: "bpmn:Association#targetRef", target: "Undo_1" },
                ],
            ],
            ["Lane_A", []],
            ["Gw_1", [{ property: "bpmn:ExclusiveGateway#default", target: "Flow_4" }]],
        ])("lists %s's references without derived and internal ones", (id, references) => {
            expect(snapshotOf(snapshots, id).references).toEqual(references);
        });

        it.each([
            ["Task_1", ["IoSpec_1", "DIn_1", "DOut_1", "InSet_1", "OutSet_1"]],
            ["Proc_1", ["LaneSet_1"]],
            ["Lane_A", ["LaneSet_A"]],
            ["Start_1", ["MED_1"]],
            ["Boundary_1", ["EED_1"]],
            ["Cat_1", ["CatVal_1"]],
            ["Msg_1", []],
            ["Sub_C", []],
            ["Flow_5", []],
        ])("gives %s the parts %j, its own elements with an id", (id, parts) => {
            expect(snapshotOf(snapshots, id).parts).toEqual(parts);
        });

        it.each([
            ["Lane_A", "LaneSet_1"],
            ["Lane_B", "LaneSet_1"],
            ["Lane_A1", "LaneSet_A"],
            ["Lane_A2", "LaneSet_A"],
            ["Task_1", undefined],
            ["DIA_1", undefined],
            ["Part_1", undefined],
            ["Proc_1", undefined],
            ["Msg_1", undefined],
        ])("gives %s the container %s inside its parent", (id, container) => {
            expect(snapshotOf(snapshots, id).container).toBe(container);
        });

        it.each([
            ["Task_1", "Collab_1"],
            ["Part_1", "Collab_1"],
            ["MF_1", "Collab_1"],
            ["Sub_C", "Collab_1"],
            ["Sub_C_Task", "Sub_C"],
            ["Collab_1", undefined],
            ["Proc_1", undefined],
            ["Task_Orphan", undefined],
        ])("gives %s the plane %s it is drawn on", (id, plane) => {
            expect(snapshotOf(snapshots, id).plane).toBe(plane);
        });

        it("leaves undefined facts out of the snapshot", () => {
            const message = snapshotOf(snapshots, "Msg_1");

            expect(Object.keys(message)).not.toContain("container");
            expect(Object.keys(message)).not.toContain("plane");
        });

        it("draws a shape with its bounds, label and own DI attributes only", () => {
            expect(JSON.parse(snapshotOf(snapshots, "Start_1").layout!)).toEqual([
                {
                    "type": "bpmndi:BPMNShape",
                    "plane": "Collab_1",
                    "di:bounds": bounds(100, 32, 36, 36),
                    "bpmndi:label": {
                        "type": "bpmndi:BPMNLabel",
                        "di:bounds": bounds(90, 75, 56, 14),
                    },
                },
            ]);
            expect(JSON.parse(snapshotOf(snapshots, "Task_1").layout!)).toEqual([
                {
                    "type": "bpmndi:BPMNShape",
                    "plane": "Collab_1",
                    "di:bounds": bounds(200, 110, 100, 80),
                    "bioc:stroke": "#1e88e5",
                    "color:background-color": "#bbdefb",
                },
            ]);
            expect(JSON.parse(snapshotOf(snapshots, "Gw_1").layout!)).toEqual([
                expect.objectContaining({ "bpmndi:isMarkerVisible": true }),
            ]);
        });

        it("draws an edge with its waypoints", () => {
            expect(JSON.parse(snapshotOf(snapshots, "MF_1").layout!)).toEqual([
                {
                    "type": "bpmndi:BPMNEdge",
                    "plane": "Collab_1",
                    "di:waypoint": [
                        { "type": "dc:Point", "dc:x": 118, "dc:y": -100 },
                        { "type": "dc:Point", "dc:x": 118, "dc:y": 32 },
                    ],
                },
            ]);
        });

        it("draws a collapsed sub-process with its shape and its own plane, not its children's shapes", () => {
            expect(JSON.parse(snapshotOf(snapshots, "Sub_C").layout!)).toEqual([
                {
                    "type": "bpmndi:BPMNShape",
                    "plane": "Collab_1",
                    "di:bounds": bounds(850, 260, 100, 80),
                    "bpmndi:isExpanded": false,
                },
                { type: "bpmndi:BPMNPlane" },
            ]);
            expect(JSON.parse(snapshotOf(snapshots, "Sub_C_Task").layout!)).toEqual([
                expect.objectContaining({ plane: "Sub_C" }),
            ]);
        });

        it.each(["Note_1", "Group_1", "Assoc_1", "DIA_1", "Lane_A2"])("draws %s", (id) => {
            expect(snapshotOf(snapshots, id).layout).toBeDefined();
        });

        it.each(["Proc_1", "Msg_1", "Task_Orphan", "DO_1"])("leaves %s undrawn", (id) => {
            expect(snapshotOf(snapshots, id).layout).toBeUndefined();
        });
    });

    describe("layout", () => {
        const drawn = (shape: string) => `<bpmn:definitions xmlns:bpmn="${BPMN}"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"
  xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0"
  xmlns:custom="urn:miragon:custom" id="Definitions_1">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" /></bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      ${shape}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
        const layoutOf = async (xml: string) =>
            snapshotOf(await elementSnapshots(xml), "Task_1").layout;

        const BOUNDS = '<dc:Bounds x="100" y="80" width="100" height="80" />';
        const shape = (content: string, attributes = "") =>
            `<bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1" ${attributes}>${content}</bpmndi:BPMNShape>`;

        it("does not change with DI ids, attribute order or number spelling", async () => {
            const original = await layoutOf(
                drawn(
                    '<bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1" bioc:stroke="#000" color:background-color="#fff" custom:a="1" custom:b="2"><dc:Bounds x="100" y="80" width="100" height="80" /></bpmndi:BPMNShape>',
                ),
            );
            const respelled = await layoutOf(
                drawn(
                    '<bpmndi:BPMNShape custom:b="2" color:background-color="#fff" bpmnElement="Task_1" id="Shape_9" custom:a="1" bioc:stroke="#000"><dc:Bounds height="80" width="100.0" y="80" x="100" /></bpmndi:BPMNShape>',
                ),
            );

            expect(original).toContain('"custom:a":"1"');
            expect(respelled).toBe(original);
        });

        it("does not change when an extension's namespace is the default instead of a prefix", async () => {
            const prefixed = await layoutOf(
                drawn(shape(`<di:extension><custom:note /></di:extension>${BOUNDS}`)),
            );

            await expect(
                layoutOf(
                    drawn(
                        shape(
                            `<di:extension><note xmlns="urn:miragon:custom" /></di:extension>${BOUNDS}`,
                        ),
                    ),
                ),
            ).resolves.toBe(prefixed);
        });

        it.each([
            ["a moved shape", shape('<dc:Bounds x="101" y="80" width="100" height="80" />')],
            ["an unknown attribute", shape(BOUNDS, 'custom:hint="left"')],
            [
                "a second shape",
                shape(BOUNDS) +
                    '<bpmndi:BPMNShape id="Other" bpmnElement="Task_1" bioc:fill="#f00" />',
            ],
            [
                "a DI extension",
                shape(`<di:extension><custom:note text="moved" /></di:extension>${BOUNDS}`),
            ],
            [
                "the text inside a DI extension",
                shape(
                    `<di:extension><custom:note><custom:line>two</custom:line></custom:note></di:extension>${BOUNDS}`,
                ),
                shape(
                    `<di:extension><custom:note><custom:line>one</custom:line></custom:note></di:extension>${BOUNDS}`,
                ),
            ],
        ])("changes with %s", async (_label, changed, original = shape(BOUNDS)) => {
            const originalLayout = await layoutOf(drawn(original));

            expect(originalLayout).toBeDefined();
            await expect(layoutOf(drawn(changed))).resolves.not.toBe(originalLayout);
        });

        const withDiReferences = ({
            startShapeId = "Start_1_di",
            styleId = "Style_1",
            font = '<dc:Font name="Arial" size="9" />',
        } = {}) => `<bpmn:definitions xmlns:bpmn="${BPMN}"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="Start_1" />
    <bpmn:task id="Task_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="${startShapeId}" bpmnElement="Start_1"><dc:Bounds x="0" y="0" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="100" y="0" width="100" height="80" /><bpmndi:BPMNLabel labelStyle="${styleId}" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1" sourceElement="${startShapeId}" targetElement="Task_1_di"><di:waypoint x="36" y="18" /><di:waypoint x="100" y="18" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
    <bpmndi:BPMNLabelStyle id="${styleId}">${font}</bpmndi:BPMNLabelStyle>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
        const layouts = async (xml: string) => {
            const snapshots = await elementSnapshots(xml, { rejectWarnings: true });
            return ["Start_1", "Task_1", "Flow_1"].map((id) => snapshotOf(snapshots, id).layout);
        };

        describe("place", () => {
            const placeOf = async (xml: string, id = "Task_1") =>
                snapshotOf(await elementSnapshots(xml), id).place;

            it.each([
                ["a colour", shape(BOUNDS, 'bioc:stroke="#f00" color:background-color="#fff"')],
                [
                    "a label",
                    shape(
                        `${BOUNDS}<bpmndi:BPMNLabel><dc:Bounds x="90" y="170" width="120" height="14" /></bpmndi:BPMNLabel>`,
                    ),
                ],
                ["an unknown attribute", shape(BOUNDS, 'custom:hint="left"')],
                [
                    "number spelling",
                    shape('<dc:Bounds x="100.0" y="80" width="100" height="80" />'),
                ],
            ])("stays the same with %s", async (_label, changed) => {
                const original = await placeOf(drawn(shape(BOUNDS)));

                expect(original).toBeDefined();
                await expect(placeOf(drawn(changed))).resolves.toBe(original);
            });

            it.each([
                ["a moved shape", shape('<dc:Bounds x="101" y="80" width="100" height="80" />')],
                ["a resized shape", shape('<dc:Bounds x="100" y="80" width="120" height="80" />')],
            ])("changes with %s", async (_label, changed) => {
                const original = await placeOf(drawn(shape(BOUNDS)));

                await expect(placeOf(drawn(changed))).resolves.not.toBe(original);
            });

            it("is undefined for an element only an edge draws", async () => {
                await expect(placeOf(withDiReferences(), "Flow_1")).resolves.toBeUndefined();
                await expect(placeOf(withDiReferences(), "Task_1")).resolves.toBeDefined();
            });
        });

        it("writes an edge's ends by the elements their shapes draw, not by the shapes' ids", async () => {
            const original = await layouts(withDiReferences());

            expect(original[2]).toContain('"bpmndi:sourceElement":"Start_1"');
            expect(original[2]).toContain('"bpmndi:targetElement":"Task_1"');
            await expect(layouts(withDiReferences({ startShapeId: "Shape_9" }))).resolves.toEqual(
                original,
            );
        });

        it("writes a label style by its content, not by its id", async () => {
            const original = await layouts(withDiReferences());

            await expect(layouts(withDiReferences({ styleId: "Style_9" }))).resolves.toEqual(
                original,
            );
            await expect(
                layouts(withDiReferences({ font: '<dc:Font name="Arial" size="12" />' })),
            ).resolves.not.toEqual(original);
        });
    });

    describe("rejecting parse warnings", () => {
        const UNRESOLVED_XML = `<bpmn:definitions xmlns:bpmn="${BPMN}" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="Start_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Missing_Node" />
  </bpmn:process>
</bpmn:definitions>`;

        it("rejects an unresolved reference, naming it", async () => {
            await expect(
                elementSnapshots(UNRESOLVED_XML, { rejectWarnings: true }),
            ).rejects.toThrow(/^Failed to parse BPMN: .*unresolved reference <Missing_Node>/);
        });

        it("by default, accepts an unresolved reference as elementXml does", async () => {
            const snapshots = await elementSnapshots(UNRESOLVED_XML);

            expect(snapshotOf(snapshots, "Flow_1").xml).toBe(
                await elementXml(UNRESOLVED_XML, "Flow_1"),
            );
        });

        it("accepts a document that parses without warnings", async () => {
            await expect(
                elementSnapshots(KITCHEN_SINK_XML, { rejectWarnings: true }),
            ).resolves.toBeDefined();
        });
    });

    it("parses the document once however many units it has", async () => {
        await elementSnapshots(KITCHEN_SINK_XML, { prefixSources: [MOCK_DIFF_AFTER_XML] });

        expect(parseCount.value).toBe(1);
    });

    it("rejects on invalid XML", async () => {
        await expect(elementSnapshots("this is not xml")).rejects.toThrow();
    });

    it("rejects, as elementXml does, when the parser skips content", async () => {
        const xml = `<bpmn:definitions xmlns:bpmn="${BPMN}" id="Definitions_1">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" undeclared:owner="billing" /></bpmn:process>
</bpmn:definitions>`;

        await expect(elementSnapshots(xml)).rejects.toThrow(/unparsable content/i);
    });
});
