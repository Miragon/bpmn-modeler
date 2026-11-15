import { describe, expect, it } from "vitest";

import { scenarioNamed } from "./__fixtures__/mergeScenarios";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge } from "./computeMerge";
import { mergeNavigationOrder } from "./mergeNavigationOrder";

async function orderOf(scenario: string) {
    const versions = scenarioNamed(scenario);
    const result = await computeMerge(versions);
    const order = await mergeNavigationOrder(result, await prepareMergeSources(versions));
    return { order, resultIds: result.elements.map(({ id }) => id) };
}

describe("mergeNavigationOrder", () => {
    it("orders the merge elements from start to end along current's flow, puts an element only incoming has after its incoming predecessor, and leaves shape-less elements at the end", async () => {
        const { order, resultIds } = await orderOf("table: removed and changed");

        expect([...order].sort()).toEqual([...resultIds].sort());
        expect(order.slice(0, 4)).toEqual([
            "Start_Order",
            "Flow_Start",
            "Task_Check",
            "Flow_Checked",
        ]);
        expect(order.indexOf("End_Rejected")).toBe(order.indexOf("Task_Reject") + 1);
        const shapeless = ["Message_Order", "Error_Stock", "Collaboration_1", "Process_1"];
        expect(order.filter((id) => shapeless.includes(id))).toEqual(shapeless);
        expect(order.indexOf("Message_Order")).toBeGreaterThan(order.indexOf("End_Done"));
    });

    it("puts a pool and a message flow only incoming has at the end, in result order", async () => {
        const { order, resultIds } = await orderOf("rule: message flow end");

        expect(order).toHaveLength(resultIds.length);
        expect(order.slice(-2)).toEqual(["Participant_Customer", "MessageFlow_Order"]);
    });
});
