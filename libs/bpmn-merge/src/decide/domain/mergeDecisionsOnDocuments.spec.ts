import { describe, expect, it } from "vitest";

import { baseModel, cloneModel, nodeById, removeNode } from "../../__fixtures__/baseModel";
import { renderBpmn } from "../../__fixtures__/bpmnModelBuilder";
import { computeMerge } from "../../classify/service/computeMerge";
import { MergeDecisions } from "./mergeDecisions";

function document(process: string, shapes: string, namespaces = ""): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"${namespaces} id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
${process}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
${shapes}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

const shape = (id: string, x: number, y: number) =>
    `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="100" height="80" /></bpmndi:BPMNShape>`;
const edge = (id: string, waypoints: readonly (readonly [number, number])[]) =>
    `<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${waypoints
        .map(([x, y]) => `<di:waypoint x="${x}" y="${y}" />`)
        .join("")}</bpmndi:BPMNEdge>`;

async function decisionsOf(versions: {
    base?: string;
    current: string;
    incoming: string;
}): Promise<MergeDecisions> {
    return MergeDecisions.from(await computeMerge(versions));
}

function openIds(decisions: MergeDecisions): string[] {
    return decisions.openConflicts.map((conflict) => conflict.id);
}

describe("MergeDecisions on parsed documents", () => {
    /** bpmn-js adds a placeholder property to a task when a data object is connected to it. */
    const dataInputOntoTask = (taskName: string, connected: boolean) =>
        document(
            `    <bpmn:dataObject id="DataObject_1" />
    <bpmn:dataObjectReference id="DOR" dataObjectRef="DataObject_1" />
    <bpmn:task id="T" name="${taskName}">${
        connected
            ? `
      <bpmn:property id="Property_1" name="__targetRef_placeholder" />
      <bpmn:dataInputAssociation id="DIA"><bpmn:sourceRef>DOR</bpmn:sourceRef><bpmn:targetRef>Property_1</bpmn:targetRef></bpmn:dataInputAssociation>`
            : ""
    }
    </bpmn:task>`,
            [
                shape("DOR", 100, 100),
                shape("T", 200, 85),
                connected
                    ? edge("DIA", [
                          [136, 125],
                          [200, 125],
                      ])
                    : "",
            ].join("\n"),
        );

    it("drops a data association when its task is taken from the side without the placeholder", async () => {
        const decisions = await decisionsOf({
            base: dataInputOntoTask("Check", false),
            current: dataInputOntoTask("Check", true),
            incoming: dataInputOntoTask("Check order", false),
        });

        expect(decisions.pick("T", "incoming")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: ["DIA"],
        });
        expect(decisions.resolution().elements).toMatchObject({ T: "incoming", DIA: "incoming" });
        expect(decisions.isInResult("DIA")).toBe(false);
    });

    it("drops incoming's data association when current's renamed task is picked", async () => {
        const decisions = await decisionsOf({
            base: dataInputOntoTask("Check", false),
            current: dataInputOntoTask("Check order", false),
            incoming: dataInputOntoTask("Check", true),
        });

        expect(decisions.pick("T", "current")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: ["DIA"],
        });
    });

    const lanes = (withLanes: boolean, processChange: string) =>
        document(
            `${processChange}${
                withLanes
                    ? `
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_A"><bpmn:flowNodeRef>T</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>`
                    : ""
            }
    <bpmn:task id="T" />`,
            [withLanes ? shape("Lane_A", 0, 0) : "", shape("T", 200, 85)].join("\n"),
        );

    it("never accepts a process without the lane set its lanes lie in: drops the lane and reopens the task in it", async () => {
        const decisions = await decisionsOf({
            base: lanes(false, ""),
            current: lanes(
                false,
                '    <bpmn:documentation id="Doc_1">current</bpmn:documentation>',
            ),
            incoming: lanes(true, ""),
        });

        expect(decisions.pick("Process_1", "current")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: ["Lane_A"],
        });

        expect(openIds(decisions)).toEqual(["T"]);
        expect(decisions.pickWithContents("Process_1", "current").applied).toBe(true);
        expect(decisions.canBuild).toBe(true);
        expect(decisions.isInResult("Lane_A")).toBe(false);
    });

    const gatewayWithDefault = (gatewayName: string | undefined) =>
        document(
            `${
                gatewayName === undefined
                    ? ""
                    : `    <bpmn:exclusiveGateway id="G" name="${gatewayName}" default="F" />
    <bpmn:sequenceFlow id="F" sourceRef="G" targetRef="X" />
`
            }    <bpmn:task id="X" />`,
            [
                gatewayName === undefined ? "" : shape("G", 100, 100),
                gatewayName === undefined
                    ? ""
                    : edge("F", [
                          [200, 140],
                          [300, 140],
                      ]),
                shape("X", 300, 100),
            ].join("\n"),
        );

    it("brings back a gateway and its default flow after both were picked away", async () => {
        const decisions = await decisionsOf({
            base: gatewayWithDefault("Valid?"),
            current: gatewayWithDefault("Order valid?"),
            incoming: gatewayWithDefault(undefined),
        });
        decisions.pick("G", "incoming");
        decisions.pick("F", "incoming");

        decisions.unpick("F");

        expect(decisions.pick("G", "current").applied).toBe(true);
        expect(decisions.resolution().elements).toMatchObject({ G: "current", F: "current" });
    });

    const flowTo = (target: string, waypoints: readonly (readonly [number, number])[]) =>
        document(
            `    <bpmn:startEvent id="S" />
    <bpmn:task id="A" />
    <bpmn:task id="B" />
    <bpmn:sequenceFlow id="F" sourceRef="S" targetRef="${target}" />`,
            [
                shape("S", 100, 100),
                shape("A", 200, 78),
                shape("B", 200, 300),
                edge("F", waypoints),
            ].join("\n"),
        );

    it("draws a flow incoming reconnected from incoming while current only bent it", async () => {
        const decisions = await decisionsOf({
            base: flowTo("A", [
                [136, 118],
                [200, 118],
            ]),
            current: flowTo("A", [
                [136, 118],
                [168, 118],
                [168, 110],
                [200, 110],
            ]),
            incoming: flowTo("B", [
                [118, 136],
                [118, 340],
                [200, 340],
            ]),
        });

        expect(decisions.resolution().layout.F).toBe("incoming");
    });

    describe("a task and the flow that ends at it", () => {
        const CAMUNDA =
            ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"';
        const gatewayToTask = (
            task: { name: string } | undefined,
            flow: { condition?: string; listener?: string } = {},
        ) =>
            document(
                task === undefined
                    ? `    <bpmn:exclusiveGateway id="G" />`
                    : `    <bpmn:exclusiveGateway id="G"><bpmn:outgoing>F</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:task id="T" name="${task.name}"><bpmn:incoming>F</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="F" sourceRef="G" targetRef="T">${
        flow.listener === undefined
            ? ""
            : `<bpmn:extensionElements><camunda:executionListener class="${flow.listener}" event="take" /></bpmn:extensionElements>`
    }${
        flow.condition === undefined
            ? ""
            : `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${flow.condition}</bpmn:conditionExpression>`
    }</bpmn:sequenceFlow>`,
                [
                    shape("G", 100, 100),
                    task === undefined ? "" : shape("T", 250, 85),
                    task === undefined
                        ? ""
                        : edge("F", [
                              [200, 140],
                              [250, 125],
                          ]),
                ].join("\n"),
                CAMUNDA,
            );

        it("keeps a task's rename and its flow's new condition and listener, each from its own side", async () => {
            const decisions = await decisionsOf({
                base: gatewayToTask({ name: "Check" }),
                current: gatewayToTask({ name: "Check order" }),
                incoming: gatewayToTask(
                    { name: "Check" },
                    { condition: "${ok}", listener: "com.example.Audit" },
                ),
            });

            expect(decisions.openConflicts).toEqual([]);
            expect(decisions.resolution().elements).toMatchObject({ T: "current", F: "incoming" });
        });

        it("leaves the flow's own conflict open when the task is picked", async () => {
            const decisions = await decisionsOf({
                base: gatewayToTask({ name: "Check" }, { condition: "${a}" }),
                current: gatewayToTask({ name: "Check order" }, { condition: "${b}" }),
                incoming: gatewayToTask({ name: "Check" }, { condition: "${c}" }),
            });

            expect(decisions.pick("T", "incoming")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: [],
            });
            expect(decisions.openConflicts.map((conflict) => conflict.id)).toEqual(["F"]);
            expect(decisions.pick("F", "current")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: [],
            });
            expect(decisions.resolution().elements).toMatchObject({ T: "incoming", F: "current" });
        });

        it("pulls the removed task back in when the flow incoming changed is kept", async () => {
            const decisions = await decisionsOf({
                base: gatewayToTask({ name: "Check" }, { condition: "${a}" }),
                current: gatewayToTask(undefined),
                incoming: gatewayToTask({ name: "Check" }, { condition: "${c}" }),
            });

            expect(decisions.openConflicts.map((conflict) => conflict.id)).toEqual(["F"]);
            expect(decisions.pick("F", "incoming")).toEqual({
                applied: true,
                pulledIn: ["T"],
                dropped: [],
            });
            expect(decisions.isInResult("T")).toBe(true);
        });

        it("drops the flow incoming changed, naming it, when the task is picked away", async () => {
            const decisions = await decisionsOf({
                base: gatewayToTask({ name: "Check" }, { condition: "${a}" }),
                current: gatewayToTask(undefined),
                incoming: gatewayToTask({ name: "Check" }, { condition: "${c}" }),
            });

            expect(decisions.pick("T", "current")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: ["F"],
            });
            expect(decisions.canBuild).toBe(true);
            expect(decisions.isInResult("F")).toBe(false);
        });
    });

    describe("a pool only one side draws the process in", () => {
        const withPool = renderBpmn(baseModel("c7"));
        const withoutPool = (() => {
            const model = baseModel("c7");
            model.pools = [];
            return renderBpmn(model);
        })();

        it.each([
            { case: "without a base", base: undefined },
            { case: "when current added it", base: withoutPool },
        ])(
            "draws the process and its contents from incoming once the pool is picked away, $case",
            async ({ base }) => {
                const decisions = await decisionsOf({
                    base,
                    current: withPool,
                    incoming: withoutPool,
                });

                expect(decisions.pick("Collaboration_1", "incoming").applied).toBe(true);

                expect(decisions.canBuild).toBe(true);
                const { layout } = decisions.resolution();
                expect([
                    layout.Process_1,
                    layout.Lane_Clerk,
                    layout.Task_Check,
                    layout.Flow_Start,
                ]).toEqual(["incoming", "incoming", "incoming", "incoming"]);
            },
        );

        it("keeps drawing the contents in the pool current added when the pool stays", async () => {
            const decisions = await decisionsOf({
                base: withoutPool,
                current: withPool,
                incoming: withoutPool,
            });

            const { layout } = decisions.resolution();

            expect(layout.Process_1).toBeUndefined();
            expect([layout.Participant_Shop, layout.Task_Check]).toEqual(["current", "current"]);
        });
    });

    it("opens two collaborations each side added around the same process", async () => {
        const withoutPool = (() => {
            const model = baseModel("c7");
            model.pools = [];
            return renderBpmn(model);
        })();
        const withPool = renderBpmn(baseModel("c7"));
        const decisions = await decisionsOf({
            base: withoutPool,
            current: withPool,
            incoming: withPool
                .replaceAll("Collaboration_1", "Collaboration_2")
                .replaceAll("Participant_Shop", "Participant_Store"),
        });

        expect(openIds(decisions)).toEqual(["Collaboration_1", "Collaboration_2"]);
        expect(decisions.pick("Collaboration_2", "incoming")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: ["Collaboration_1", "Participant_Shop"],
        });
        expect(decisions.canBuild).toBe(true);
    });

    it("keeps a task picked with a placeholder property another task now holds and opens only the other task", async () => {
        const dataInputInto = (target: string) => ({
            id: "DataInput_Pack",
            kind: "dataInput" as const,
            source: "DataRef_Order",
            target,
            targetProperty: "Property_Placeholder",
        });
        const base = baseModel("c7");
        base.flows.push(dataInputInto("Task_Pack"));
        const current = cloneModel(base);
        nodeById(current, "Task_Pack").name = "Pack parcel";
        const incoming = cloneModel(base);
        incoming.flows = incoming.flows.map((flow) =>
            flow.id === "DataInput_Pack" ? dataInputInto("Task_Reject") : flow,
        );
        const decisions = await decisionsOf({
            base: renderBpmn(base),
            current: renderBpmn(current),
            incoming: renderBpmn(incoming),
        });

        expect(decisions.pick("Task_Pack", "current").applied).toBe(true);

        expect(decisions.sideOf("Task_Pack")).toBe("current");
        expect(openIds(decisions)).toEqual(["Task_Reject"]);
        expect(decisions.pick("Task_Reject", "incoming")).toMatchObject({
            applied: false,
            blockedBy: [{ id: "Task_Pack" }],
        });
        expect(decisions.pick("Task_Reject", "current").applied).toBe(true);
        expect(openIds(decisions)).toEqual(["DataInput_Pack"]);
        expect(decisions.pick("DataInput_Pack", "current").applied).toBe(true);
        expect(decisions.canBuild).toBe(true);
    });

    it("refuses to pick away the last task that holds the placeholder a data input both sides added needs", async () => {
        const dataInputInto = (target: string) => ({
            id: "DataInput_New",
            kind: "dataInput" as const,
            source: "DataRef_Order",
            target,
            targetProperty: "Property_New",
        });
        const base = baseModel("c8");
        const current = cloneModel(base);
        current.flows.push(dataInputInto("Task_Pack"));
        const incoming = cloneModel(base);
        incoming.flows.push(dataInputInto("Task_Reject"));
        const decisions = await decisionsOf({
            base: renderBpmn(base),
            current: renderBpmn(current),
            incoming: renderBpmn(incoming),
        });
        expect(decisions.pick("Task_Pack", "incoming").applied).toBe(true);

        expect(decisions.pick("Task_Reject", "current")).toMatchObject({
            applied: false,
            blockedBy: [{ id: "DataInput_New" }, { id: "DataInput_New" }],
        });
        expect(decisions.pick("DataInput_New", "incoming").applied).toBe(true);
    });

    it("leaves a choice for every open conflict once the process is picked from the side that removed its lanes", async () => {
        const base = baseModel("c8");
        const current = cloneModel(base);
        current.nodes.push({
            id: "Task_N",
            type: "task",
            name: "Review",
            x: 385,
            y: 200,
            lane: "Lane_Clerk",
        });
        current.flows = current.flows.map((flow) =>
            flow.id === "Flow_Checked" ? { ...flow, target: "Task_N" } : flow,
        );
        current.flows.push({ id: "Flow_N", source: "Task_N", target: "Gateway_Ok" });
        const incoming = cloneModel(base);
        incoming.lanes = [];
        incoming.nodes.forEach((node) => delete node.lane);
        const decisions = await decisionsOf({
            base: renderBpmn(base),
            current: renderBpmn(current),
            incoming: renderBpmn(incoming),
        });
        decisions.pick("Process_1", "incoming");
        expect(openIds(decisions)).toEqual(["Lane_Clerk", "Task_N"]);

        expect(decisions.pick("Lane_Clerk", "incoming").applied).toBe(true);

        expect(openIds(decisions)).toEqual(["Flow_Checked"]);
        expect(decisions.pick("Flow_Checked", "incoming").applied).toBe(true);
        expect(decisions.canBuild).toBe(true);
    });

    it("keeps a task picked away when taking back a flow's pick leaves the flow pointing at it", async () => {
        const base = baseModel("c7");
        const current = cloneModel(base);
        nodeById(current, "Task_Pack").name = "Pack parcel";
        const incoming = cloneModel(base);
        incoming.nodes.push({ id: "Task_Wrap", type: "task", x: 610, y: 200, parent: "Sub_Ship" });
        incoming.flows = incoming.flows.map((flow) =>
            flow.id === "Flow_Ship_1" ? { ...flow, target: "Task_Wrap" } : flow,
        );
        incoming.flows.push({ id: "Flow_Wrap", source: "Task_Wrap", target: "Task_Pack" });
        const decisions = await decisionsOf({
            base: renderBpmn(base),
            current: renderBpmn(current),
            incoming: renderBpmn(incoming),
        });
        decisions.pick("Flow_Ship_1", "current");
        decisions.pick("Task_Wrap", "current");

        expect(decisions.unpick("Flow_Ship_1").applied).toBe(true);

        expect(decisions.sideOf("Task_Wrap")).toBe("current");
        expect(openIds(decisions)).toEqual(["Flow_Ship_1"]);
        expect(decisions.pick("Flow_Ship_1", "current").applied).toBe(true);
        expect(decisions.canBuild).toBe(true);
    });

    it("keeps a boundary event incoming added once its host is picked back from incoming", async () => {
        const base = baseModel("c7");
        const current = removeNode(cloneModel(base), "Task_Reject");
        const incoming = cloneModel(base);
        nodeById(incoming, "Task_Reject").name = "Reject order";
        incoming.nodes.push({
            id: "Boundary_Escalate",
            type: "boundaryEvent",
            x: 592,
            y: 382,
            lane: "Lane_Manager",
            attachedTo: "Task_Reject",
        });
        const decisions = await decisionsOf({
            base: renderBpmn(base),
            current: renderBpmn(current),
            incoming: renderBpmn(incoming),
        });
        const fresh = MergeDecisions.from(decisions.result);
        fresh.pick("Task_Reject", "incoming");

        expect(decisions.pick("Task_Reject", "current")).toMatchObject({
            dropped: expect.arrayContaining(["Boundary_Escalate"]),
        });
        decisions.pick("Task_Reject", "incoming");

        expect(decisions.isInResult("Boundary_Escalate")).toBe(true);
        expect(decisions.openConflicts).toEqual(fresh.openConflicts);
    });
});
