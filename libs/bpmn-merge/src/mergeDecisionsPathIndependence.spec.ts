import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult, refersTo } from "./__fixtures__/mergeResultBuilder";
import { MERGE_SCENARIOS } from "./__fixtures__/mergeScenarios";
import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import { MERGE_SIDES, type MergeResult, type MergeSide } from "./mergeResult";

function stateOf(decisions: MergeDecisions) {
    return {
        sides: decisions.result.elements.map((element) => [
            element.id,
            decisions.sideOf(element.id),
            decisions.isInResult(element.id),
        ]),
        openConflicts: decisions.openConflicts,
        canBuild: decisions.canBuild,
    };
}

function otherSide(side: MergeSide): MergeSide {
    return side === "current" ? "incoming" : "current";
}

const process = mergeElement("Process", "unchanged", { type: "bpmn:Process" });
const attachedTo = (id: string, state: Parameters<typeof mergeElement>[1], host: string) =>
    mergeElement(id, state, {
        type: "bpmn:BoundaryEvent",
        parent: "Process",
        references: [refersTo("bpmn:BoundaryEvent#attachedToRef", host)],
    });

const HAND_BUILT: readonly { readonly name: string; readonly result: MergeResult }[] = [
    {
        name: "a boundary event added on a task one side removes",
        result: mergeResult(
            process,
            mergeElement("T", "removedAndChanged", { parent: "Process" }),
            attachedTo("B", "addedByIncoming", "T"),
        ),
    },
    {
        name: "a changed boundary event on a task one side removes",
        result: mergeResult(
            process,
            mergeElement("T", "removedAndChanged", { parent: "Process" }),
            attachedTo("D", "removedAndChanged", "T"),
        ),
    },
    {
        name: "a message only incoming's task names",
        result: mergeResult(
            mergeElement("M", "removedByCurrent", { type: "bpmn:Message" }),
            process,
            mergeElement("K", "bothChanged", {
                parent: "Process",
                incoming: {
                    references: [refersTo("bpmn:MessageEventDefinition#messageRef", "M")],
                },
            }),
        ),
    },
    {
        name: "an automatic gateway whose default one side removes",
        result: mergeResult(
            process,
            mergeElement("G", "takenFromIncoming", {
                type: "bpmn:ExclusiveGateway",
                parent: "Process",
                incoming: { references: [refersTo("bpmn:ExclusiveGateway#default", "F")] },
            }),
            mergeElement("F", "removedByCurrent", {
                type: "bpmn:SequenceFlow",
                parent: "Process",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", "G"),
                    refersTo("bpmn:SequenceFlow#targetRef", "X"),
                ],
            }),
            mergeElement("X", "unchanged", { parent: "Process" }),
        ),
    },
];

async function mergeResults(): Promise<{ readonly name: string; readonly result: MergeResult }[]> {
    const fromScenarios = await Promise.all(
        MERGE_SCENARIOS.map(async (scenario) => ({
            name: scenario.name,
            result: await computeMerge(scenario),
        })),
    );
    return [...fromScenarios, ...HAND_BUILT];
}

/** Every element a pick can name: the open conflicts and whatever dangles at the start. */
function pickableIds(result: MergeResult): readonly string[] {
    return MergeDecisions.from(result).openConflicts.map((conflict) => conflict.id);
}

describe("MergeDecisions path independence", () => {
    it("leaves the state as it was when a pick is reversed or refused", async () => {
        for (const { name, result } of await mergeResults()) {
            const initial = stateOf(MergeDecisions.from(result));
            for (const id of pickableIds(result)) {
                for (const side of MERGE_SIDES) {
                    const decisions = MergeDecisions.from(result);
                    const label = `${name}: ${id} ${side}`;
                    if (!decisions.pick(id, side).applied) {
                        expect(stateOf(decisions), label).toEqual(initial);
                        continue;
                    }
                    const afterPick = stateOf(decisions);

                    if (decisions.pick(id, otherSide(side)).applied) {
                        expect(decisions.pick(id, side).applied, label).toBe(true);
                        expect(stateOf(decisions), `${label}, picked back`).toEqual(afterPick);
                    }
                    expect(decisions.unpick(id).applied, label).toBe(true);
                    expect(stateOf(decisions), `${label}, unpicked`).toEqual(initial);
                }
            }
        }
    }, 30_000);

    it("agrees with the final picks made on a fresh merge", async () => {
        for (const { name, result } of await mergeResults()) {
            const ids = pickableIds(result).slice(0, 5);
            for (const [index, first] of ids.entries()) {
                for (const second of ids.slice(index + 1)) {
                    for (const firstSide of MERGE_SIDES) {
                        for (const secondSide of MERGE_SIDES) {
                            const sequence = MergeDecisions.from(result);
                            const sequenceApplied = [
                                sequence.pick(first, otherSide(firstSide)),
                                sequence.pick(second, secondSide),
                                sequence.unpick(second),
                                sequence.pick(second, secondSide),
                                sequence.pick(first, firstSide),
                            ].every((outcome) => outcome.applied);
                            const fresh = MergeDecisions.from(result);
                            const freshApplied = [
                                fresh.pick(first, firstSide),
                                fresh.pick(second, secondSide),
                            ].every((outcome) => outcome.applied);

                            if (sequenceApplied && freshApplied) {
                                expect(
                                    stateOf(sequence),
                                    `${name}: ${first} ${firstSide}, ${second} ${secondSide}`,
                                ).toEqual(stateOf(fresh));
                            }
                        }
                    }
                }
            }
        }
    }, 30_000);
});
