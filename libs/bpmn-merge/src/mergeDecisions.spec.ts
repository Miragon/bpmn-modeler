import { describe, expect, it } from "vitest";

import {
    mergeElement,
    mergeResult,
    mergeResultWithoutBase,
    refersTo,
} from "./__fixtures__/mergeResultBuilder";
import { MergeDecisions } from "./mergeDecisions";
import type { ConflictState, MergeElement, MergeSide, ResolvedState } from "./mergeResult";

function sidesOfEveryElement(decisions: MergeDecisions): Record<string, MergeSide | undefined> {
    return Object.fromEntries(
        decisions.result.elements.map((element) => [element.id, decisions.sideOf(element.id)]),
    );
}

function openIds(decisions: MergeDecisions): string[] {
    return decisions.openConflicts.map((conflict) => conflict.id);
}

const sequenceFlow = (id: string, source: string, target: string, state: MergeElement["state"]) =>
    mergeElement(id, state, {
        type: "bpmn:SequenceFlow",
        parent: "Process",
        references: [
            refersTo("bpmn:SequenceFlow#sourceRef", source),
            refersTo("bpmn:SequenceFlow#targetRef", target),
        ],
    });

const process = mergeElement("Process", "unchanged", {
    type: "bpmn:Process",
    parts: ["Property_1"],
});

/** Current removes task A; incoming adds a flow from A to a new task B. */
const flowFromARemovedTask = () =>
    mergeResult(
        process,
        mergeElement("A", "removedByCurrent", { parent: "Process" }),
        mergeElement("B", "addedByIncoming", { parent: "Process" }),
        sequenceFlow("F", "A", "B", "addedByIncoming"),
    );

describe("MergeDecisions", () => {
    describe("automatic resolutions", () => {
        it.each<[ResolvedState, MergeSide, boolean]>([
            ["unchanged", "current", true],
            ["sameChange", "current", true],
            ["sameAddition", "current", true],
            ["removedByBoth", "current", false],
            ["takenFromCurrent", "current", true],
            ["addedByCurrent", "current", true],
            ["removedByCurrent", "current", false],
            ["takenFromIncoming", "incoming", true],
            ["addedByIncoming", "incoming", true],
            ["removedByIncoming", "incoming", false],
        ])("resolves %s to %s", (state, side, inResult) => {
            const decisions = MergeDecisions.from(mergeResult(mergeElement("A", state)));

            expect(decisions.sideOf("A")).toBe(side);
            expect(decisions.isInResult("A")).toBe(inResult);
            expect(decisions.openConflicts).toEqual([]);
            expect(decisions.canBuild).toBe(true);
        });

        it.each<ConflictState>([
            "bothChanged",
            "bothAdded",
            "removedAndChanged",
            "changedAndRemoved",
        ])("leaves %s open", (state) => {
            const decisions = MergeDecisions.from(mergeResult(mergeElement("A", state)));

            expect(decisions.openConflicts).toEqual([{ id: "A", state, related: [] }]);
            expect(decisions.sideOf("A")).toBeUndefined();
            expect(decisions.isInResult("A")).toBeUndefined();
            expect(decisions.canBuild).toBe(false);
        });

        it.each<ConflictState>(["onlyInCurrent", "onlyInIncoming", "differs"])(
            "leaves %s open without a base",
            (state) => {
                const decisions = MergeDecisions.from(
                    mergeResultWithoutBase(mergeElement("A", state)),
                );

                expect(decisions.openConflicts).toEqual([{ id: "A", state, related: [] }]);
            },
        );

        it("keeps the merge result it was made from", () => {
            const result = flowFromARemovedTask();

            expect(MergeDecisions.from(result).result).toBe(result);
        });
    });

    describe("rules on the tentative result", () => {
        interface BrokenRule {
            readonly rule: string;
            readonly dependent: MergeElement;
            /** Removed by current, so the automatic resolution leaves it out. */
            readonly target: string;
            readonly targetType?: string;
            readonly targetParts?: readonly string[];
            readonly fragment: string;
        }

        const brokenRules: BrokenRule[] = [
            {
                rule: "its parent",
                dependent: mergeElement("Task_Inner", "addedByIncoming", { parent: "SubProcess" }),
                target: "SubProcess",
                targetType: "bpmn:SubProcess",
                fragment: "lies in SubProcess",
            },
            {
                rule: "a sequence flow's source",
                dependent: sequenceFlow("Flow", "Task_Target", "Process", "addedByIncoming"),
                target: "Task_Target",
                fragment: "bpmn:SequenceFlow#sourceRef",
            },
            {
                rule: "a sequence flow's target",
                dependent: sequenceFlow("Flow", "Process", "Task_Target", "addedByIncoming"),
                target: "Task_Target",
                fragment: "bpmn:SequenceFlow#targetRef",
            },
            {
                rule: "a message flow's end",
                dependent: mergeElement("MessageFlow", "addedByIncoming", {
                    type: "bpmn:MessageFlow",
                    references: [refersTo("bpmn:MessageFlow#targetRef", "Task_Target")],
                }),
                target: "Task_Target",
                fragment: "bpmn:MessageFlow#targetRef",
            },
            {
                rule: "a boundary event's host",
                dependent: mergeElement("Boundary", "addedByIncoming", {
                    type: "bpmn:BoundaryEvent",
                    parent: "Process",
                    references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "Task_Target")],
                }),
                target: "Task_Target",
                fragment: "bpmn:BoundaryEvent#attachedToRef",
            },
            {
                rule: "a gateway's default flow",
                dependent: mergeElement("Gateway", "takenFromIncoming", {
                    type: "bpmn:ExclusiveGateway",
                    parent: "Process",
                    references: [refersTo("bpmn:ExclusiveGateway#default", "Flow_Default")],
                }),
                target: "Flow_Default",
                targetType: "bpmn:SequenceFlow",
                fragment: "bpmn:ExclusiveGateway#default",
            },
            {
                rule: "an activity's default flow",
                dependent: mergeElement("Task", "takenFromIncoming", {
                    parent: "Process",
                    references: [refersTo("bpmn:Activity#default", "Flow_Default")],
                }),
                target: "Flow_Default",
                targetType: "bpmn:SequenceFlow",
                fragment: "bpmn:Activity#default",
            },
            ...(
                [
                    ["bpmn:ErrorEventDefinition#errorRef", "Error_1", "bpmn:Error"],
                    ["bpmn:MessageEventDefinition#messageRef", "Message_1", "bpmn:Message"],
                    ["bpmn:SignalEventDefinition#signalRef", "Signal_1", "bpmn:Signal"],
                    [
                        "bpmn:EscalationEventDefinition#escalationRef",
                        "Escalation_1",
                        "bpmn:Escalation",
                    ],
                ] as const
            ).map(([property, target, targetType]) => ({
                rule: `an event definition's ${targetType}`,
                dependent: mergeElement("Event", "addedByIncoming", {
                    type: "bpmn:IntermediateThrowEvent",
                    parent: "Process",
                    references: [refersTo(property, target)],
                }),
                target,
                targetType,
                fragment: property,
            })),
            {
                rule: "a data object reference's data object",
                dependent: mergeElement("DataObjectReference", "addedByIncoming", {
                    type: "bpmn:DataObjectReference",
                    parent: "Process",
                    references: [refersTo("bpmn:DataObjectReference#dataObjectRef", "DataObject")],
                }),
                target: "DataObject",
                targetType: "bpmn:DataObject",
                fragment: "bpmn:DataObjectReference#dataObjectRef",
            },
            {
                rule: "a data store reference's data store",
                dependent: mergeElement("DataStoreReference", "addedByIncoming", {
                    type: "bpmn:DataStoreReference",
                    parent: "Process",
                    references: [refersTo("bpmn:DataStoreReference#dataStoreRef", "DataStore")],
                }),
                target: "DataStore",
                targetType: "bpmn:DataStore",
                fragment: "bpmn:DataStoreReference#dataStoreRef",
            },
            {
                rule: "a data association's data object reference",
                dependent: mergeElement("DataInputAssociation", "addedByIncoming", {
                    type: "bpmn:DataInputAssociation",
                    parent: "Process",
                    references: [
                        refersTo("bpmn:DataInputAssociation#sourceRef", "DataObjectReference"),
                        refersTo("bpmn:DataInputAssociation#targetRef", "Process", "Property_1"),
                    ],
                }),
                target: "DataObjectReference",
                targetType: "bpmn:DataObjectReference",
                fragment: "bpmn:DataInputAssociation#sourceRef",
            },
            {
                rule: "a compensation association's activity",
                dependent: mergeElement("Association", "addedByIncoming", {
                    type: "bpmn:Association",
                    parent: "Process",
                    references: [refersTo("bpmn:Association#targetRef", "Task_Compensation")],
                }),
                target: "Task_Compensation",
                fragment: "bpmn:Association#targetRef",
            },
            {
                rule: "a compensate event definition's activity",
                dependent: mergeElement("Event", "addedByIncoming", {
                    type: "bpmn:IntermediateThrowEvent",
                    parent: "Process",
                    references: [
                        refersTo("bpmn:CompensateEventDefinition#activityRef", "Task_Compensation"),
                    ],
                }),
                target: "Task_Compensation",
                fragment: "bpmn:CompensateEventDefinition#activityRef",
            },
            {
                rule: "a participant's process",
                dependent: mergeElement("Participant", "addedByIncoming", {
                    type: "bpmn:Participant",
                    parent: "Collaboration",
                    references: [refersTo("bpmn:Participant#processRef", "Process_Pool")],
                }),
                target: "Process_Pool",
                targetType: "bpmn:Process",
                fragment: "bpmn:Participant#processRef",
            },
            {
                rule: "a group's category value",
                dependent: mergeElement("Group", "addedByIncoming", {
                    type: "bpmn:Group",
                    parent: "Process",
                    references: [
                        refersTo("bpmn:Group#categoryValueRef", "Category", "CategoryValue_1"),
                    ],
                }),
                target: "Category",
                targetType: "bpmn:Category",
                targetParts: ["CategoryValue_1"],
                fragment: "bpmn:Group#categoryValueRef",
            },
            {
                rule: "its lane",
                dependent: mergeElement("Task", "addedByIncoming", {
                    parent: "Process",
                    lanes: ["Lane_Outer"],
                }),
                target: "Lane_Outer",
                targetType: "bpmn:Lane",
                fragment: "lies in lane Lane_Outer",
            },
        ];

        const surroundings = [
            mergeElement("Collaboration", "unchanged", { type: "bpmn:Collaboration" }),
            process,
        ];

        it.each(brokenRules)(
            "opens $dependent.id and $target when $rule is not in the result",
            ({ dependent, target, targetType, fragment }) => {
                const decisions = MergeDecisions.from(
                    mergeResult(
                        ...surroundings,
                        dependent,
                        mergeElement(target, "removedByCurrent", {
                            type: targetType,
                            parent: "Process",
                        }),
                    ),
                );

                expect(openIds(decisions)).toEqual([dependent.id, target]);
                for (const conflict of decisions.openConflicts) {
                    expect(conflict.state).toBe("danglingReference");
                    expect(conflict.related).toEqual([dependent.id, target]);
                    expect(conflict.reason).toContain(fragment);
                    expect(conflict.reason).toContain(target);
                }
                expect(decisions.canBuild).toBe(false);
            },
        );

        it.each(brokenRules)(
            "keeps $dependent.id resolved when $rule stays in the result",
            ({ dependent, target, targetType, targetParts }) => {
                const decisions = MergeDecisions.from(
                    mergeResult(
                        ...surroundings,
                        dependent,
                        mergeElement(target, "unchanged", {
                            type: targetType,
                            parent: "Process",
                            parts: targetParts,
                        }),
                    ),
                );

                expect(decisions.openConflicts).toEqual([]);
                expect(decisions.canBuild).toBe(true);
            },
        );

        it("reads the rules from the version the element's side gives", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("Task_Target", "removedByCurrent", { parent: "Process" }),
                    mergeElement("Gateway", "takenFromCurrent", {
                        parent: "Process",
                        incoming: {
                            parent: "Process",
                            references: [refersTo("bpmn:Activity#default", "Task_Target")],
                        },
                    }),
                ),
            );

            expect(decisions.openConflicts).toEqual([]);
        });

        it("treats an open target as pending, not as dangling", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("A", "removedAndChanged", { parent: "Process" }),
                    mergeElement("B", "addedByIncoming", { parent: "Process" }),
                    sequenceFlow("F", "A", "B", "addedByIncoming"),
                ),
            );

            expect(decisions.openConflicts).toEqual([
                { id: "A", state: "removedAndChanged", related: [] },
            ]);
            expect(decisions.sideOf("F")).toBe("incoming");
        });

        it("ignores a reference into the element itself", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    mergeElement("Task", "addedByIncoming", {
                        references: [
                            refersTo("bpmn:InputSet#dataInputRefs", "Task", "DataInput_1"),
                        ],
                    }),
                ),
            );

            expect(decisions.openConflicts).toEqual([]);
        });

        it("opens an element whose reference names an id no version has", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    mergeElement("Event", "addedByIncoming", {
                        references: [
                            refersTo("bpmn:SignalEventDefinition#signalRef", "Signal_Unknown"),
                        ],
                    }),
                ),
            );

            expect(decisions.openConflicts).toEqual([
                {
                    id: "Event",
                    state: "danglingReference",
                    reason: expect.stringContaining("Signal_Unknown"),
                    related: ["Event", "Signal_Unknown"],
                },
            ]);
        });
    });

    describe("the examples of #2451", () => {
        it("opens a flow from a task that current removed, and the task, instead of a flow without a source", () => {
            const decisions = MergeDecisions.from(flowFromARemovedTask());

            expect(decisions.openConflicts).toEqual([
                {
                    id: "A",
                    state: "danglingReference",
                    reason: "F (addedByIncoming) names A in bpmn:SequenceFlow#sourceRef, but A is not in the result (removedByCurrent)",
                    related: ["A", "F"],
                },
                {
                    id: "F",
                    state: "danglingReference",
                    reason: "F (addedByIncoming) names A in bpmn:SequenceFlow#sourceRef, but A is not in the result (removedByCurrent)",
                    related: ["A", "F"],
                },
            ]);
            expect(decisions.sideOf("B")).toBe("incoming");
            expect(decisions.sideOf("F")).toBeUndefined();
            expect(decisions.isInResult("F")).toBeUndefined();
            expect(decisions.canBuild).toBe(false);
            expect(() => decisions.resolution()).toThrow("A, F");
        });

        it("opens a boundary event that incoming attached to a host current removed", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("Host", "removedByCurrent", { parent: "Process" }),
                    mergeElement("Boundary", "addedByIncoming", {
                        type: "bpmn:BoundaryEvent",
                        parent: "Process",
                        references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "Host")],
                    }),
                ),
            );

            expect(openIds(decisions)).toEqual(["Host", "Boundary"]);
        });

        it("refuses to keep a boundary event from one side once its host is dropped from the other", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("Host", "changedAndRemoved", { parent: "Process" }),
                    mergeElement("Boundary", "bothChanged", {
                        type: "bpmn:BoundaryEvent",
                        parent: "Process",
                        references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "Host")],
                    }),
                ),
            );

            expect(decisions.pick("Host", "incoming")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: [],
            });
            expect(decisions.pick("Boundary", "current")).toEqual({
                applied: false,
                blockedBy: [
                    {
                        id: "Host",
                        reason: "Boundary (bothChanged) names Host in bpmn:BoundaryEvent#attachedToRef, but Host is picked from incoming, which does not have it",
                    },
                ],
            });
            expect(openIds(decisions)).toEqual(["Boundary"]);
        });
    });

    describe("fixpoint at from()", () => {
        it("opens every element that dangles on the same target and nothing that only names an opened element", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("A", "removedByCurrent", { parent: "Process" }),
                    mergeElement("B", "addedByIncoming", { parent: "Process" }),
                    mergeElement("Gateway", "addedByIncoming", {
                        parent: "Process",
                        references: [refersTo("bpmn:ExclusiveGateway#default", "F")],
                    }),
                    sequenceFlow("F", "A", "B", "addedByIncoming"),
                    sequenceFlow("F2", "B", "A", "addedByIncoming"),
                ),
            );

            expect(openIds(decisions)).toEqual(["A", "F", "F2"]);
            expect(decisions.openConflicts[0]?.related).toEqual(["A", "F", "F2"]);
            expect(decisions.sideOf("Gateway")).toBe("incoming");
            expect(decisions.sideOf("B")).toBe("incoming");
        });
    });

    describe("pick", () => {
        it("pulls in the target a picked element names", () => {
            const decisions = MergeDecisions.from(flowFromARemovedTask());

            expect(decisions.pick("F", "incoming")).toEqual({
                applied: true,
                pulledIn: ["A"],
                dropped: [],
            });
            expect(decisions.sideOf("A")).toBe("incoming");
            expect(decisions.isInResult("A")).toBe(true);
            expect(decisions.canBuild).toBe(true);
        });

        it("drops the dependents of an element picked from the side without it", () => {
            const decisions = MergeDecisions.from(flowFromARemovedTask());

            expect(decisions.pick("A", "current")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: ["F"],
            });
            expect(decisions.isInResult("F")).toBe(false);
            expect(decisions.sideOf("B")).toBe("incoming");
            expect(decisions.canBuild).toBe(true);
        });

        it("reverts a dangling conflict to its automatic resolution once its target is back", () => {
            const decisions = MergeDecisions.from(flowFromARemovedTask());

            expect(decisions.pick("A", "incoming")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: [],
            });
            expect(decisions.sideOf("F")).toBe("incoming");
            expect(decisions.openConflicts).toEqual([]);
        });

        it("drops in a chain: a host, its boundary event, the boundary event's flow", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("Host", "removedAndChanged", { parent: "Process" }),
                    mergeElement("Boundary", "addedByIncoming", {
                        parent: "Process",
                        references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "Host")],
                    }),
                    mergeElement("End", "unchanged", { parent: "Process" }),
                    sequenceFlow("Flow", "Boundary", "End", "addedByIncoming"),
                ),
            );

            expect(decisions.pick("Host", "current")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: ["Boundary", "Flow"],
            });
            expect(decisions.canBuild).toBe(true);
        });

        it("pulls in a target's parent and lanes with it", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("Lane", "removedByCurrent", {
                        type: "bpmn:Lane",
                        parent: "Process",
                    }),
                    mergeElement("SubProcess", "removedByCurrent", {
                        type: "bpmn:SubProcess",
                        parent: "Process",
                    }),
                    mergeElement("A", "removedByCurrent", {
                        parent: "SubProcess",
                        lanes: ["Lane"],
                    }),
                    mergeElement("B", "unchanged", { parent: "Process" }),
                    sequenceFlow("F", "B", "A", "bothAdded"),
                ),
            );

            expect(decisions.pick("F", "incoming")).toEqual({
                applied: true,
                pulledIn: ["A", "SubProcess", "Lane"],
                dropped: [],
            });
        });

        it("drops an open dependent whose every version names the dropped element", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("A", "removedAndChanged", { parent: "Process" }),
                    mergeElement("B", "unchanged", { parent: "Process" }),
                    sequenceFlow("F", "B", "A", "removedAndChanged"),
                ),
            );

            expect(decisions.pick("A", "current")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: ["F"],
            });
            expect(decisions.openConflicts).toEqual([]);
        });

        it("leaves an open dependent open when it is in both versions", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("A", "removedAndChanged", { parent: "Process" }),
                    mergeElement("B", "unchanged", { parent: "Process" }),
                    sequenceFlow("F", "B", "A", "bothChanged"),
                ),
            );

            expect(decisions.pick("A", "current")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: [],
            });
            expect(openIds(decisions)).toEqual(["F"]);
        });

        it("switches an automatic element to the other side without consequences", () => {
            const decisions = MergeDecisions.from(
                mergeResult(mergeElement("A", "takenFromIncoming")),
            );

            expect(decisions.pick("A", "current")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: [],
            });
            expect(decisions.sideOf("A")).toBe("current");
        });

        it("rejects an id the merge result does not have", () => {
            const decisions = MergeDecisions.from(flowFromARemovedTask());

            expect(() => decisions.pick("Unknown", "current")).toThrow("Unknown");
        });

        describe("blocked", () => {
            it("refuses to drop an element a user-picked element needs, and changes nothing", () => {
                const decisions = MergeDecisions.from(flowFromARemovedTask());
                decisions.pick("F", "incoming");
                const sidesBefore = sidesOfEveryElement(decisions);
                const openBefore = decisions.openConflicts;

                expect(decisions.pick("A", "current")).toEqual({
                    applied: false,
                    blockedBy: [
                        {
                            id: "F",
                            reason: "F (addedByIncoming) names A in bpmn:SequenceFlow#sourceRef and is picked from incoming",
                        },
                    ],
                });
                expect(sidesOfEveryElement(decisions)).toEqual(sidesBefore);
                expect(decisions.openConflicts).toEqual(openBefore);
            });

            it("refuses to pull in a target the user picked away, and changes nothing", () => {
                const decisions = MergeDecisions.from(flowFromARemovedTask());
                decisions.pick("A", "current");
                const sidesBefore = sidesOfEveryElement(decisions);

                expect(decisions.pick("F", "incoming")).toEqual({
                    applied: false,
                    blockedBy: [
                        {
                            id: "A",
                            reason: "F (addedByIncoming) names A in bpmn:SequenceFlow#sourceRef, but A is picked from current, which does not have it",
                        },
                    ],
                });
                expect(sidesOfEveryElement(decisions)).toEqual(sidesBefore);
            });

            it("refuses to drop a dependent that both versions have", () => {
                const decisions = MergeDecisions.from(
                    mergeResult(
                        process,
                        mergeElement("Flow_Default", "changedAndRemoved", {
                            type: "bpmn:SequenceFlow",
                            parent: "Process",
                        }),
                        mergeElement("Gateway", "takenFromCurrent", {
                            parent: "Process",
                            current: {
                                parent: "Process",
                                references: [
                                    refersTo("bpmn:ExclusiveGateway#default", "Flow_Default"),
                                ],
                            },
                        }),
                    ),
                );
                const sidesBefore = sidesOfEveryElement(decisions);

                expect(decisions.pick("Flow_Default", "incoming")).toEqual({
                    applied: false,
                    blockedBy: [
                        {
                            id: "Gateway",
                            reason: "Gateway (takenFromCurrent) names Flow_Default in bpmn:ExclusiveGateway#default and is in both versions",
                        },
                    ],
                });
                expect(sidesOfEveryElement(decisions)).toEqual(sidesBefore);
            });

            it("refuses to pull in a target no version has", () => {
                const decisions = MergeDecisions.from(
                    mergeResult(
                        mergeElement("F", "bothAdded", {
                            references: [refersTo("bpmn:SequenceFlow#targetRef", "Ghost")],
                        }),
                    ),
                );

                expect(decisions.pick("F", "incoming")).toEqual({
                    applied: false,
                    blockedBy: [
                        {
                            id: "Ghost",
                            reason: "F (bothAdded) names Ghost in bpmn:SequenceFlow#targetRef, but no version has Ghost",
                        },
                    ],
                });
            });

            it("refuses to pull in a target the picked side does not have", () => {
                const decisions = MergeDecisions.from(
                    mergeResult(
                        mergeElement("A", "removedByBoth"),
                        mergeElement("F", "bothAdded", {
                            references: [refersTo("bpmn:SequenceFlow#targetRef", "A")],
                        }),
                    ),
                );

                expect(decisions.pick("F", "incoming")).toEqual({
                    applied: false,
                    blockedBy: [
                        {
                            id: "A",
                            reason: "F (bothAdded) names A in bpmn:SequenceFlow#targetRef, but incoming does not have A",
                        },
                    ],
                });
                expect(decisions.sideOf("F")).toBeUndefined();
            });

            it("refuses a drop chain that reaches an element both versions have", () => {
                const decisions = MergeDecisions.from(
                    mergeResult(
                        process,
                        mergeElement("A", "removedAndChanged", { parent: "Process" }),
                        mergeElement("Boundary", "addedByIncoming", {
                            parent: "Process",
                            references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "A")],
                        }),
                        mergeElement("Event", "takenFromIncoming", {
                            parent: "Process",
                            incoming: {
                                parent: "Process",
                                references: [
                                    refersTo(
                                        "bpmn:CompensateEventDefinition#activityRef",
                                        "Boundary",
                                    ),
                                ],
                            },
                        }),
                    ),
                );
                const sidesBefore = sidesOfEveryElement(decisions);

                expect(decisions.pick("A", "current")).toEqual({
                    applied: false,
                    blockedBy: [
                        {
                            id: "Event",
                            reason: "Event (takenFromIncoming) names Boundary in bpmn:CompensateEventDefinition#activityRef and is in both versions",
                        },
                    ],
                });
                expect(sidesOfEveryElement(decisions)).toEqual(sidesBefore);
            });
        });
    });

    describe("pickWithContents", () => {
        const subProcessResult = () =>
            mergeResult(
                process,
                mergeElement("SubProcess", "bothChanged", {
                    type: "bpmn:SubProcess",
                    parent: "Process",
                }),
                mergeElement("Task_CurrentOnly", "addedByCurrent", { parent: "SubProcess" }),
                mergeElement("Task_IncomingOnly", "addedByIncoming", { parent: "SubProcess" }),
                mergeElement("Task_MovedOut", "takenFromIncoming", {
                    current: { parent: "SubProcess" },
                    incoming: { parent: "Process" },
                }),
                mergeElement("SubProcess_Nested", "unchanged", {
                    type: "bpmn:SubProcess",
                    parent: "SubProcess",
                }),
                mergeElement("Task_Nested", "takenFromIncoming", { parent: "SubProcess_Nested" }),
                mergeElement("Task_Outside", "takenFromIncoming", { parent: "Process" }),
            );

        it("picks the container and every descendant in either version", () => {
            const decisions = MergeDecisions.from(subProcessResult());

            expect(decisions.pickWithContents("SubProcess", "current")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: [],
            });
            expect(sidesOfEveryElement(decisions)).toEqual({
                Process: "current",
                SubProcess: "current",
                Task_CurrentOnly: "current",
                Task_IncomingOnly: "current",
                Task_MovedOut: "current",
                SubProcess_Nested: "current",
                Task_Nested: "current",
                Task_Outside: "incoming",
            });
            expect(decisions.isInResult("Task_IncomingOnly")).toBe(false);
        });

        it("lets a later pick inside override the container pick for that element", () => {
            const decisions = MergeDecisions.from(subProcessResult());
            decisions.pickWithContents("SubProcess", "current");

            decisions.pick("Task_Nested", "incoming");

            expect(decisions.sideOf("Task_Nested")).toBe("incoming");
            expect(decisions.sideOf("Task_CurrentOnly")).toBe("current");
        });

        it("covers a lane's flow nodes and child lanes", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("Lane", "bothChanged", { type: "bpmn:Lane", parent: "Process" }),
                    mergeElement("Lane_Child", "bothChanged", {
                        type: "bpmn:Lane",
                        parent: "Lane",
                    }),
                    mergeElement("Task_InLane", "bothChanged", {
                        parent: "Process",
                        lanes: ["Lane", "Lane_Child"],
                    }),
                    mergeElement("Task_Elsewhere", "bothChanged", { parent: "Process" }),
                ),
            );

            decisions.pickWithContents("Lane", "incoming");

            expect(openIds(decisions)).toEqual(["Task_Elsewhere"]);
        });

        it("covers a participant's process and what lies in it", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    mergeElement("Collaboration", "unchanged", { type: "bpmn:Collaboration" }),
                    mergeElement("Participant", "bothChanged", {
                        type: "bpmn:Participant",
                        parent: "Collaboration",
                        references: [refersTo("bpmn:Participant#processRef", "Process_Pool")],
                    }),
                    mergeElement("Process_Pool", "bothChanged", { type: "bpmn:Process" }),
                    mergeElement("Task_InPool", "bothChanged", { parent: "Process_Pool" }),
                ),
            );

            decisions.pickWithContents("Participant", "current");

            expect(decisions.openConflicts).toEqual([]);
        });

        it("is blocked as a whole and changes nothing", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("SubProcess", "unchanged", {
                        type: "bpmn:SubProcess",
                        parent: "Process",
                    }),
                    mergeElement("Task_Inside", "bothChanged", { parent: "SubProcess" }),
                    mergeElement("Task_Kept", "removedAndChanged", { parent: "Process" }),
                    mergeElement("Flow", "bothChanged", {
                        parent: "SubProcess",
                        references: [refersTo("bpmn:SequenceFlow#targetRef", "Task_Kept")],
                    }),
                ),
            );
            decisions.pick("Task_Kept", "current");
            const sidesBefore = sidesOfEveryElement(decisions);

            const outcome = decisions.pickWithContents("SubProcess", "incoming");

            expect(outcome).toEqual({
                applied: false,
                blockedBy: [expect.objectContaining({ id: "Task_Kept" })],
            });
            expect(sidesOfEveryElement(decisions)).toEqual(sidesBefore);
        });

        it("stops at versions that contradict each other instead of changing an element twice", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("SubProcess", "unchanged", {
                        type: "bpmn:SubProcess",
                        parent: "Process",
                    }),
                    mergeElement("Task_CurrentOnly", "addedByCurrent", { parent: "SubProcess" }),
                    mergeElement("Association", "addedByCurrent", {
                        parent: "Process",
                        references: [refersTo("bpmn:Association#targetRef", "Task_CurrentOnly")],
                    }),
                    mergeElement("Task_NamingTheAssociation", "addedByIncoming", {
                        parent: "SubProcess",
                        references: [refersTo("bpmn:Activity#default", "Association")],
                    }),
                ),
            );

            expect(decisions.pickWithContents("SubProcess", "incoming")).toEqual({
                applied: false,
                blockedBy: [
                    {
                        id: "Association",
                        reason: "Task_NamingTheAssociation (addedByIncoming) names Association in bpmn:Activity#default, but this pick drops Association",
                    },
                    {
                        id: "Task_NamingTheAssociation",
                        reason: "Task_NamingTheAssociation (addedByIncoming) names Association in bpmn:Activity#default and is picked from incoming",
                    },
                ],
            });
        });
        it("stops at versions that contradict each other instead of dropping what it pulled in", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("SubProcess", "unchanged", {
                        type: "bpmn:SubProcess",
                        parent: "Process",
                    }),
                    mergeElement("Task_NamingX", "addedByIncoming", {
                        parent: "SubProcess",
                        references: [refersTo("bpmn:Activity#default", "X")],
                    }),
                    mergeElement("Task_CurrentOnly", "addedByCurrent", { parent: "SubProcess" }),
                    mergeElement("X", "removedByCurrent", {
                        parent: "Process",
                        references: [refersTo("bpmn:Association#targetRef", "Task_CurrentOnly")],
                    }),
                ),
            );

            expect(decisions.pickWithContents("SubProcess", "incoming")).toEqual({
                applied: false,
                blockedBy: [
                    {
                        id: "X",
                        reason: "X (removedByCurrent) names Task_CurrentOnly in bpmn:Association#targetRef and this pick pulls it in",
                    },
                    {
                        id: "Task_CurrentOnly",
                        reason: "X (removedByCurrent) names Task_CurrentOnly in bpmn:Association#targetRef, but Task_CurrentOnly is picked from incoming, which does not have it",
                    },
                ],
            });
        });
    });

    describe("resolution", () => {
        it("gives every element's side and the layout side of every drawn element in the result", () => {
            const decisions = MergeDecisions.from(flowFromARemovedTask());
            decisions.pick("A", "current");

            expect(decisions.resolution()).toEqual({
                elements: { Process: "current", A: "current", B: "incoming", F: "current" },
                layout: { Process: "current", B: "incoming" },
            });
        });

        it("throws listing the open ids", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    mergeElement("A", "bothChanged"),
                    mergeElement("B", "unchanged"),
                    mergeElement("C", "differs"),
                ),
            );

            expect(() => decisions.resolution()).toThrow("The merge has open conflicts: A, C");
        });
    });

    describe("layout side", () => {
        it.each<{
            case: string;
            element: MergeElement;
            layoutSide: MergeSide | undefined;
        }>([
            {
                case: "incoming when incoming changed the layout and draws it",
                element: mergeElement("A", "takenFromCurrent", { layout: "takenFromIncoming" }),
                layoutSide: "incoming",
            },
            {
                case: "the element's side when incoming changed the layout but does not draw it",
                element: mergeElement("A", "takenFromCurrent", {
                    layout: "takenFromIncoming",
                    incoming: { drawn: false },
                }),
                layoutSide: "current",
            },
            {
                case: "current for an unchanged layout",
                element: mergeElement("A", "takenFromIncoming"),
                layoutSide: "current",
            },
            {
                case: "current when both changed the layout",
                element: mergeElement("A", "takenFromIncoming", { layout: "bothChanged" }),
                layoutSide: "current",
            },
            {
                case: "the element's side when current does not draw it",
                element: mergeElement("A", "takenFromIncoming", { current: { drawn: false } }),
                layoutSide: "incoming",
            },
            {
                case: "none when the layout side does not draw it",
                element: mergeElement("A", "unchanged", { drawn: false }),
                layoutSide: undefined,
            },
            {
                case: "none when the element is not in the result",
                element: mergeElement("A", "removedByIncoming"),
                layoutSide: undefined,
            },
        ])("takes $case", ({ element, layoutSide }) => {
            const { layout } = MergeDecisions.from(mergeResult(element)).resolution();

            expect(layout[element.id]).toBe(layoutSide);
        });

        const laneA = mergeElement("Lane_A", "unchanged", { type: "bpmn:Lane" });
        const laneB = mergeElement("Lane_B", "unchanged", { type: "bpmn:Lane" });
        const subProcess = mergeElement("Sub_1", "unchanged", { type: "bpmn:SubProcess" });

        it("follows the element's side when the other layout draws it in another lane", () => {
            const task = mergeElement("A", "takenFromCurrent", {
                layout: "takenFromIncoming",
                base: { lanes: ["Lane_A"] },
                current: { lanes: ["Lane_B"] },
                incoming: { lanes: ["Lane_A"] },
            });

            const { layout } = MergeDecisions.from(mergeResult(laneA, laneB, task)).resolution();

            expect(layout.A).toBe("current");
        });

        it("follows the element's side when the other layout draws it in another parent", () => {
            const task = mergeElement("A", "takenFromCurrent", {
                layout: "takenFromIncoming",
                current: { parent: "Sub_1" },
            });

            const { layout } = MergeDecisions.from(mergeResult(subProcess, task)).resolution();

            expect(layout.A).toBe("current");
        });

        it("follows a pick against a lane move whose layout came from the other side", () => {
            const task = mergeElement("A", "bothChanged", {
                layout: "takenFromIncoming",
                current: { lanes: ["Lane_A"] },
                incoming: { lanes: ["Lane_B"] },
            });
            const decisions = MergeDecisions.from(mergeResult(laneA, laneB, task));

            decisions.pick("A", "current");

            expect(decisions.resolution().layout.A).toBe("current");
        });

        it("draws a flow from its ends' side when an end follows its element against its own layout", () => {
            const task = mergeElement("A", "takenFromCurrent", {
                layout: "takenFromIncoming",
                base: { lanes: ["Lane_A"] },
                current: { lanes: ["Lane_B"] },
                incoming: { lanes: ["Lane_A"] },
            });
            const start = mergeElement("S", "unchanged", { type: "bpmn:StartEvent" });
            const flow = mergeElement("F", "unchanged", {
                type: "bpmn:SequenceFlow",
                layout: "takenFromIncoming",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", "S"),
                    refersTo("bpmn:SequenceFlow#targetRef", "A"),
                ],
            });

            const { layout } = MergeDecisions.from(
                mergeResult(laneA, laneB, start, task, flow),
            ).resolution();

            expect(layout.F).toBe("current");
        });

        it("keeps a flow's own layout change when its ends keep theirs", () => {
            const start = mergeElement("S", "unchanged", { type: "bpmn:StartEvent" });
            const task = mergeElement("A", "unchanged");
            const flow = mergeElement("F", "unchanged", {
                type: "bpmn:SequenceFlow",
                layout: "takenFromIncoming",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", "S"),
                    refersTo("bpmn:SequenceFlow#targetRef", "A"),
                ],
            });

            const { layout } = MergeDecisions.from(mergeResult(start, task, flow)).resolution();

            expect(layout.F).toBe("incoming");
        });

        it("keeps the other side's layout when parent and lanes agree", () => {
            const task = mergeElement("A", "takenFromCurrent", {
                layout: "takenFromIncoming",
                lanes: ["Lane_A"],
            });

            const { layout } = MergeDecisions.from(mergeResult(laneA, task)).resolution();

            expect(layout.A).toBe("incoming");
        });
    });

    describe("a part inside a target", () => {
        const dataObjectReference = mergeElement("DOR", "unchanged", {
            type: "bpmn:DataObjectReference",
            parent: "Process",
        });
        const associationIntoT = (state: MergeElement["state"], part = "Property_1") =>
            mergeElement("DIA", state, {
                type: "bpmn:DataInputAssociation",
                parent: "T",
                references: [
                    refersTo("bpmn:DataInputAssociation#sourceRef", "DOR"),
                    refersTo("bpmn:DataInputAssociation#targetRef", "T", part),
                ],
            });
        /** Current connects DOR to T, which adds the placeholder Property_1 to T; incoming renames T. */
        const connectedByCurrentRenamedByIncoming = () =>
            mergeResult(
                process,
                dataObjectReference,
                mergeElement("T", "bothChanged", {
                    parent: "Process",
                    current: { parts: ["Property_1"] },
                }),
                associationIntoT("addedByCurrent"),
            );

        it("drops a dependent that names a part the picked side of its target does not hold", () => {
            const decisions = MergeDecisions.from(connectedByCurrentRenamedByIncoming());

            const outcome = decisions.pick("T", "incoming");

            expect(outcome).toEqual({ applied: true, pulledIn: [], dropped: ["DIA"] });
            expect(decisions.isInResult("DIA")).toBe(false);
            expect(decisions.canBuild).toBe(true);
        });

        it("keeps a dependent whose target's picked side holds the part", () => {
            const decisions = MergeDecisions.from(connectedByCurrentRenamedByIncoming());

            expect(decisions.pick("T", "current")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: [],
            });
            expect(decisions.isInResult("DIA")).toBe(true);
        });

        it("pulls a target to the side that holds the part a picked element names", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    dataObjectReference,
                    mergeElement("T", "takenFromIncoming", {
                        parent: "Process",
                        base: { parts: ["Property_1"] },
                        current: { parts: ["Property_1"] },
                    }),
                    associationIntoT("removedByIncoming"),
                ),
            );

            expect(decisions.pick("DIA", "current")).toEqual({
                applied: true,
                pulledIn: ["T"],
                dropped: [],
            });
            expect(decisions.sideOf("T")).toBe("current");
        });

        it("refuses to name a part inside a target the user picked from a side without it", () => {
            const decisions = MergeDecisions.from(connectedByCurrentRenamedByIncoming());
            decisions.pick("T", "incoming");

            const outcome = decisions.pick("DIA", "current");

            expect(outcome.applied).toBe(false);
            expect(outcome.applied || outcome.blockedBy).toEqual([
                {
                    id: "T",
                    reason: "DIA (addedByCurrent) names Property_1 inside T in bpmn:DataInputAssociation#targetRef, but T is picked from incoming, which does not hold Property_1",
                },
            ]);
            expect(decisions.isInResult("DIA")).toBe(false);
        });

        it("refuses a part no version of the target holds", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    dataObjectReference,
                    mergeElement("T", "unchanged", { parent: "Process" }),
                    associationIntoT("bothAdded", "Property_9"),
                ),
            );

            const outcome = decisions.pick("DIA", "current");

            expect(outcome.applied || outcome.blockedBy).toEqual([
                {
                    id: "T",
                    reason: "DIA (bothAdded) names Property_9 inside T in bpmn:DataInputAssociation#targetRef, but current does not hold Property_9 inside T",
                },
            ]);
        });

        it("opens an automatic element whose target's side does not hold the part, and the target", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    dataObjectReference,
                    mergeElement("T", "takenFromIncoming", {
                        parent: "Process",
                        base: { parts: ["Property_1"] },
                        current: { parts: ["Property_1"] },
                    }),
                    associationIntoT("unchanged"),
                ),
            );

            expect(decisions.openConflicts).toEqual([
                {
                    id: "T",
                    state: "danglingReference",
                    reason: "DIA (unchanged) names Property_1 inside T in bpmn:DataInputAssociation#targetRef, but T is taken from incoming, which does not hold Property_1",
                    related: ["T", "DIA"],
                },
                {
                    id: "DIA",
                    state: "danglingReference",
                    reason: "DIA (unchanged) names Property_1 inside T in bpmn:DataInputAssociation#targetRef, but T is taken from incoming, which does not hold Property_1",
                    related: ["T", "DIA"],
                },
            ]);
        });

        it("treats an open target as pending, whatever parts its versions hold", () => {
            const decisions = MergeDecisions.from(connectedByCurrentRenamedByIncoming());

            expect(openIds(decisions)).toEqual(["T"]);
        });
    });

    describe("a container inside the parent", () => {
        /** Incoming adds lanes in LaneSet_1; current changes the process otherwise. */
        const lanesAddedByIncoming = (taskState: MergeElement["state"]) =>
            mergeResult(
                mergeElement("Process", "bothChanged", {
                    type: "bpmn:Process",
                    incoming: { parts: ["LaneSet_1"] },
                }),
                mergeElement("Lane_A", "addedByIncoming", {
                    type: "bpmn:Lane",
                    parent: "Process",
                    container: "LaneSet_1",
                }),
                mergeElement("Task", taskState, {
                    parent: "Process",
                    incoming: { lanes: ["Lane_A"] },
                }),
            );

        it("drops an element whose container the picked side of its parent does not hold", () => {
            const decisions = MergeDecisions.from(lanesAddedByIncoming("addedByIncoming"));

            const outcome = decisions.pick("Process", "current");

            expect(outcome).toEqual({ applied: true, pulledIn: [], dropped: ["Lane_A", "Task"] });
            expect(decisions.canBuild).toBe(true);
        });

        it("refuses to pick a parent without the container when a dependent in both versions would have to switch", () => {
            const decisions = MergeDecisions.from(lanesAddedByIncoming("takenFromIncoming"));

            const outcome = decisions.pick("Process", "current");

            expect(outcome.applied).toBe(false);
            expect(outcome.applied || outcome.blockedBy.map((blocked) => blocked.id)).toEqual([
                "Task",
            ]);
            expect(decisions.sideOf("Process")).toBeUndefined();
        });

        it("opens an automatic element whose parent's side does not hold its container", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    mergeElement("Process", "takenFromCurrent", {
                        type: "bpmn:Process",
                        base: { parts: ["LaneSet_1"] },
                        incoming: { parts: ["LaneSet_1"] },
                    }),
                    mergeElement("Lane_A", "unchanged", {
                        type: "bpmn:Lane",
                        parent: "Process",
                        container: "LaneSet_1",
                    }),
                ),
            );

            expect(openIds(decisions)).toEqual(["Process", "Lane_A"]);
            expect(decisions.openConflicts[0]?.reason).toBe(
                "Lane_A (unchanged) lies in LaneSet_1 inside Process, but Process is taken from current, which does not hold LaneSet_1",
            );
        });
    });

    describe("unpick", () => {
        /** Current renames gateway G, whose default is F; incoming removes both. */
        const gatewayWithDefaultRemovedByIncoming = () =>
            mergeResult(
                process,
                mergeElement("G", "changedAndRemoved", {
                    type: "bpmn:ExclusiveGateway",
                    parent: "Process",
                    references: [refersTo("bpmn:ExclusiveGateway#default", "F")],
                }),
                sequenceFlow("F", "G", "X", "removedByIncoming"),
                mergeElement("X", "unchanged", { parent: "Process" }),
            );

        it("brings back two picked elements that name each other, one at a time", () => {
            const decisions = MergeDecisions.from(gatewayWithDefaultRemovedByIncoming());
            decisions.pick("G", "incoming");
            decisions.pick("F", "incoming");
            expect(decisions.pick("G", "current").applied).toBe(false);

            expect(decisions.unpick("F")).toEqual({ applied: true, pulledIn: [], dropped: [] });
            expect(decisions.pick("G", "current")).toEqual({
                applied: true,
                pulledIn: ["F"],
                dropped: [],
            });
            expect(decisions.isInResult("G")).toBe(true);
            expect(decisions.isInResult("F")).toBe(true);
        });

        it("returns a picked conflict to open", () => {
            const decisions = MergeDecisions.from(gatewayWithDefaultRemovedByIncoming());
            decisions.pick("G", "current");

            decisions.unpick("G");

            expect(decisions.sideOf("G")).toBeUndefined();
            expect(decisions.openConflicts).toEqual([
                { id: "G", state: "changedAndRemoved", related: [] },
            ]);
        });

        it("returns a picked element to its automatic resolution and drops what then dangles", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("B", "removedByIncoming", { parent: "Process" }),
                    mergeElement("Boundary", "addedByCurrent", {
                        type: "bpmn:BoundaryEvent",
                        parent: "Process",
                        references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "B")],
                    }),
                ),
            );
            decisions.pick("B", "current");

            expect(decisions.unpick("B")).toEqual({
                applied: true,
                pulledIn: [],
                dropped: ["Boundary"],
            });
            expect(decisions.sideOf("B")).toBe("incoming");
        });

        it("refuses to unpick an element a user-picked element needs, and changes nothing", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process,
                    mergeElement("B", "removedByIncoming", { parent: "Process" }),
                    mergeElement("Boundary", "addedByCurrent", {
                        type: "bpmn:BoundaryEvent",
                        parent: "Process",
                        references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "B")],
                    }),
                ),
            );
            decisions.pick("B", "current");
            decisions.pick("Boundary", "current");

            const outcome = decisions.unpick("B");

            expect(outcome.applied || outcome.blockedBy.map((blocked) => blocked.id)).toEqual([
                "Boundary",
            ]);
            expect(decisions.sideOf("B")).toBe("current");
        });

        it("changes nothing for an element the user did not pick", () => {
            const decisions = MergeDecisions.from(gatewayWithDefaultRemovedByIncoming());

            expect(decisions.unpick("X")).toEqual({ applied: true, pulledIn: [], dropped: [] });
            expect(decisions.sideOf("X")).toBe("current");
        });

        it("rejects an id the merge result does not have", () => {
            const decisions = MergeDecisions.from(gatewayWithDefaultRemovedByIncoming());

            expect(() => decisions.unpick("Nope")).toThrow("The merge result has no element Nope");
        });
    });

    describe("layout side of what an element is drawn against", () => {
        const flowFromS = (
            state: MergeElement["state"],
            spec: Parameters<typeof mergeElement>[2],
        ) => mergeElement("F", state, { type: "bpmn:SequenceFlow", parent: "Process", ...spec });
        const start = mergeElement("S", "unchanged", { type: "bpmn:StartEvent" });
        const taskA = mergeElement("A", "unchanged");
        const taskB = mergeElement("B", "unchanged");

        it("draws a flow incoming reconnected from incoming, even when both sides changed its layout", () => {
            const flow = flowFromS("takenFromIncoming", {
                layout: "bothChanged",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", "S"),
                    refersTo("bpmn:SequenceFlow#targetRef", "A"),
                ],
                incoming: {
                    references: [
                        refersTo("bpmn:SequenceFlow#sourceRef", "S"),
                        refersTo("bpmn:SequenceFlow#targetRef", "B"),
                    ],
                },
            });

            const { layout } = MergeDecisions.from(
                mergeResult(process, start, taskA, taskB, flow),
            ).resolution();

            expect(layout.F).toBe("incoming");
        });

        it("draws a boundary event incoming re-attached from incoming", () => {
            const boundary = mergeElement("BE", "takenFromIncoming", {
                type: "bpmn:BoundaryEvent",
                layout: "bothChanged",
                references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "A")],
                incoming: { references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "B")] },
            });

            const { layout } = MergeDecisions.from(
                mergeResult(taskA, taskB, boundary),
            ).resolution();

            expect(layout.BE).toBe("incoming");
        });

        const boundaryOnA = (layout: MergeElement["layout"], spec = {}) =>
            mergeElement("BE", "unchanged", {
                type: "bpmn:BoundaryEvent",
                layout,
                references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "A")],
                ...spec,
            });

        it("draws a boundary event from its host's side when that side moved the host", () => {
            const host = mergeElement("A", "unchanged", { layout: "bothChanged" });

            const { layout } = MergeDecisions.from(
                mergeResult(host, boundaryOnA("takenFromIncoming")),
            ).resolution();

            expect(layout).toEqual({ A: "current", BE: "current" });
        });

        it("keeps a boundary event's own layout change when its host's layout is unchanged", () => {
            const { layout } = MergeDecisions.from(
                mergeResult(taskA, boundaryOnA("takenFromIncoming")),
            ).resolution();

            expect(layout.BE).toBe("incoming");
        });

        it.each<{ container: string; elements: MergeElement[] }>([
            {
                container: "lane",
                elements: [
                    mergeElement("Lane_1", "unchanged", {
                        type: "bpmn:Lane",
                        layout: "takenFromIncoming",
                    }),
                    mergeElement("T", "unchanged", { lanes: ["Lane_1"], layout: "bothChanged" }),
                ],
            },
            {
                container: "expanded sub-process",
                elements: [
                    mergeElement("Sub", "unchanged", {
                        type: "bpmn:SubProcess",
                        layout: "takenFromIncoming",
                    }),
                    mergeElement("T", "unchanged", { parent: "Sub", layout: "bothChanged" }),
                ],
            },
            {
                container: "pool drawing its process",
                elements: [
                    mergeElement("Participant", "unchanged", {
                        type: "bpmn:Participant",
                        layout: "takenFromIncoming",
                        references: [refersTo("bpmn:Participant#processRef", "Process")],
                    }),
                    mergeElement("Process", "unchanged", { type: "bpmn:Process", drawn: false }),
                    mergeElement("T", "unchanged", { parent: "Process", layout: "bothChanged" }),
                ],
            },
        ])(
            "draws an element from its $container's side when that side moved the container",
            ({ elements }) => {
                const { layout } = MergeDecisions.from(mergeResult(...elements)).resolution();

                expect(layout.T).toBe("incoming");
            },
        );

        it("keeps one side's move of an element when the other side only resized its lane", () => {
            const { layout } = MergeDecisions.from(
                mergeResult(
                    mergeElement("Lane_1", "unchanged", {
                        type: "bpmn:Lane",
                        layout: "takenFromIncoming",
                    }),
                    mergeElement("T", "unchanged", {
                        lanes: ["Lane_1"],
                        layout: "takenFromCurrent",
                    }),
                ),
            ).resolution();

            expect(layout).toEqual({ Lane_1: "incoming", T: "current" });
        });

        it("settles nested containers top-down, whatever the result order", () => {
            const { layout } = MergeDecisions.from(
                mergeResult(
                    mergeElement("T", "unchanged", { parent: "Inner", layout: "bothChanged" }),
                    mergeElement("Inner", "unchanged", {
                        type: "bpmn:SubProcess",
                        parent: "Outer",
                        layout: "bothChanged",
                    }),
                    mergeElement("Outer", "unchanged", {
                        type: "bpmn:SubProcess",
                        layout: "takenFromIncoming",
                    }),
                ),
            ).resolution();

            expect(layout).toEqual({ Outer: "incoming", Inner: "incoming", T: "incoming" });
        });

        it("keeps an element's own side when its container's side does not draw it", () => {
            const { layout } = MergeDecisions.from(
                mergeResult(
                    mergeElement("Sub", "unchanged", {
                        type: "bpmn:SubProcess",
                        layout: "takenFromIncoming",
                    }),
                    mergeElement("T", "addedByCurrent", {
                        parent: "Sub",
                        layout: "takenFromCurrent",
                    }),
                ),
            ).resolution();

            expect(layout).toEqual({ Sub: "incoming", T: "current" });
        });

        it("draws a child from its parent's side when its own side draws it on another plane", () => {
            const { layout } = MergeDecisions.from(
                mergeResult(
                    mergeElement("Sub", "takenFromIncoming", {
                        type: "bpmn:SubProcess",
                        plane: "Process",
                        current: { drawn: false },
                    }),
                    mergeElement("T", "unchanged", {
                        parent: "Sub",
                        layout: "bothChanged",
                        current: { plane: "Process" },
                        incoming: { plane: "Sub" },
                    }),
                ),
            ).resolution();

            expect(layout.T).toBe("incoming");
        });

        it("keeps a collapsed sub-process's child on its plane although its lane is drawn from the other side", () => {
            const { layout } = MergeDecisions.from(
                mergeResult(
                    mergeElement("Lane_1", "unchanged", { type: "bpmn:Lane" }),
                    mergeElement("Sub", "unchanged", {
                        type: "bpmn:SubProcess",
                        lanes: ["Lane_1"],
                        layout: "takenFromIncoming",
                    }),
                    mergeElement("T", "unchanged", {
                        parent: "Sub",
                        lanes: ["Lane_1"],
                        layout: "takenFromIncoming",
                        current: { plane: "Collaboration" },
                        incoming: { plane: "Sub" },
                    }),
                ),
            ).resolution();

            expect(layout).toEqual({ Lane_1: "current", Sub: "incoming", T: "incoming" });
        });

        it("draws a flow from its ends' side when both ends follow their lane", () => {
            const lane = mergeElement("Lane_1", "unchanged", {
                type: "bpmn:Lane",
                layout: "takenFromIncoming",
            });
            const inLane = (id: string) =>
                mergeElement(id, "unchanged", { lanes: ["Lane_1"], layout: "bothChanged" });
            const flow = flowFromS("unchanged", {
                layout: "bothChanged",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", "S"),
                    refersTo("bpmn:SequenceFlow#targetRef", "A"),
                ],
            });

            const { layout } = MergeDecisions.from(
                mergeResult(process, lane, inLane("S"), inLane("A"), flow),
            ).resolution();

            expect(layout.F).toBe("incoming");
        });
    });
});
