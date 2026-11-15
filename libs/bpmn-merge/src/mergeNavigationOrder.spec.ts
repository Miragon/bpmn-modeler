import { describe, expect, it } from "vitest";

import { baseModel, cloneModel, removeFlow } from "./__fixtures__/baseModel";
import { renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { scenarioNamed } from "./__fixtures__/mergeScenarios";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge } from "./computeMerge";
import { mergeNavigationOrder } from "./mergeNavigationOrder";
import type { MergeVersions } from "./mergeVersions";

async function orderOfVersions(versions: MergeVersions) {
    const result = await computeMerge(versions);
    const order = mergeNavigationOrder(result, await prepareMergeSources(versions));
    return { order, resultIds: result.elements.map(({ id }) => id) };
}

const orderOf = (scenario: string) => orderOfVersions(scenarioNamed(scenario));

/** Incoming puts Task_A → Task_B → Task_C between Task_Check and Gateway_Ok; current keeps the base. */
function chainOnlyIncomingAdds(): MergeVersions {
    const base = baseModel("c7");
    const incoming = cloneModel(base);
    removeFlow(incoming, "Flow_Checked");
    incoming.nodes.push(
        ...["Task_A", "Task_B", "Task_C"].map((id, index) => ({
            id,
            type: "task" as const,
            name: id,
            x: 1000 + index * 120,
            y: 320,
            lane: "Lane_Manager",
        })),
    );
    incoming.flows.push(
        { id: "Flow_Check_A", source: "Task_Check", target: "Task_A" },
        { id: "Flow_A_B", source: "Task_A", target: "Task_B" },
        { id: "Flow_B_C", source: "Task_B", target: "Task_C" },
        { id: "Flow_C_Ok", source: "Task_C", target: "Gateway_Ok" },
    );
    return { base: renderBpmn(base), current: renderBpmn(base), incoming: renderBpmn(incoming) };
}

describe("mergeNavigationOrder", () => {
    it("orders the merge elements from start to end along current's flow and leaves shape-less elements at the end", async () => {
        const { order, resultIds } = await orderOf("table: removed and changed");

        expect([...order].sort()).toEqual([...resultIds].sort());
        expect(order.slice(0, 4)).toEqual([
            "Start_Order",
            "Flow_Start",
            "Task_Check",
            "Flow_Checked",
        ]);
        const shapeless = ["Message_Order", "Error_Stock", "Collaboration_1", "Process_1"];
        expect(order.filter((id) => shapeless.includes(id))).toEqual(shapeless);
        expect(order.indexOf("Message_Order")).toBeGreaterThan(order.indexOf("End_Done"));
    });

    it("puts a flow before the target it leads to", async () => {
        const { order } = await orderOf("table: removed and changed");

        expect(order.indexOf("Flow_Rejected")).toBeGreaterThan(order.indexOf("Task_Reject"));
        expect(order.indexOf("End_Rejected")).toBeGreaterThan(order.indexOf("Flow_Rejected"));
    });

    it("walks a chain only incoming added from its first neighbour, in flow direction, before the shape-less elements", async () => {
        const { order } = await orderOfVersions(chainOnlyIncomingAdds());

        const chain = [
            "Task_Check",
            "Flow_Check_A",
            "Task_A",
            "Flow_A_B",
            "Task_B",
            "Flow_B_C",
            "Task_C",
            "Flow_C_Ok",
        ];
        expect(order.filter((id) => chain.includes(id))).toEqual(chain);
        expect(order.indexOf("Flow_C_Ok")).toBeLessThan(order.indexOf("Participant_Shop"));
    });

    it("puts a pool and a message flow only incoming has at the end, in result order", async () => {
        const { order, resultIds } = await orderOf("rule: message flow end");

        expect(order).toHaveLength(resultIds.length);
        expect(order.slice(-2)).toEqual(["Participant_Customer", "MessageFlow_Order"]);
    });
});
