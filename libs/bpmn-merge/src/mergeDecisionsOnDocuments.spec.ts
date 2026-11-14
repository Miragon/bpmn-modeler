import { describe, expect, it } from "vitest";

import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";

function document(process: string, shapes: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
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
    base: string;
    current: string;
    incoming: string;
}): Promise<MergeDecisions> {
    return MergeDecisions.from(await computeMerge(versions));
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

    it("never accepts a process without the lane set its lanes lie in", async () => {
        const decisions = await decisionsOf({
            base: lanes(false, ""),
            current: lanes(
                false,
                '    <bpmn:documentation id="Doc_1">current</bpmn:documentation>',
            ),
            incoming: lanes(true, ""),
        });

        const outcome = decisions.pick("Process_1", "current");

        expect(outcome.applied || outcome.blockedBy.map((blocked) => blocked.id)).toEqual(["T"]);
        expect(decisions.pickWithContents("Process_1", "current").applied).toBe(true);
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
});
