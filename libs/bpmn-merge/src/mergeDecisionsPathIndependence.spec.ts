import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult, refersTo } from "./__fixtures__/mergeResultBuilder";
import { MERGE_SCENARIOS } from "./__fixtures__/mergeScenarios";
import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import { descendantsOf } from "./mergeDecisionsContainment";
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
    {
        name: "a flow incoming points at a task it adds",
        result: mergeResult(
            process,
            mergeElement("B", "unchanged", { parent: "Process" }),
            mergeElement("T", "addedByIncoming", { parent: "Process" }),
            mergeElement("F", "takenFromIncoming", {
                type: "bpmn:SequenceFlow",
                parent: "Process",
                current: {
                    parent: "Process",
                    references: [refersTo("bpmn:SequenceFlow#targetRef", "B")],
                },
                incoming: {
                    parent: "Process",
                    references: [refersTo("bpmn:SequenceFlow#targetRef", "T")],
                },
            }),
        ),
    },
    {
        name: "a part id each side gives to another task",
        result: mergeResult(
            process,
            mergeElement("X", "bothChanged", { parent: "Process", current: { parts: ["P"] } }),
            mergeElement("Y", "takenFromIncoming", {
                parent: "Process",
                incoming: { parent: "Process", parts: ["P"] },
            }),
        ),
    },
    {
        name: "a task current adds in a lane incoming removes",
        result: mergeResult(
            mergeElement("Process", "bothChanged", {
                type: "bpmn:Process",
                current: { parts: ["LaneSet_1"] },
            }),
            mergeElement("Lane_C", "removedByIncoming", {
                type: "bpmn:Lane",
                parent: "Process",
                container: "LaneSet_1",
            }),
            mergeElement("Task_N", "addedByCurrent", { parent: "Process", lanes: ["Lane_C"] }),
            mergeElement("B", "unchanged", { parent: "Process" }),
            mergeElement("F", "takenFromCurrent", {
                type: "bpmn:SequenceFlow",
                parent: "Process",
                current: {
                    parent: "Process",
                    references: [refersTo("bpmn:SequenceFlow#targetRef", "Task_N")],
                },
                incoming: {
                    parent: "Process",
                    references: [refersTo("bpmn:SequenceFlow#targetRef", "B")],
                },
            }),
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

interface PickStep {
    readonly kind: "pick" | "pickWithContents";
    readonly id: string;
    readonly side: MergeSide;
}

type Step = PickStep | { readonly kind: "unpick"; readonly id: string };

function take(decisions: MergeDecisions, step: Step) {
    return step.kind === "unpick"
        ? decisions.unpick(step.id)
        : decisions[step.kind](step.id, step.side);
}

function choicesFor(id: string): readonly PickStep[] {
    return MERGE_SIDES.flatMap((side) => [
        { kind: "pick", id, side } as const,
        { kind: "pickWithContents", id, side } as const,
    ]);
}

/** Replays the steps, all of which applied before; returns the picks they leave. */
function replayed(result: MergeResult, steps: readonly Step[]) {
    const decisions = MergeDecisions.from(result);
    const picks = new Map<string, MergeSide>();
    for (const step of steps) {
        expect(take(decisions, step).applied).toBe(true);
        if (step.kind === "unpick") {
            picks.delete(step.id);
        } else {
            const picked =
                step.kind === "pick"
                    ? [step.id]
                    : [step.id, ...descendantsOf(step.id, result.elements)];
            picked.forEach((id) => picks.set(id, step.side));
        }
    }
    return { decisions, picks };
}

/** Contract A: every pick sits on its side. Contract B: every open conflict has a choice that applies. */
function expectPicksKeptAndAChoiceForEveryConflict(
    result: MergeResult,
    steps: readonly Step[],
    label: string,
) {
    const { decisions, picks } = replayed(result, steps);
    const misplaced = [...picks].filter(([id, side]) => decisions.sideOf(id) !== side);
    expect(misplaced, `${label}: picks off their side`).toEqual([]);
    const deadEnds = decisions.openConflicts
        .map((conflict) => conflict.id)
        .filter(
            (id) =>
                !choicesFor(id).some(
                    (choice) => take(replayed(result, steps).decisions, choice).applied,
                ),
        );
    expect(deadEnds, `${label}: open conflicts without a choice`).toEqual([]);
}

/** The open conflicts at the start and the elements they name; every element of a small hand-built result. */
function elementsToExplore(result: MergeResult): readonly string[] {
    if (result.elements.length <= 8) {
        return result.elements.map((element) => element.id);
    }
    const related = MergeDecisions.from(result).openConflicts.flatMap((conflict) => [
        conflict.id,
        ...conflict.related,
    ]);
    return [...new Set(related)];
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

    it("keeps an element with its connections as the plain pick followed by a pick of each flow", async () => {
        let offers = 0;
        for (const { name, result } of await mergeResults()) {
            for (const { id } of result.elements) {
                for (const side of MERGE_SIDES) {
                    const together = MergeDecisions.from(result);
                    const connections = together.connectionsLeftOut(id, side);
                    if (connections.length === 0) continue;
                    offers += 1;
                    const label = `${name}: ${id} ${side}`;
                    const oneByOne = MergeDecisions.from(result);
                    const applied = [
                        oneByOne.pick(id, side),
                        ...connections.map((connection) => oneByOne.pick(connection, side)),
                    ].every((outcome) => outcome.applied);

                    expect(together.pickWithConnections(id, side).applied, label).toBe(applied);
                    if (applied) expect(stateOf(together), label).toEqual(stateOf(oneByOne));
                }
            }
        }
        expect(offers).toBeGreaterThan(0);
    }, 30_000);

    it("keeps every pick on its side and leaves a choice for every open conflict", async () => {
        for (const { name, result } of await mergeResults()) {
            expectPicksKeptAndAChoiceForEveryConflict(result, [], name);
            for (const id of elementsToExplore(result)) {
                for (const first of choicesFor(id)) {
                    if (!take(MergeDecisions.from(result), first).applied) {
                        continue;
                    }
                    const label = `${name}: ${first.kind} ${id} ${first.side}`;
                    expectPicksKeptAndAChoiceForEveryConflict(result, [first], label);
                    const afterFirst = replayed(result, [first]).decisions;
                    const nextIds = [
                        ...new Set([
                            ...afterFirst.openConflicts.map((conflict) => conflict.id),
                            ...elementsToExplore(result),
                        ]),
                    ];
                    for (const nextId of nextIds) {
                        for (const side of MERGE_SIDES) {
                            const second: Step = { kind: "pick", id: nextId, side };
                            if (!take(replayed(result, [first]).decisions, second).applied) {
                                continue;
                            }
                            const unpickFirst: Step = { kind: "unpick", id };
                            expectPicksKeptAndAChoiceForEveryConflict(
                                result,
                                [first, second],
                                `${label}, pick ${nextId} ${side}`,
                            );
                            if (
                                take(replayed(result, [first, second]).decisions, unpickFirst)
                                    .applied
                            ) {
                                expectPicksKeptAndAChoiceForEveryConflict(
                                    result,
                                    [first, second, unpickFirst],
                                    `${label}, pick ${nextId} ${side}, unpick ${id}`,
                                );
                            }
                        }
                    }
                }
            }
        }
    }, 120_000);
});
