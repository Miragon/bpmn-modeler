import { describe, expect, it } from "vitest";

import {
    mergeElement,
    mergeResult,
    mergeResultWithoutBase,
    refersTo,
} from "./__fixtures__/mergeResultBuilder";
import { MergeDecisions } from "./mergeDecisions";
import type { ElementState, MergeElement, MergeResult, MergeSide } from "./mergeResult";

const process = mergeElement("Process", "unchanged", { type: "bpmn:Process" });

const sequenceFlow = (
    id: string,
    source: string,
    target: string,
    state: ElementState,
    parts: readonly string[] = [],
) =>
    mergeElement(id, state, {
        type: "bpmn:SequenceFlow",
        parent: "Process",
        parts,
        references: [
            refersTo("bpmn:SequenceFlow#sourceRef", source),
            refersTo("bpmn:SequenceFlow#targetRef", target),
        ],
    });

/** Current removed Task_Reject with the flows into and out of it; incoming kept all of them. */
const removedWithItsFlows = (endState: ElementState = "unchanged", ...more: MergeElement[]) =>
    mergeResult(
        process,
        mergeElement("Gateway", "unchanged", { parent: "Process" }),
        mergeElement("End", endState, { parent: "Process" }),
        mergeElement("Task_Reject", "removedByCurrent", { parent: "Process" }),
        sequenceFlow("Flow_No", "Gateway", "Task_Reject", "removedByCurrent"),
        sequenceFlow("Flow_Rejected", "Task_Reject", "End", "removedByCurrent"),
        ...more,
    );

function stateOf(decisions: MergeDecisions) {
    return decisions.result.elements.map(({ id }) => [
        id,
        decisions.sideOf(id),
        decisions.isInResult(id),
        decisions.originOf(id),
    ]);
}

describe("MergeDecisions.pickWithConnections", () => {
    it("offers the flows the other side removed with the element in the outcome of a plain pick", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());

        expect(decisions.pick("Task_Reject", "incoming")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: [],
            connectionsLeftOut: ["Flow_No", "Flow_Rejected"],
        });
        expect(decisions.connectionsLeftOut("Task_Reject", "incoming")).toEqual([
            "Flow_No",
            "Flow_Rejected",
        ]);
    });

    it("keeps the element and those flows as picks on its side in one step", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());

        expect(decisions.pickWithConnections("Task_Reject", "incoming")).toEqual({
            applied: true,
            pulledIn: [],
            dropped: [],
        });

        for (const id of ["Task_Reject", "Flow_No", "Flow_Rejected"]) {
            expect(decisions.sideOf(id)).toBe("incoming");
            expect(decisions.isInResult(id)).toBe(true);
            expect(decisions.originOf(id)).toBe("picked");
        }
        expect(decisions.connectionsLeftOut("Task_Reject", "incoming")).toEqual([]);
    });

    it("leaves out a flow whose other end the result does not hold", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows("removedByCurrent"));

        expect(decisions.connectionsLeftOut("Task_Reject", "incoming")).toEqual(["Flow_No"]);
        decisions.pickWithConnections("Task_Reject", "incoming");

        expect(decisions.isInResult("End")).toBe(false);
        expect(decisions.isInResult("Flow_Rejected")).toBe(false);
    });

    it("leaves out a flow the user picked away", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());
        decisions.pick("Flow_No", "current");

        decisions.pickWithConnections("Task_Reject", "incoming");

        expect(decisions.sideOf("Flow_No")).toBe("current");
        expect(decisions.isInResult("Flow_No")).toBe(false);
        expect(decisions.isInResult("Flow_Rejected")).toBe(true);
    });

    it("does not offer a flow the side added, which the pick brings in anyway", () => {
        const decisions = MergeDecisions.from(
            removedWithItsFlows(
                "unchanged",
                mergeElement("End_Escalated", "addedByIncoming", { parent: "Process" }),
                sequenceFlow("Flow_Escalate", "Task_Reject", "End_Escalated", "addedByIncoming"),
            ),
        );

        expect(decisions.connectionsLeftOut("Task_Reject", "incoming")).toEqual([
            "Flow_No",
            "Flow_Rejected",
        ]);
        decisions.pickWithConnections("Task_Reject", "incoming");

        expect(decisions.isInResult("Flow_Escalate")).toBe(true);
        expect(decisions.originOf("Flow_Escalate")).toBe("automatic");
    });

    it.each<[string, MergeResult, string, MergeSide]>([
        [
            "an element the other side did not remove",
            mergeResult(
                process,
                mergeElement("A", "unchanged", { parent: "Process" }),
                mergeElement("Task", "takenFromIncoming", { parent: "Process" }),
                sequenceFlow("F", "A", "Task", "removedByCurrent"),
            ),
            "Task",
            "incoming",
        ],
        ["a pick to the removing side", removedWithItsFlows(), "Task_Reject", "current"],
        [
            "a result without a base",
            mergeResultWithoutBase(
                process,
                mergeElement("A", "differs", { parent: "Process" }),
                mergeElement("Task", "onlyInIncoming", { parent: "Process" }),
                sequenceFlow("F", "A", "Task", "onlyInIncoming"),
            ),
            "Task",
            "incoming",
        ],
    ])("offers nothing for %s", (_name, result, id, side) => {
        const decisions = MergeDecisions.from(result);

        expect(decisions.connectionsLeftOut(id, side)).toEqual([]);
        expect(decisions.pick(id, side)).not.toHaveProperty("connectionsLeftOut");
    });

    it("is refused as a whole and changes nothing when a flow cannot be kept", () => {
        const withPart = MergeDecisions.from(
            mergeResult(
                process,
                mergeElement("Gateway", "unchanged", { parent: "Process" }),
                mergeElement("End", "unchanged", { parent: "Process" }),
                mergeElement("Task_Reject", "removedByCurrent", { parent: "Process" }),
                sequenceFlow("Flow_No", "Gateway", "Task_Reject", "removedByCurrent", ["Cond_1"]),
                sequenceFlow("Flow_Rejected", "Task_Reject", "End", "removedByCurrent"),
                mergeElement("X", "bothChanged", { parent: "Process", parts: ["Cond_1"] }),
            ),
        );
        expect(withPart.pick("X", "current").applied).toBe(true);
        const before = stateOf(withPart);

        const outcome = withPart.pickWithConnections("Task_Reject", "incoming");

        expect(outcome.applied).toBe(false);
        expect(outcome.applied === false && outcome.blockedBy[0]?.reason.obstacle.kind).toBe(
            "idHeldByAnother",
        );
        expect(stateOf(withPart)).toEqual(before);
    });

    it("unpickWithConnections returns the element and its flows to their automatic resolution", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());
        const before = stateOf(decisions);
        decisions.pickWithConnections("Task_Reject", "incoming");

        expect(decisions.unpickWithConnections("Task_Reject").applied).toBe(true);

        expect(stateOf(decisions)).toEqual(before);
    });

    it("unpick of the element alone keeps it as a consequence of its picked flows", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());
        decisions.pickWithConnections("Task_Reject", "incoming");

        decisions.unpick("Task_Reject");

        expect(decisions.isInResult("Task_Reject")).toBe(true);
        expect(decisions.originOf("Task_Reject")).toBe("consequence");
    });

    it("unpickWithConnections keeps a flow the user picked to the other side", () => {
        const decisions = MergeDecisions.from(removedWithItsFlows());
        decisions.pick("Task_Reject", "incoming");
        decisions.pick("Flow_No", "current");

        decisions.unpickWithConnections("Task_Reject");

        expect(decisions.originOf("Flow_No")).toBe("picked");
        expect(decisions.sideOf("Task_Reject")).toBe("current");
    });
});

describe("MergeDecisions.unpickWithContents", () => {
    const subProcess = () =>
        mergeResult(
            process,
            mergeElement("Sub", "bothChanged", { type: "bpmn:SubProcess", parent: "Process" }),
            mergeElement("Inner", "bothChanged", { parent: "Sub" }),
            mergeElement("Other", "takenFromCurrent", { parent: "Sub" }),
        );

    it("returns a container and everything kept with it to their automatic resolution", () => {
        const decisions = MergeDecisions.from(subProcess());
        const before = stateOf(decisions);
        decisions.pickWithContents("Sub", "incoming");

        expect(decisions.unpickWithContents("Sub").applied).toBe(true);

        expect(stateOf(decisions)).toEqual(before);
    });

    it("keeps a descendant the user picked to the other side", () => {
        const decisions = MergeDecisions.from(subProcess());
        decisions.pickWithContents("Sub", "incoming");
        decisions.pick("Inner", "current");

        decisions.unpickWithContents("Sub");

        expect(decisions.originOf("Sub")).toBeUndefined();
        expect(decisions.originOf("Inner")).toBe("picked");
        expect(decisions.sideOf("Inner")).toBe("current");
    });

    it("equals unpicking each element it takes back", () => {
        const together = MergeDecisions.from(subProcess());
        const oneByOne = MergeDecisions.from(subProcess());
        for (const decisions of [together, oneByOne]) {
            decisions.pickWithContents("Sub", "incoming");
        }

        together.unpickWithContents("Sub");
        for (const id of ["Sub", "Inner", "Other"]) oneByOne.unpick(id);

        expect(stateOf(together)).toEqual(stateOf(oneByOne));
    });
});
