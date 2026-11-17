import { elementSnapshots } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { buildMerged } from "./buildMerged";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge, type MergeVersions } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import { isMergeElement } from "./mergeElements";

const SEMANTIC = `
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="Sub_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:task id="Task_In" />
    </bpmn:subProcess>
    <bpmn:endEvent id="End_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Sub_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Sub_1" targetRef="End_1" />
  </bpmn:process>`;

const shape = (element: string, x: number, y: number, width: number, height: number, extra = "") =>
    `      <bpmndi:BPMNShape id="${element}_di" bpmnElement="${element}"${extra}>
        <dc:Bounds x="${x}" y="${y}" width="${width}" height="${height}" />
      </bpmndi:BPMNShape>`;

const edge = (element: string, points: readonly (readonly [number, number])[]) =>
    `      <bpmndi:BPMNEdge id="${element}_di" bpmnElement="${element}">
${points.map(([x, y]) => `        <di:waypoint x="${x}" y="${y}" />`).join("\n")}
      </bpmndi:BPMNEdge>`;

function document(rootDrawings: string[], subProcessPlane?: string[]): string {
    const subDiagram = subProcessPlane
        ? `
  <bpmndi:BPMNDiagram id="BPMNDiagram_Sub">
    <bpmndi:BPMNPlane id="BPMNPlane_Sub" bpmnElement="Sub_1">
${subProcessPlane.join("\n")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`
        : "";
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${SEMANTIC}
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
${rootDrawings.join("\n")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>${subDiagram}
</bpmn:definitions>
`;
}

const START_AND_END = [shape("Start_1", 100, 120, 36, 36), shape("End_1", 600, 120, 36, 36)];

const expanded = (taskX = 260) =>
    document([
        START_AND_END[0]!,
        shape("Sub_1", 200, 50, 300, 180, ' isExpanded="true"'),
        shape("Task_In", taskX, 100, 100, 80),
        START_AND_END[1]!,
        edge("Flow_1", [
            [136, 138],
            [200, 138],
        ]),
        edge("Flow_2", [
            [500, 138],
            [600, 138],
        ]),
    ]);

const collapsed = (taskX = 180) =>
    document(
        [
            START_AND_END[0]!,
            shape("Sub_1", 200, 98, 100, 80),
            START_AND_END[1]!,
            edge("Flow_1", [
                [136, 138],
                [200, 138],
            ]),
            edge("Flow_2", [
                [300, 138],
                [600, 138],
            ]),
        ],
        [shape("Task_In", taskX, 160, 100, 80)],
    );

async function automaticMerge(versions: MergeVersions) {
    return buildMerged(
        await prepareMergeSources(versions),
        MergeDecisions.from(await computeMerge(versions)),
    );
}

async function layoutsOf(xml: string, versions: MergeVersions) {
    const snapshots = await elementSnapshots(xml, {
        prefixSources: [versions.current, versions.incoming],
        isUnit: isMergeElement,
    });
    return Object.fromEntries([...snapshots].map(([id, { layout }]) => [id, layout]));
}

async function planesOf(xml: string) {
    const { rootElement } = await parseWithoutWarnings(xml);
    return Object.fromEntries(
        (
            rootElement.diagrams as {
                plane: {
                    bpmnElement: { id: string };
                    planeElement?: { bpmnElement: { id: string } }[];
                };
            }[]
        ).map(({ plane }) => [
            plane.bpmnElement.id,
            (plane.planeElement ?? []).map(({ bpmnElement }) => bpmnElement.id),
        ]),
    );
}

describe("buildMerged with a collapsed sub-process", () => {
    it("takes the sub-process's own diagram from the side that collapsed it", async () => {
        const versions = { base: expanded(), current: expanded(), incoming: collapsed() };
        const { xml } = await automaticMerge(versions);

        expect(await layoutsOf(xml, versions)).toEqual(
            await layoutsOf(versions.incoming, versions),
        );
        expect(await planesOf(xml)).toEqual({
            Process_1: ["Start_1", "Sub_1", "End_1", "Flow_1", "Flow_2"],
            Sub_1: ["Task_In"],
        });
    });

    it("drops the sub-process's own diagram when the other side expanded it", async () => {
        const versions = { base: collapsed(), current: collapsed(), incoming: expanded() };
        const { xml } = await automaticMerge(versions);

        expect(await layoutsOf(xml, versions)).toEqual(
            await layoutsOf(versions.incoming, versions),
        );
        expect(await planesOf(xml)).toEqual({
            Process_1: ["Start_1", "Sub_1", "Task_In", "End_1", "Flow_1", "Flow_2"],
        });
    });

    it("draws the contents from the side that expanded the sub-process when the other moved them on its dropped plane", async () => {
        const versions = { base: collapsed(), current: collapsed(220), incoming: expanded() };
        const { xml, notes } = await automaticMerge(versions);

        expect(await planesOf(xml)).toEqual({
            Process_1: ["Start_1", "Sub_1", "Task_In", "End_1", "Flow_1", "Flow_2"],
        });
        expect(xml).toContain('<dc:Bounds x="260" y="100" width="100" height="80" />');
        expect(notes).toEqual([
            { kind: "layoutChangedByBoth", ids: ["Task_In"], keptSide: "incoming" },
        ]);
    });
});

describe("buildMerged with an expanded sub-process that has a plane of its own", () => {
    const expandedWithOwnPlane = (taskX = 260) =>
        expanded(taskX).replace(
            "</bpmndi:BPMNDiagram>",
            `</bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Sub">
    <bpmndi:BPMNPlane id="BPMNPlane_Sub" bpmnElement="Sub_1" />
  </bpmndi:BPMNDiagram>`,
        );

    it("keeps the contents on the plane of the sub-process's shape, as bpmn-js reads them", async () => {
        const versions = {
            base: expandedWithOwnPlane(),
            current: expandedWithOwnPlane(),
            incoming: expandedWithOwnPlane(280),
        };
        const { xml } = await automaticMerge(versions);

        expect(await planesOf(xml)).toEqual({
            Process_1: ["Start_1", "Sub_1", "Task_In", "End_1", "Flow_1", "Flow_2"],
            Sub_1: [],
        });
        expect(xml).toContain('<dc:Bounds x="280" y="100" width="100" height="80" />');
    });
});

describe("buildMerged with diagram ids", () => {
    it("gives an incoming sub-process diagram named as current's root diagram an id of its own", async () => {
        const clashing = collapsed()
            .replace(
                '<bpmndi:BPMNDiagram id="BPMNDiagram_1">',
                '<bpmndi:BPMNDiagram id="BPMNDiagram_Root">',
            )
            .replace(
                '<bpmndi:BPMNDiagram id="BPMNDiagram_Sub">',
                '<bpmndi:BPMNDiagram id="BPMNDiagram_1">',
            );
        const versions = { base: expanded(), current: expanded(), incoming: clashing };
        const { xml } = await automaticMerge(versions);
        const diagramIds = [...xml.matchAll(/<bpmndi:BPMNDiagram id="([^"]*)"/g)].map(
            ([, id]) => id,
        );

        expect(await planesOf(xml)).toEqual({
            Process_1: ["Start_1", "Sub_1", "End_1", "Flow_1", "Flow_2"],
            Sub_1: ["Task_In"],
        });
        expect(diagramIds[0]).toBe("BPMNDiagram_1");
        expect(new Set(diagramIds).size).toBe(2);
    });
});

describe("buildMerged with edges that name their end shapes", () => {
    const withEdgeEnds = (xml: string, startShapeId: string) =>
        xml
            .replace('id="Start_1_di"', `id="${startShapeId}"`)
            .replace(
                '<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">',
                `<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1" sourceElement="${startShapeId}" targetElement="Sub_1_di">`,
            );

    it("points an edge taken from one side at the end shapes the result draws", async () => {
        const moved = expanded().replace(
            '<di:waypoint x="136" y="138" />',
            '<di:waypoint x="136" y="140" />',
        );
        const versions = {
            base: expanded(),
            current: expanded(),
            incoming: withEdgeEnds(moved, "Start_1_shape"),
        };
        const { xml } = await automaticMerge(versions);

        expect(xml).toContain('sourceElement="Start_1_di" targetElement="Sub_1_di"');
        expect(xml).not.toContain("Start_1_shape");
    });
});
