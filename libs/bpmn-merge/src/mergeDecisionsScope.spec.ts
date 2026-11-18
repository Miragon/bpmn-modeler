import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult, refersTo } from "./__fixtures__/mergeResultBuilder";
import { MergeDecisions } from "./mergeDecisions";
import type { MergeSide } from "./mergeResult";
import type { PickScope } from "./pickOutcome";

function removedSubProcess(): MergeDecisions {
    return MergeDecisions.from(
        mergeResult(
            mergeElement("Process_1", "unchanged", { type: "bpmn:Process" }),
            mergeElement("Gateway", "unchanged", { parent: "Process_1" }),
            mergeElement("Sub", "removedByCurrent", {
                type: "bpmn:SubProcess",
                parent: "Process_1",
            }),
            mergeElement("Inner", "removedByCurrent", { parent: "Sub" }),
            mergeElement("Flow_In", "removedByCurrent", {
                type: "bpmn:SequenceFlow",
                parent: "Process_1",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", "Gateway"),
                    refersTo("bpmn:SequenceFlow#targetRef", "Sub"),
                ],
            }),
        ),
    );
}

const PICKS: Record<PickScope, (decisions: MergeDecisions, id: string, side: MergeSide) => void> = {
    element: (decisions, id, side) => decisions.pick(id, side),
    withContents: (decisions, id, side) => decisions.pickWithContents(id, side),
    withRemoved: (decisions, id, side) => decisions.pickWithRemoved(id, side),
};

const UNPICKS: Record<PickScope, (decisions: MergeDecisions, id: string) => void> = {
    element: (decisions, id) => decisions.unpick(id),
    withContents: (decisions, id) => decisions.unpickWithContents(id),
    withRemoved: (decisions, id) => decisions.unpickWithRemoved(id),
};

const picksOf = (decisions: MergeDecisions) =>
    decisions.result.elements.map(({ id }) => [id, decisions.originOf(id), decisions.sideOf(id)]);

describe("MergeDecisions scoped picks", () => {
    it.each(["element", "withContents", "withRemoved"] as const)(
        "picks and takes back as far as %s reaches",
        (scope) => {
            const scoped = removedSubProcess();
            const direct = removedSubProcess();

            scoped.pickScoped("Sub", "incoming", scope);
            PICKS[scope](direct, "Sub", "incoming");
            expect(picksOf(scoped)).toStrictEqual(picksOf(direct));

            scoped.unpickScoped("Sub", scope);
            UNPICKS[scope](direct, "Sub");
            expect(picksOf(scoped)).toStrictEqual(picksOf(direct));
        },
    );

    it.each([
        ["incoming", true],
        ["current", false],
    ] as const)(
        "tells whether %s's version holds an element, %s for one current removed",
        (side, holds) => {
            expect(removedSubProcess().holds("Sub", side)).toBe(holds);
        },
    );
});
