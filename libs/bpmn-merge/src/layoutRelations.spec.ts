import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { layoutRelationsOf } from "./layoutRelations";

async function definitionsOf(semantic: string) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${semantic}
</bpmn:definitions>`;
    return (await parseWithoutWarnings(xml)).rootElement;
}

const POOLED_PROCESS_WITH_LANES = `
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant id="Pool_Black_Box" />
  </bpmn:collaboration>
  <bpmn:process id="Process_A">
    <bpmn:laneSet id="LaneSet_A">
      <bpmn:lane id="Lane_Top">
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
        <bpmn:childLaneSet id="LaneSet_Child">
          <bpmn:lane id="Lane_Child">
            <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
          </bpmn:lane>
        </bpmn:childLaneSet>
      </bpmn:lane>
      <bpmn:lane id="Lane_Bottom">
        <bpmn:flowNodeRef>Sub_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Inner</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Task_1" />
    <bpmn:subProcess id="Sub_1">
      <bpmn:laneSet id="LaneSet_Sub">
        <bpmn:lane id="Lane_Sub">
          <bpmn:flowNodeRef>Task_Inner</bpmn:flowNodeRef>
        </bpmn:lane>
      </bpmn:laneSet>
      <bpmn:task id="Task_Inner" />
    </bpmn:subProcess>
  </bpmn:process>`;

describe("layoutRelationsOf", () => {
    it("reads each participant as a pool, in document order", async () => {
        const relations = layoutRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect([...relations.pools]).toEqual(["Pool_A", "Pool_Black_Box"]);
    });

    it("gives each lane its parent: the process, the sub-process or the lane above it", async () => {
        const relations = layoutRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect([...relations.laneParents]).toEqual([
            ["Lane_Top", "Process_A"],
            ["Lane_Child", "Lane_Top"],
            ["Lane_Bottom", "Process_A"],
            ["Lane_Sub", "Sub_1"],
        ]);
    });

    it("gives the lanes of a pooled process its pool, and a sub-process's lanes none", async () => {
        const relations = layoutRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect([...relations.lanePools]).toEqual([
            ["Lane_Top", "Pool_A"],
            ["Lane_Child", "Pool_A"],
            ["Lane_Bottom", "Pool_A"],
        ]);
    });

    it("lists a node's lanes outer lane first, the process's lanes before a sub-process's", async () => {
        const relations = layoutRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect([...relations.lanesByNode]).toEqual([
            ["Task_1", ["Lane_Top", "Lane_Child"]],
            ["Sub_1", ["Lane_Bottom"]],
            ["Task_Inner", ["Lane_Bottom", "Lane_Sub"]],
        ]);
    });

    it("gives a pooled process's nodes its pool, inside its sub-processes too", async () => {
        const { nodes } = layoutRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect(nodes.get("Task_1")).toMatchObject({ pool: "Pool_A", subProcesses: [] });
        expect(nodes.get("Task_Inner")).toMatchObject({ pool: "Pool_A", subProcesses: ["Sub_1"] });
    });

    it("reads the lanes of a process no participant names without a pool", async () => {
        const relations = layoutRelationsOf(
            await definitionsOf(`
  <bpmn:process id="Process_A">
    <bpmn:laneSet id="LaneSet_A">
      <bpmn:lane id="Lane_A">
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Task_1" />
  </bpmn:process>`),
        );

        expect([...relations.pools]).toEqual([]);
        expect([...relations.laneParents]).toEqual([["Lane_A", "Process_A"]]);
        expect([...relations.lanePools]).toEqual([]);
        expect(relations.lanesByNode.get("Task_1")).toEqual(["Lane_A"]);
        expect(relations.nodes.get("Task_1")).not.toHaveProperty("pool");
    });

    it("reads neither the lanes nor the nodes of a process without an id", async () => {
        const relations = layoutRelationsOf(
            await definitionsOf(`
  <bpmn:process>
    <bpmn:laneSet id="LaneSet_A">
      <bpmn:lane id="Lane_A">
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:task id="Task_1" />
  </bpmn:process>`),
        );

        expect(relations.laneParents.size).toBe(0);
        expect(relations.lanesByNode.size).toBe(0);
        expect(relations.nodes.size).toBe(0);
    });
});
