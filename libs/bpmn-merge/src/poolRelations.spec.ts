import { describe, expect, it } from "vitest";

import { POOLED_PROCESS_WITH_LANES, definitionsOf } from "./__fixtures__/poolsAndLanes";
import { poolRelationsOf } from "./poolRelations";

describe("poolRelationsOf", () => {
    it("reads each participant as a pool, in document order", async () => {
        const relations = poolRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect([...relations.pools]).toEqual(["Pool_A", "Pool_Black_Box"]);
    });

    it("answers the pool of each process a participant names", async () => {
        const relations = poolRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect([...relations.poolsByProcess]).toEqual([["Process_A", "Pool_A"]]);
    });

    it("gives each lane its parent: the process, the sub-process or the lane above it", async () => {
        const relations = poolRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect([...relations.laneParents]).toEqual([
            ["Lane_Top", "Process_A"],
            ["Lane_Child", "Lane_Top"],
            ["Lane_Bottom", "Process_A"],
            ["Lane_Sub", "Sub_1"],
        ]);
    });

    it("gives the lanes of a pooled process its pool, and a sub-process's lanes none", async () => {
        const relations = poolRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect([...relations.lanePools]).toEqual([
            ["Lane_Top", "Pool_A"],
            ["Lane_Child", "Pool_A"],
            ["Lane_Bottom", "Pool_A"],
        ]);
    });

    it("lists a node's lanes outer lane first, the process's lanes before a sub-process's", async () => {
        const relations = poolRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect([...relations.lanesByNode]).toEqual([
            ["Task_1", ["Lane_Top", "Lane_Child"]],
            ["Sub_1", ["Lane_Bottom"]],
            ["Task_Inner", ["Lane_Bottom", "Lane_Sub"]],
        ]);
    });

    it("reads the lanes of a process no participant names without a pool", async () => {
        const relations = poolRelationsOf(
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
    });

    it("reads no lanes of a process without an id", async () => {
        const relations = poolRelationsOf(
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
    });
});
