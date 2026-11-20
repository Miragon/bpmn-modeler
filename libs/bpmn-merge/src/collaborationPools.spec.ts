import { moddleElements } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { definitionsOf } from "./__fixtures__/poolsAndLanes";
import {
    collaborationProcessesOf,
    processesDrawnWithoutAPool,
    rootsReachedFrom,
} from "./collaborationPools";
import { poolRelationsOf } from "./poolRelations";

const PROCESSES = `
  <bpmn:process id="Process_A" />
  <bpmn:process id="Process_B" />`;

describe("collaborationProcessesOf", () => {
    it("pairs each collaboration with the processes its participants name, in document order", async () => {
        const definitions = await definitionsOf(`
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant id="Pool_B" processRef="Process_B" />
  </bpmn:collaboration>
  <bpmn:collaboration id="Collab_2">
    <bpmn:participant id="Pool_B2" processRef="Process_B" />
  </bpmn:collaboration>${PROCESSES}`);

        expect(collaborationProcessesOf(definitions)).toEqual([
            ["Collab_1", "Process_A"],
            ["Collab_1", "Process_B"],
            ["Collab_2", "Process_B"],
        ]);
    });

    it("leaves out a participant that names no process", async () => {
        const definitions = await definitionsOf(`
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_Black_Box" />
    <bpmn:participant id="Pool_A" processRef="Process_A" />
  </bpmn:collaboration>${PROCESSES}`);

        expect(collaborationProcessesOf(definitions)).toEqual([["Collab_1", "Process_A"]]);
    });

    it("leaves out a participant without an id, as the pools do", async () => {
        const definitions = await definitionsOf(`
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant processRef="Process_A" />
    <bpmn:participant id="Pool_B" processRef="Process_B" />
  </bpmn:collaboration>${PROCESSES}`);

        expect(collaborationProcessesOf(definitions)).toEqual([["Collab_1", "Process_B"]]);
        expect([...poolRelationsOf(definitions).pools]).toEqual(["Pool_B"]);
    });

    it("answers no pairs for a document without a collaboration", async () => {
        expect(collaborationProcessesOf(await definitionsOf(PROCESSES))).toEqual([]);
    });
});

describe("rootsReachedFrom", () => {
    const LANE_PROCESS = `
  <bpmn:process id="Process_L">
    <bpmn:laneSet id="LaneSet_L"><bpmn:lane id="Lane_L" /></bpmn:laneSet>
  </bpmn:process>`;

    async function rootsIn(semantic: string, owner: string) {
        const definitions = await definitionsOf(semantic);
        const root = moddleElements(definitions.rootElements).find(({ id }) => id === owner);
        return { definitions, roots: [...rootsReachedFrom(root!)].sort() };
    }

    it("reaches from a collaboration itself, the processes its participants name and every process with lanes, more than share its slot", async () => {
        const { definitions, roots } = await rootsIn(
            `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
  </bpmn:collaboration>${PROCESSES}${LANE_PROCESS}`,
            "Collab_1",
        );

        expect(roots).toEqual(["Collab_1", "Process_A", "Process_L"]);
        expect(collaborationProcessesOf(definitions)).toEqual([["Collab_1", "Process_A"]]);
    });

    it("reaches the process of a participant without an id, which bpmn-js draws all the same", async () => {
        const { definitions, roots } = await rootsIn(
            `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant processRef="Process_A" />
  </bpmn:collaboration>${PROCESSES}`,
            "Collab_1",
        );

        expect(roots).toEqual(["Collab_1", "Process_A"]);
        expect(collaborationProcessesOf(definitions)).toEqual([]);
    });

    it("reaches from a process only the process itself, though another process has lanes", async () => {
        const { roots } = await rootsIn(`${PROCESSES}${LANE_PROCESS}`, "Process_A");

        expect(roots).toEqual(["Process_A"]);
    });
});

describe("processesDrawnWithoutAPool", () => {
    const planeOf = (owner: string) => `
  <bpmndi:BPMNDiagram xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="Diagram_${owner}">
    <bpmndi:BPMNPlane id="Plane_${owner}" bpmnElement="${owner}" />
  </bpmndi:BPMNDiagram>`;
    const SEMANTIC = `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant processRef="Process_B" />
  </bpmn:collaboration>${PROCESSES}
  <bpmn:process id="Process_L">
    <bpmn:laneSet id="LaneSet_L"><bpmn:lane id="Lane_L" /></bpmn:laneSet>
  </bpmn:process>`;

    async function drawnWithoutAPool(semantic: string) {
        return [...processesDrawnWithoutAPool(await definitionsOf(semantic))].sort();
    }

    it("answers the processes a collaboration's plane draws that no pool of it names", async () => {
        expect(await drawnWithoutAPool(`${SEMANTIC}${planeOf("Collab_1")}`)).toEqual([
            "Process_B",
            "Process_L",
        ]);
    });

    it("answers none without a collaboration's plane, though a process with lanes has one of its own", async () => {
        expect(await drawnWithoutAPool(`${SEMANTIC}${planeOf("Process_L")}`)).toEqual([]);
    });
});
