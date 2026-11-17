import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult, refersTo } from "./__fixtures__/mergeResultBuilder";
import { MergeDecisions } from "./mergeDecisions";
import type { MergeElement } from "./mergeResult";

const process = mergeElement("Process", "unchanged", { type: "bpmn:Process" });

const sequenceFlow = (id: string, source: string, target: string, state: MergeElement["state"]) =>
    mergeElement(id, state, {
        type: "bpmn:SequenceFlow",
        parent: "Process",
        references: [
            refersTo("bpmn:SequenceFlow#sourceRef", source),
            refersTo("bpmn:SequenceFlow#targetRef", target),
        ],
    });

/** Incoming adds flow F from A to B, a task only incoming has; current changed task A. */
const flowToAnAddedTask = () =>
    mergeResult(
        process,
        mergeElement("A", "takenFromCurrent", { parent: "Process" }),
        mergeElement("B", "addedByIncoming", { parent: "Process" }),
        mergeElement("C", "bothChanged", { parent: "Process" }),
        sequenceFlow("F", "A", "B", "bothChanged"),
    );

describe("MergeDecisions.originOf", () => {
    it("names a user pick as picked, a target it pulled in as a consequence and an untouched element as automatic", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                process,
                mergeElement("A", "unchanged", { parent: "Process" }),
                mergeElement("B", "removedByCurrent", { parent: "Process" }),
                sequenceFlow("F", "A", "B", "bothChanged"),
            ),
        );

        expect(decisions.pick("F", "incoming")).toEqual({
            applied: true,
            pulledIn: ["B"],
            dropped: [],
        });

        expect(decisions.originOf("F")).toBe("picked");
        expect(decisions.originOf("B")).toBe("consequence");
        expect(decisions.originOf("A")).toBe("automatic");
    });

    it("names a pick of the automatic side as picked", () => {
        const decisions = MergeDecisions.from(flowToAnAddedTask());

        decisions.pick("A", "current");

        expect(decisions.originOf("A")).toBe("picked");
    });

    it("names every element of pickWithContents as picked", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                process,
                mergeElement("Sub", "bothChanged", { type: "bpmn:SubProcess", parent: "Process" }),
                mergeElement("Inner", "bothChanged", { parent: "Sub" }),
            ),
        );

        decisions.pickWithContents("Sub", "incoming");

        expect(decisions.originOf("Sub")).toBe("picked");
        expect(decisions.originOf("Inner")).toBe("picked");
    });

    it("returns a consequence to automatic once the pick that caused it is taken back", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                process,
                mergeElement("A", "unchanged", { parent: "Process" }),
                mergeElement("B", "removedByCurrent", { parent: "Process" }),
                sequenceFlow("F", "A", "B", "bothChanged"),
            ),
        );
        decisions.pick("F", "incoming");

        decisions.unpick("F");

        expect(decisions.originOf("B")).toBe("automatic");
    });

    it("is undefined for an open element, including a dangling automatic one", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                process,
                mergeElement("A", "removedByCurrent", { parent: "Process" }),
                mergeElement("B", "addedByIncoming", { parent: "Process" }),
                mergeElement("C", "bothChanged", { parent: "Process" }),
                sequenceFlow("F", "A", "B", "addedByIncoming"),
            ),
        );

        expect(decisions.originOf("C")).toBeUndefined();
        expect(decisions.originOf("A")).toBeUndefined();
    });

    it("rejects an id the merge result does not have", () => {
        const decisions = MergeDecisions.from(flowToAnAddedTask());

        expect(() => decisions.originOf("Nowhere")).toThrow(
            "The merge result has no element Nowhere",
        );
    });
});
