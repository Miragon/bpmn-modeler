import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult, refersTo } from "../../__fixtures__/mergeResultBuilder";
import { MergeDecisions, type ScopedDecision } from "./mergeDecisions";
import type { MergeElement, MergeSide } from "../../kernel/domain/mergeResult";

const sequenceFlow = (id: string, source: string, target: string, state: MergeElement["state"]) =>
    mergeElement(id, state, {
        type: "bpmn:SequenceFlow",
        parent: "Process",
        references: [
            refersTo("bpmn:SequenceFlow#sourceRef", source),
            refersTo("bpmn:SequenceFlow#targetRef", target),
        ],
    });

/** Current removes task A; incoming adds two flows out of A, to new tasks B and C. */
const twoFlowsFromARemovedTask = () =>
    MergeDecisions.from(
        mergeResult(
            mergeElement("Process", "unchanged", { type: "bpmn:Process" }),
            mergeElement("A", "removedByCurrent", { parent: "Process" }),
            mergeElement("B", "addedByIncoming", { parent: "Process" }),
            mergeElement("C", "addedByIncoming", { parent: "Process" }),
            sequenceFlow("F", "A", "B", "addedByIncoming"),
            sequenceFlow("G", "A", "C", "addedByIncoming"),
        ),
    );

const pick = (id: string, side: MergeSide): ScopedDecision => ({
    kind: "pick",
    id,
    side,
    scope: "element",
});
const unpick = (id: string): ScopedDecision => ({ kind: "unpick", id, scope: "element" });
const leaveOutA = pick("A", "current");

function sidesOf(decisions: MergeDecisions): Record<string, MergeSide | undefined> {
    return Object.fromEntries(
        decisions.result.elements.map(({ id }) => [id, decisions.sideOf(id)]),
    );
}

describe("MergeDecisions.decide", () => {
    it("picks and takes a pick back as far as the decision's scope reaches", () => {
        const decisions = twoFlowsFromARemovedTask();

        expect(decisions.decide(pick("F", "incoming"))).toStrictEqual({
            applied: true,
            pulledIn: ["A"],
            dropped: [],
        });
        expect(decisions.originOf("F")).toBe("picked");
        expect(decisions.decide(unpick("F")).applied).toBe(true);
        expect(decisions.originOf("F")).not.toBe("picked");
    });
});

describe("MergeDecisions.wouldApply", () => {
    it("answers a refused decision as refused and changes nothing", () => {
        const decisions = twoFlowsFromARemovedTask();
        decisions.decide(pick("F", "incoming"));
        const before = sidesOf(decisions);

        expect(decisions.wouldApply(leaveOutA)).toBe(false);
        expect(sidesOf(decisions)).toStrictEqual(before);
    });

    it("answers a decision whose every blocking pick is taken back as one that applies, without applying it", () => {
        const decisions = twoFlowsFromARemovedTask();
        decisions.decide(pick("F", "incoming"));
        decisions.decide(unpick("F"));
        const before = sidesOf(decisions);

        expect(decisions.wouldApply(leaveOutA)).toBe(true);
        expect(sidesOf(decisions)).toStrictEqual(before);
        expect(decisions.originOf("A")).not.toBe("picked");
    });

    it("answers a decision another pick still blocks as refused, once the first blocker is taken back", () => {
        const decisions = twoFlowsFromARemovedTask();
        decisions.decide(pick("F", "incoming"));
        expect(decisions.decide(leaveOutA).applied).toBe(false);
        decisions.decide(pick("G", "incoming"));

        decisions.decide(unpick("F"));

        expect(decisions.wouldApply(leaveOutA)).toBe(false);
        decisions.decide(unpick("G"));
        expect(decisions.wouldApply(leaveOutA)).toBe(true);
    });

    it("answers a pick blocked by an element picked away as one that applies once that pick is taken back", () => {
        const decisions = twoFlowsFromARemovedTask();
        decisions.decide(leaveOutA);
        expect(decisions.wouldApply(pick("F", "incoming"))).toBe(false);

        decisions.decide(unpick("A"));

        expect(decisions.wouldApply(pick("F", "incoming"))).toBe(true);
    });

    it("tries an undo without taking the pick back", () => {
        const decisions = twoFlowsFromARemovedTask();
        decisions.decide(pick("F", "incoming"));

        expect(decisions.wouldApply(unpick("F"))).toBe(true);
        expect(decisions.originOf("F")).toBe("picked");
    });
});

describe("MergeDecisions.decidesAnything", () => {
    it("answers that a pick decides something", () => {
        expect(twoFlowsFromARemovedTask().decidesAnything(pick("F", "incoming"))).toBe(true);
    });

    it("answers that an undo decides something only while its element has a pick to take back", () => {
        const decisions = twoFlowsFromARemovedTask();
        expect(decisions.decidesAnything(unpick("F"))).toBe(false);

        decisions.decide(pick("F", "incoming"));
        expect(decisions.decidesAnything(unpick("F"))).toBe(true);

        decisions.decide(unpick("F"));
        expect(decisions.decidesAnything(unpick("F"))).toBe(false);
    });
});
