import { describe, expect, it } from "vitest";

import { baseModel, cloneModel, nodeById, removeNode } from "./__fixtures__/baseModel";
import { renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { dockedVersions, dragNodes, recoloured } from "./__fixtures__/dockedModel";
import { MERGE_SCENARIOS, scenarioNamed } from "./__fixtures__/mergeScenarios";
import { computeMerge } from "./computeMerge";
import {
    type ElementState,
    type LayoutState,
    type MergeElement,
    type MergeResult,
} from "./mergeResult";

const MODELER_NAMESPACE = "http://camunda.org/schema/modeler/1.0";
const CAMUNDA_NAMESPACE = "http://camunda.org/schema/1.0/bpmn";
const ZEEBE_NAMESPACE = "http://camunda.org/schema/zeebe/1.0";
const CAMUNDA_7_PLATFORM = `xmlns:camunda="${CAMUNDA_NAMESPACE}" xmlns:modeler="${MODELER_NAMESPACE}" modeler:executionPlatform="Camunda Platform"`;

function engineDocument(
    definitionsAttributes: string,
    taskAttributes = "",
    { rootElements = "", processContent = "" } = {},
): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ${definitionsAttributes} id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  ${rootElements}
  <bpmn:process id="Process_1">
    ${processContent}
    <bpmn:task id="Task_1" ${taskAttributes} />
  </bpmn:process>
</bpmn:definitions>`;
}

function elementNamed(result: MergeResult, id: string): MergeElement {
    const element = result.elements.find((candidate) => candidate.id === id);
    if (!element) throw new Error(`no merge element ${id}`);
    return element;
}

function statesOtherThanUnchanged(result: MergeResult): Record<string, ElementState> {
    return Object.fromEntries(
        result.elements
            .filter((element) => element.state !== "unchanged")
            .map((element) => [element.id, element.state]),
    );
}

function layoutsOtherThanUnchanged(result: MergeResult): Record<string, LayoutState> {
    return Object.fromEntries(
        result.elements
            .filter((element) => element.layout !== "unchanged")
            .map((element) => [element.id, element.layout]),
    );
}

const TABLE_ROW_STATES: Readonly<Record<string, Readonly<Record<string, ElementState>>>> = {
    "table: unchanged": {},
    "table: taken from current": { Task_Check: "takenFromCurrent" },
    "table: taken from incoming": { Task_Reject: "takenFromIncoming" },
    "table: same change": { Gateway_Ok: "sameChange" },
    "table: both changed": { Task_Pack: "bothChanged" },
    "table: added by current": { Task_AddedByCurrent: "addedByCurrent" },
    "table: added by incoming": { Task_AddedByIncoming: "addedByIncoming" },
    "table: same addition": { Task_SameAddition: "sameAddition" },
    "table: both added": { Task_BothAdded: "bothAdded" },
    "table: removed by current": {
        Note_Check: "removedByCurrent",
        Association_Check: "removedByCurrent",
    },
    "table: removed by incoming": {
        End_Done: "removedByIncoming",
        Flow_Shipped: "removedByIncoming",
    },
    "table: removed by both": { DataRef_Order: "removedByBoth", DataInput_Order: "removedByBoth" },
    "table: removed and changed": {
        End_Rejected: "removedAndChanged",
        Flow_Rejected: "removedByCurrent",
    },
    "table: changed and removed": {
        Boundary_Timeout: "changedAndRemoved",
        Flow_Timeout: "removedByIncoming",
    },
};

const EVERY_TABLE_ROW: Readonly<Record<string, ElementState>> = Object.assign(
    {},
    ...Object.values(TABLE_ROW_STATES),
);

const TASK_REJECT_AND_ITS_FLOWS_MOVED: Readonly<Record<string, LayoutState>> = {
    Task_Reject: "bothChanged",
    Flow_No: "bothChanged",
    Flow_Rejected: "bothChanged",
    Flow_Timeout: "bothChanged",
};

describe("computeMerge classifies", () => {
    it.each(Object.entries(TABLE_ROW_STATES))("%s", async (name, states) => {
        expect(statesOtherThanUnchanged(await computeMerge(scenarioNamed(name)))).toEqual(states);
    });

    it.each(["c7", "c8"])("every row at once on %s", async (platform) => {
        const result = await computeMerge(scenarioNamed(`table: every row (${platform})`));
        expect(statesOtherThanUnchanged(result)).toEqual(EVERY_TABLE_ROW);
    });

    it("an added element's layout as taken from the side that drew it", async () => {
        const result = await computeMerge(scenarioNamed("table: every row (c7)"));
        expect(layoutsOtherThanUnchanged(result)).toEqual({
            Task_AddedByCurrent: "takenFromCurrent",
            Task_AddedByIncoming: "takenFromIncoming",
        });
    });

    it.each([
        {
            unchangedSide: "current",
            changes: ["takenFromIncoming", "addedByIncoming", "removedByIncoming"],
        },
        {
            unchangedSide: "incoming",
            changes: ["takenFromCurrent", "addedByCurrent", "removedByCurrent"],
        },
    ] as const)(
        "everything from the other side, without a conflict, when $unchangedSide equals the base",
        async ({ unchangedSide, changes }) => {
            const { base, current, incoming } = scenarioNamed("table: every row (c7)");
            const versions =
                unchangedSide === "current"
                    ? { base, current: base!, incoming }
                    : { base, current, incoming: base! };

            const states = new Set(
                (await computeMerge(versions)).elements.map((element) => element.state),
            );

            expect(states).toEqual(new Set(["unchanged", ...changes]));
        },
    );

    it("a move of an element's shapes apart from a change of their colour, and no move for a flow", async () => {
        const versions = dockedVersions(
            "c8",
            (model) => dragNodes(model, ["Task_C"], 0, 30),
            () => undefined,
        );

        const result = await computeMerge({ ...versions, incoming: recoloured(versions.incoming) });

        expect(elementNamed(result, "Task_C")).toMatchObject({
            layout: "bothChanged",
            moved: "takenFromCurrent",
        });
        expect(elementNamed(result, "Task_A")).toMatchObject({
            layout: "takenFromIncoming",
            moved: "unchanged",
        });
        expect(elementNamed(result, "Flow_Yes").moved).toBeUndefined();
    });

    it("a change of an unknown namespaced attribute", async () => {
        const result = await computeMerge(scenarioNamed("unknown namespaced attribute changed"));
        expect(statesOtherThanUnchanged(result)).toEqual({ Task_Check: "takenFromIncoming" });
    });

    it.each(["both moved the same way", "both moved differently"])(
        "the layout apart from the content when %s",
        async (name) => {
            const result = await computeMerge(scenarioNamed(name));

            expect(statesOtherThanUnchanged(result)).toEqual({});
            expect(layoutsOtherThanUnchanged(result)).toEqual(TASK_REJECT_AND_ITS_FLOWS_MOVED);
        },
    );

    it("a move into another lane as a change, the lanes themselves unchanged", async () => {
        const result = await computeMerge(scenarioNamed("moved into another lane"));
        const reject = elementNamed(result, "Task_Reject");

        expect(statesOtherThanUnchanged(result)).toEqual({ Task_Reject: "takenFromIncoming" });
        expect(reject.versions.base?.lanes).toEqual(["Lane_Manager"]);
        expect(reject.versions.incoming?.lanes).toEqual(["Lane_Clerk"]);
    });

    it("a move into a sub-process as a change, its containers unchanged", async () => {
        const result = await computeMerge(scenarioNamed("moved into a sub-process"));
        const label = elementNamed(result, "Task_Label");

        expect(statesOtherThanUnchanged(result)).toEqual({ Task_Label: "takenFromIncoming" });
        expect(label.versions.base?.parent).toBe("Process_1");
        expect(label.versions.incoming?.parent).toBe("Sub_Ship");
    });

    it("a move into a sub-process in the same lane as a change of the parent alone", async () => {
        const base = baseModel("c7");
        base.nodes.push({ id: "Task_Label", type: "task", x: 980, y: 120, lane: "Lane_Clerk" });
        const incoming = cloneModel(base);
        Object.assign(nodeById(incoming, "Task_Label"), { parent: "Sub_Ship", lane: undefined });

        const result = await computeMerge({
            base: renderBpmn(base),
            current: renderBpmn(base),
            incoming: renderBpmn(incoming),
        });
        const label = elementNamed(result, "Task_Label");

        expect(label.versions.incoming?.lanes).toEqual(label.versions.base?.lanes);
        expect(label.state).toBe("takenFromIncoming");
    });

    it.each(["c7", "c8"])(
        "a flow added on one side apart from its end nodes and an engine change on the other (%s)",
        async (platform) => {
            const result = await computeMerge(scenarioNamed(`independent changes (${platform})`));
            expect(statesOtherThanUnchanged(result)).toEqual({
                Task_Audit: "addedByCurrent",
                Flow_ToAudit: "addedByCurrent",
                Task_Check: "takenFromIncoming",
            });
        },
    );

    describe("every root element as an element of its own", () => {
        const { current } = scenarioNamed("table: unchanged");
        const withInterface = (name: string) =>
            current.replace(
                "  <bpmn:collaboration",
                `  <bpmn:interface id="Interface_Orders" name="${name}">\n    <bpmn:operation id="Operation_Check" name="check" />\n  </bpmn:interface>\n  <bpmn:collaboration`,
            );

        it("an interface only incoming adds, with the operation it names as a part", async () => {
            const incoming = withInterface("Orders").replace(
                '<bpmn:serviceTask id="Task_Check"',
                '<bpmn:serviceTask id="Task_Check" operationRef="Operation_Check"',
            );

            const result = await computeMerge({ base: current, current, incoming });

            expect(statesOtherThanUnchanged(result)).toEqual({
                Interface_Orders: "addedByIncoming",
                Task_Check: "takenFromIncoming",
            });
            expect(elementNamed(result, "Interface_Orders").versions.incoming?.parts).toEqual([
                "Operation_Check",
            ]);
            expect(elementNamed(result, "Task_Check").versions.incoming?.references).toContainEqual(
                {
                    property: "bpmn:ServiceTask#operationRef",
                    target: "Interface_Orders",
                    targetPart: "Operation_Check",
                },
            );
        });

        it("an interface only incoming renames, as taken from incoming", async () => {
            const result = await computeMerge({
                base: withInterface("Orders"),
                current: withInterface("Orders"),
                incoming: withInterface("Order service"),
            });

            expect(statesOtherThanUnchanged(result)).toEqual({
                Interface_Orders: "takenFromIncoming",
            });
        });
    });

    it("an element that is no flow node, such as a message, by its own state", async () => {
        const result = await computeMerge(scenarioNamed("all conflicts"));
        expect(statesOtherThanUnchanged(result)).toEqual({
            Task_Check: "bothChanged",
            Task_Pack: "bothChanged",
            Sub_Ship: "bothChanged",
            Message_Order: "bothChanged",
            Lane_Manager: "bothChanged",
            Task_Audit: "bothAdded",
            Flow_ToAudit: "sameAddition",
            End_Rejected: "changedAndRemoved",
            Flow_Rejected: "removedByIncoming",
        });
    });
});

describe("computeMerge without a base", () => {
    it("finds nothing when the sides are equal", async () => {
        const result = await computeMerge(scenarioNamed("no base: sides equal"));

        expect(result.hasBase).toBe(false);
        expect(statesOtherThanUnchanged(result)).toEqual({});
        expect(result.elements.every((element) => element.versions.base === undefined)).toBe(true);
    });

    it("leaves a difference open and takes a layout difference from current", async () => {
        const result = await computeMerge(scenarioNamed("no base: sides differ"));

        expect(statesOtherThanUnchanged(result)).toEqual({ Task_Check: "differs" });
        expect(layoutsOtherThanUnchanged(result)).toEqual(TASK_REJECT_AND_ITS_FLOWS_MOVED);
    });

    it("leaves an element only one side has open", async () => {
        const result = await computeMerge(scenarioNamed("no base: only one side"));
        expect(statesOtherThanUnchanged(result)).toEqual({
            Task_Audit: "onlyInCurrent",
            Task_Extra: "onlyInIncoming",
        });
    });
});

describe("computeMerge records per version", () => {
    it.each([
        {
            id: "Task_Check",
            version: {
                parent: "Process_1",
                lanes: ["Lane_Clerk"],
                references: [],
                parts: [],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "Boundary_Timeout",
            version: {
                parent: "Process_1",
                lanes: ["Lane_Clerk"],
                references: [
                    { property: "bpmn:BoundaryEvent#attachedToRef", target: "Task_Check" },
                ],
                parts: ["TimerEventDefinition_1"],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "Start_Order",
            version: {
                parent: "Process_1",
                lanes: ["Lane_Clerk"],
                references: [
                    { property: "bpmn:MessageEventDefinition#messageRef", target: "Message_Order" },
                ],
                parts: ["MessageEventDefinition_1"],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "Gateway_Ok",
            version: {
                parent: "Process_1",
                lanes: ["Lane_Clerk"],
                references: [{ property: "bpmn:ExclusiveGateway#default", target: "Flow_No" }],
                parts: [],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "Flow_Start",
            version: {
                parent: "Process_1",
                lanes: [],
                references: [
                    { property: "bpmn:SequenceFlow#sourceRef", target: "Start_Order" },
                    { property: "bpmn:SequenceFlow#targetRef", target: "Task_Check" },
                ],
                parts: [],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "DataInput_Order",
            version: {
                parent: "Task_Check",
                lanes: [],
                references: [
                    { property: "bpmn:DataInputAssociation#sourceRef", target: "DataRef_Order" },
                ],
                parts: [],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "DataRef_Order",
            version: {
                parent: "Process_1",
                lanes: ["Lane_Manager"],
                references: [
                    {
                        property: "bpmn:DataObjectReference#dataObjectRef",
                        target: "DataObject_Order",
                    },
                ],
                parts: [],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "Participant_Shop",
            version: {
                parent: "Collaboration_1",
                lanes: [],
                references: [{ property: "bpmn:Participant#processRef", target: "Process_1" }],
                parts: [],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "Process_1",
            version: { lanes: [], references: [], parts: ["LaneSet_1"], drawn: false },
        },
        {
            id: "Lane_Manager",
            version: {
                parent: "Process_1",
                container: "LaneSet_1",
                lanes: [],
                references: [],
                parts: [],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "Task_Pack",
            version: {
                parent: "Sub_Ship",
                lanes: ["Lane_Clerk"],
                references: [],
                parts: [],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        {
            id: "Note_Check",
            version: {
                parent: "Process_1",
                lanes: [],
                references: [],
                parts: [],
                drawn: true,
                plane: "Collaboration_1",
            },
        },
        { id: "Message_Order", version: { lanes: [], references: [], parts: [], drawn: false } },
        {
            id: "DataObject_Order",
            version: { parent: "Process_1", lanes: [], references: [], parts: [], drawn: false },
        },
    ])(
        "the parent, container, lanes, references, parts and drawing of $id",
        async ({ id, version }) => {
            const element = elementNamed(await computeMerge(scenarioNamed("table: unchanged")), id);

            expect(element.versions).toStrictEqual({
                base: version,
                current: version,
                incoming: version,
            });
        },
    );

    it("only the versions that hold the element", async () => {
        const result = await computeMerge(scenarioNamed("table: every row (c7)"));

        expect(Object.keys(elementNamed(result, "Task_AddedByIncoming").versions)).toEqual([
            "incoming",
        ]);
        expect(Object.keys(elementNamed(result, "End_Rejected").versions)).toEqual([
            "base",
            "incoming",
        ]);
        expect(Object.keys(elementNamed(result, "DataRef_Order").versions)).toEqual(["base"]);
    });

    it("the reference inside another element as its part", async () => {
        const model = baseModel("c7");
        nodeById(model, "Task_Check").extensionElements = [];
        const withTarget = renderBpmn(model).replace(
            '<bpmn:dataInputAssociation id="DataInput_Order">\n        <bpmn:sourceRef>DataRef_Order</bpmn:sourceRef>\n      </bpmn:dataInputAssociation>',
            '<bpmn:ioSpecification id="Io_Check">\n        <bpmn:dataInput id="Input_Order" />\n        <bpmn:inputSet id="InputSet_Check">\n          <bpmn:dataInputRefs>Input_Order</bpmn:dataInputRefs>\n        </bpmn:inputSet>\n        <bpmn:outputSet id="OutputSet_Check" />\n      </bpmn:ioSpecification>\n' +
                '      <bpmn:dataInputAssociation id="DataInput_Order">\n        <bpmn:sourceRef>DataRef_Order</bpmn:sourceRef>\n        <bpmn:targetRef>Input_Order</bpmn:targetRef>\n      </bpmn:dataInputAssociation>',
        );
        expect(withTarget).toContain("Input_Order</bpmn:targetRef>");

        const result = await computeMerge({
            base: withTarget,
            current: withTarget,
            incoming: withTarget,
        });

        expect(elementNamed(result, "DataInput_Order").versions.current?.references).toContainEqual(
            {
                property: "bpmn:DataInputAssociation#targetRef",
                target: "Task_Check",
                targetPart: "Input_Order",
            },
        );
    });
});

describe("computeMerge orders and names", () => {
    it("lists current's elements first, then incoming's own, then base's own", async () => {
        const result = await computeMerge(scenarioNamed("table: every row (c7)"));
        const ids = result.elements.map((element) => element.id);
        const incomingOnly = [
            "Note_Check",
            "Association_Check",
            "End_Rejected",
            "Flow_Rejected",
            "Task_AddedByIncoming",
        ];
        const baseOnly = ["DataRef_Order", "DataInput_Order"];

        expect(new Set(ids.slice(-7, -2))).toEqual(new Set(incomingOnly));
        expect(new Set(ids.slice(-2))).toEqual(new Set(baseOnly));
        expect(ids.indexOf("Task_Check")).toBeLessThan(ids.indexOf("Task_Reject"));
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("takes the type from current, else incoming, else base", async () => {
        const base = baseModel("c7");
        const retyped = (type: "task" | "serviceTask", removed: string) => {
            const model = cloneModel(base);
            nodeById(model, "Task_Reject").type = type;
            nodeById(model, "Task_Pack").type = type;
            return renderBpmn(removeNode(model, removed));
        };

        const result = await computeMerge({
            base: renderBpmn(base),
            current: retyped("task", "Task_Pack"),
            incoming: retyped("serviceTask", "DataRef_Order"),
        });

        expect(elementNamed(result, "Task_Reject").type).toBe("bpmn:Task");
        expect(elementNamed(result, "Task_Pack").type).toBe("bpmn:ServiceTask");
        expect(elementNamed(result, "Start_Order").type).toBe("bpmn:StartEvent");
    });

    it("keys each version by its text, so equal texts share a key and different texts do not", async () => {
        const { base, current, incoming } = scenarioNamed("table: taken from current");

        const withBase = await computeMerge({ base, current, incoming });
        const swapped = await computeMerge({ current: incoming, incoming: current });

        expect(withBase.versionKeys.current).not.toBe(withBase.versionKeys.incoming);
        expect(withBase.versionKeys.base).toBe(withBase.versionKeys.incoming);
        expect(swapped.versionKeys).toStrictEqual({
            current: withBase.versionKeys.incoming,
            incoming: withBase.versionKeys.current,
        });
    });

    it.each(MERGE_SCENARIOS.map((scenario) => scenario.name))(
        "survives a JSON round trip: %s",
        async (name) => {
            const result = await computeMerge(scenarioNamed(name));
            expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
        },
    );
});

describe("computeMerge refuses", () => {
    const { base, current, incoming } = scenarioNamed("table: unchanged");

    it.each(["base", "current", "incoming"] as const)(
        "a %s that does not parse, naming it",
        async (broken) => {
            const versions = {
                base,
                current,
                incoming,
                [broken]: current.replace("<bpmn:process", "<undeclared:process"),
            };
            await expect(computeMerge(versions)).rejects.toThrow(`${broken} does not parse: `);
        },
    );

    it("a version with an unresolved reference, naming it and the reference", async () => {
        const unresolved = current.replace(
            'targetRef="Task_Check" />',
            'targetRef="Missing_Node" />',
        );
        expect(unresolved).toContain("Missing_Node");

        await expect(computeMerge({ base, current, incoming: unresolved })).rejects.toThrow(
            /incoming does not parse: .*unresolved reference <Missing_Node>/,
        );
    });

    it("a base whose gateway names a default flow it does not have", async () => {
        const danglingDefault = current.replace('default="Flow_No"', 'default="Flow_Gone"');

        await expect(computeMerge({ base: danglingDefault, current, incoming })).rejects.toThrow(
            /base does not parse: .*unresolved reference <Flow_Gone>/,
        );
    });

    const clean = engineDocument(CAMUNDA_7_PLATFORM);

    it.each([
        {
            side: "base",
            what: "an attribute",
            unknown: engineDocument(CAMUNDA_7_PLATFORM, 'camunda:notAProperty="x"'),
            warning: /base does not parse: .*unknown attribute <camunda:notAProperty>/,
        },
        {
            side: "current",
            what: "an extension element",
            unknown: engineDocument(CAMUNDA_7_PLATFORM, "", {
                processContent:
                    '<bpmn:task id="Task_2"><bpmn:extensionElements><camunda:notInDescriptor value="1" /></bpmn:extensionElements></bpmn:task>',
            }),
            warning: /current does not parse: .*camunda:notInDescriptor/,
        },
        {
            side: "incoming",
            what: "an attribute",
            unknown: engineDocument(CAMUNDA_7_PLATFORM, 'camunda:notAProperty="x"'),
            warning: /incoming does not parse: .*unknown attribute <camunda:notAProperty>/,
        },
    ] as const)(
        "$side, holding $what its engine's descriptor does not know, naming it",
        async ({ side, unknown, warning }) => {
            const versions = { base: clean, current: clean, incoming: clean, [side]: unknown };
            await expect(computeMerge(versions)).rejects.toThrow(warning);
        },
    );

    it("an incoming its engine's descriptor does not parse cleanly when current declares no engine", async () => {
        const unknownAttribute = engineDocument(CAMUNDA_7_PLATFORM, 'camunda:notAProperty="x"');

        await expect(
            computeMerge({ current: engineDocument(""), incoming: unknownAttribute }),
        ).rejects.toThrow(/incoming does not parse: .*unknown attribute <camunda:notAProperty>/);
    });

    it("a version that is no BPMN document, naming it", async () => {
        await expect(computeMerge({ current: clean, incoming: "<html />" })).rejects.toThrow(
            "incoming does not parse: ",
        );
    });

    it.each([
        {
            what: "a root element",
            withoutId: engineDocument(CAMUNDA_7_PLATFORM, "", {
                rootElements: '<bpmn:signal name="Signal without id" />',
            }),
            type: "bpmn:Signal",
        },
        {
            what: "a lane",
            withoutId: engineDocument(CAMUNDA_7_PLATFORM, "", {
                processContent:
                    '<bpmn:laneSet id="LaneSet_1"><bpmn:lane name="Lane without id"><bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>',
            }),
            type: "bpmn:Lane",
        },
        {
            what: "a nested lane",
            withoutId: engineDocument(CAMUNDA_7_PLATFORM, "", {
                processContent:
                    '<bpmn:laneSet id="LaneSet_1"><bpmn:lane id="Lane_Outer"><bpmn:childLaneSet id="LaneSet_2"><bpmn:lane name="Lane without id" /></bpmn:childLaneSet></bpmn:lane></bpmn:laneSet>',
            }),
            type: "bpmn:Lane",
        },
    ])(
        "a version holding $what without an id, naming the side and the type",
        async ({ withoutId, type }) => {
            await expect(
                computeMerge({ base: clean, current: clean, incoming: withoutId }),
            ).rejects.toThrow(
                `incoming holds a ${type} without an id: the merge matches root elements and lanes by id`,
            );
        },
    );

    it("sides for different engines", async () => {
        const c8 = scenarioNamed("table: every row (c8)");
        await expect(computeMerge({ base, current, incoming: c8.incoming })).rejects.toThrow(
            "current is for Camunda 7 and incoming for Camunda 8",
        );
    });

    it("a Camunda 8 side known only by its execution platform against a Camunda 7 side", async () => {
        const camunda8 = engineDocument(
            `xmlns:modeler="${MODELER_NAMESPACE}" modeler:executionPlatform="Camunda Cloud"`,
        );
        const camunda7 = engineDocument(
            `xmlns:camunda="${CAMUNDA_NAMESPACE}" xmlns:modeler="${MODELER_NAMESPACE}" modeler:executionPlatform="Camunda Platform"`,
        );

        await expect(computeMerge({ current: camunda8, incoming: camunda7 })).rejects.toThrow(
            "current is for Camunda 8 and incoming for Camunda 7: a merge needs one engine",
        );
    });

    it("no side that declares no engine", async () => {
        const model = removeNode(baseModel("c7"), "Task_Check");
        model.processAttributes = {};
        const withoutEngine = renderBpmn(model).replace(
            / modeler:executionPlatform(Version)?="[^"]*"/g,
            "",
        );

        const result = await computeMerge({ base, current, incoming: withoutEngine });

        expect(elementNamed(result, "Task_Check").state).toBe("removedByIncoming");
    });
});

describe("computeMerge accepts", () => {
    it("sides that declare no engine, keeping an extension attribute no descriptor types", async () => {
        const withAttribute = engineDocument(
            'xmlns:custom="http://example.com/custom"',
            'custom:note="x"',
        );

        const result = await computeMerge({ current: withAttribute, incoming: withAttribute });

        expect(elementNamed(result, "Task_1").state).toBe("unchanged");
    });

    it("a Camunda 7 side that also declares the zeebe namespace with a plain Camunda 7 side", async () => {
        const camunda7Platform = `xmlns:camunda="${CAMUNDA_NAMESPACE}" xmlns:modeler="${MODELER_NAMESPACE}" modeler:executionPlatform="Camunda Platform"`;
        const withZeebeLeftover = engineDocument(
            `${camunda7Platform} xmlns:zeebe="${ZEEBE_NAMESPACE}"`,
            'name="Check"',
        );

        const result = await computeMerge({
            current: withZeebeLeftover,
            incoming: engineDocument(camunda7Platform, 'name="Check"'),
        });

        expect(elementNamed(result, "Task_1").state).toBe("unchanged");
    });
});
