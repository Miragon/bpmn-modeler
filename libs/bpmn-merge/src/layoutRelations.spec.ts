import { describe, expect, it } from "vitest";

import { POOLED_PROCESS_WITH_LANES, definitionsOf } from "./__fixtures__/poolsAndLanes";
import { layoutRelationsOf } from "./layoutRelations";
import { poolRelationsOf } from "./poolRelations";

describe("layoutRelationsOf", () => {
    it("carries the pool and lane reading for its readers", async () => {
        const definitions = await definitionsOf(POOLED_PROCESS_WITH_LANES);

        expect(layoutRelationsOf(definitions)).toMatchObject(poolRelationsOf(definitions));
    });

    it("gives a pooled process's nodes its pool, inside its sub-processes too", async () => {
        const { nodes } = layoutRelationsOf(await definitionsOf(POOLED_PROCESS_WITH_LANES));

        expect(nodes.get("Task_1")).toMatchObject({ pool: "Pool_A", subProcesses: [] });
        expect(nodes.get("Task_Inner")).toMatchObject({ pool: "Pool_A", subProcesses: ["Sub_1"] });
    });

    it("gives the nodes of a process no participant names no pool", async () => {
        const { nodes } = layoutRelationsOf(
            await definitionsOf(`
  <bpmn:process id="Process_A">
    <bpmn:task id="Task_1" />
  </bpmn:process>`),
        );

        expect(nodes.get("Task_1")).not.toHaveProperty("pool");
    });

    it("reads no nodes of a process without an id", async () => {
        const { nodes } = layoutRelationsOf(
            await definitionsOf(`
  <bpmn:process>
    <bpmn:task id="Task_1" />
  </bpmn:process>`),
        );

        expect(nodes.size).toBe(0);
    });
});
