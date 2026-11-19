import { describe, expect, expectTypeOf, it } from "vitest";

import {
    type BlockedPick,
    type HandMergeRefusal,
    type PickOutcome,
    type RequirementObstacle,
} from "@miragon/bpmn-modeler-merge";
import type { MergePaneBlock, MergePaneHandMergeRefusal } from "@miragon/bpmn-modeler-shared";

import { handMergeFeedback, idsNamedInWords, mergePickFeedback } from "./mergePickFeedback";

const blocked = (obstacle: RequirementObstacle): BlockedPick => ({
    id: "Task_Pack",
    reason: {
        element: { id: "Flow_2", state: "bothChanged" },
        requirement: {
            kind: "reference",
            property: "bpmn:SequenceFlow#targetRef",
            target: "Task_Pack",
        },
        obstacle,
    },
});

const refusedWith = (obstacle: RequirementObstacle) =>
    mergePickFeedback({
        action: "pick",
        elementId: "Task_Pack",
        keptSide: "current",
        outcome: { applied: false, blockedBy: [blocked(obstacle)] },
        openBefore: [],
        openAfter: [],
    }).outcome;

describe("mergePickFeedback", () => {
    it.each<[string, RequirementObstacle, MergePaneBlock]>([
        [
            "a part of the target this side lacks",
            { kind: "sideLacksTarget", side: "current", missing: "part" },
            {
                elementId: "Flow_2",
                targetId: "Task_Pack",
                obstacle: "sideLacksTarget",
                missing: "part",
            },
        ],
        [
            "a target picked from a side without it",
            { kind: "targetPickedWithout", side: "incoming", missing: "target" },
            {
                elementId: "Flow_2",
                targetId: "Task_Pack",
                obstacle: "targetPickedWithout",
                missing: "target",
            },
        ],
        [
            "a picked dependent",
            { kind: "dependentPicked", side: "incoming" },
            { elementId: "Flow_2", targetId: "Task_Pack", obstacle: "dependentPicked" },
        ],
    ])("names the reason of a refusal for %s", (_case, obstacle, block) => {
        expect(refusedWith(obstacle)).toStrictEqual({
            applied: false,
            action: "pick",
            elementId: "Task_Pack",
            blockedBy: [block],
        });
    });

    it("names the elements merged by hand a refused pick would move off their side", () => {
        const { outcome } = mergePickFeedback({
            action: "pick",
            elementId: "Sub_Ship",
            keptSide: "incoming",
            outcome: { applied: false, handMergesAtStake: ["Sub_Ship", "Task_Pack"] },
            openBefore: [],
            openAfter: [],
        });

        expect(outcome).toStrictEqual({
            applied: false,
            action: "pick",
            elementId: "Sub_Ship",
            blockedBy: [],
            handMergesAtStake: ["Sub_Ship", "Task_Pack"],
        });
        expect(idsNamedInWords([], outcome)).toStrictEqual(new Set(["Sub_Ship", "Task_Pack"]));
    });

    it("names what an applied pick did and offers the flows it left out on the side that kept it", () => {
        const outcome: PickOutcome = {
            applied: true,
            pulledIn: ["Task_Pack"],
            dropped: ["Flow_3"],
            connectionsLeftOut: ["Flow_2"],
        };

        expect(
            mergePickFeedback({
                action: "pick",
                elementId: "Task_Reject",
                keptSide: "incoming",
                outcome,
                openBefore: ["A"],
                openAfter: ["B"],
            }),
        ).toStrictEqual({
            outcome: {
                applied: true,
                action: "pick",
                elementId: "Task_Reject",
                pulledIn: ["Task_Pack"],
                dropped: ["Flow_3"],
                reopened: ["B"],
            },
            offer: { elementId: "Task_Reject", connections: ["Flow_2"], keptSide: "incoming" },
        });
    });

    it.each<
        [
            string,
            {
                readonly connectionsLeftOut?: readonly string[];
                readonly boundaryEventsLeftOut?: readonly string[];
            },
            object,
        ]
    >([
        [
            "with the flows",
            { connectionsLeftOut: ["Flow_2"], boundaryEventsLeftOut: ["Timer_1"] },
            { connections: ["Flow_2"], boundaryEvents: ["Timer_1"] },
        ],
        [
            "alone",
            { boundaryEventsLeftOut: ["Timer_1"] },
            { connections: [], boundaryEvents: ["Timer_1"] },
        ],
    ])("offers the boundary events an applied pick left out %s", (_name, leftOut, offered) => {
        const { offer } = mergePickFeedback({
            action: "pick",
            elementId: "Task_Reject",
            keptSide: "incoming",
            outcome: { applied: true, pulledIn: [], dropped: [], ...leftOut },
            openBefore: [],
            openAfter: [],
        });

        expect(offer).toStrictEqual({
            elementId: "Task_Reject",
            ...offered,
            keptSide: "incoming",
        });
    });

    it("names every element a pane names in words: the rows its menu lists and the last outcome's", () => {
        const { outcome } = mergePickFeedback({
            action: "leaveOut",
            elementId: "Task_Reject",
            keptSide: "current",
            outcome: {
                applied: false,
                blockedBy: [blocked({ kind: "dependentPulledInByThisPick" })],
            },
            openBefore: [],
            openAfter: [],
        });

        expect(idsNamedInWords([{ id: "Task_Check" }], outcome)).toStrictEqual(
            new Set(["Task_Check", "Task_Reject", "Flow_2", "Task_Pack"]),
        );
        expect(idsNamedInWords([], undefined)).toStrictEqual(new Set());
    });
});

describe("handMergeFeedback", () => {
    it("pins the refusals of the protocol to the merge's, data and all", () => {
        expectTypeOf<MergePaneHandMergeRefusal>().toEqualTypeOf<HandMergeRefusal>();
    });

    it("shows an accepted text as an applied merge by hand that changed no other decision", () => {
        expect(handMergeFeedback("Task_Pack", { applied: true })).toStrictEqual({
            outcome: {
                applied: true,
                action: "mergeByHand",
                elementId: "Task_Pack",
                pulledIn: [],
                dropped: [],
                reopened: [],
            },
        });
    });

    it.each<[string, HandMergeRefusal]>([
        ["markers left", { kind: "conflictMarkersLeft" }],
        ["a changed type", { kind: "typeChanged", expected: "bpmn:Task", found: "bpmn:UserTask" }],
        ["a missing element", { kind: "namesMissingElement", ids: ["Message_9"] }],
    ])("shows a refused text with %s as the refusal's data, which the pane words", (_case, refusal) => {
        expect(handMergeFeedback("Task_Pack", { applied: false, refusal })).toStrictEqual({
            outcome: {
                applied: false,
                action: "mergeByHand",
                elementId: "Task_Pack",
                blockedBy: [],
                handMergeRefusal: refusal,
            },
        });
    });

    it.each<[string, HandMergeRefusal, readonly string[]]>([
        ["its own elements", { kind: "holdsElementsOfTheirOwn", ids: ["Task_In"] }, ["Task_In"]],
        [
            "references of the wrong type",
            {
                kind: "namesWrongType",
                references: [
                    { property: "bpmn:messageRef", target: "Signal_1", expected: "bpmn:Message" },
                ],
            },
            ["Signal_1"],
        ],
        ["missing elements", { kind: "namesMissingElement", ids: ["Message_9"] }, ["Message_9"]],
        ["left-out elements", { kind: "namesLeftOutElement", ids: ["Flow_3"] }, ["Flow_3"]],
        ["other decisions", { kind: "changesOtherDecisions", ids: ["Task_B"] }, ["Task_B"]],
        ["no element", { kind: "conflictMarkersLeft" }, []],
    ])("names the elements a refusal for %s names", (_case, refusal, ids) => {
        const { outcome } = handMergeFeedback("Task_Pack", { applied: false, refusal });

        expect(idsNamedInWords([], outcome)).toStrictEqual(new Set(["Task_Pack", ...ids]));
    });

    it("shows a merge closed without saving as discarded", () => {
        expect(handMergeFeedback("Task_Pack", "discarded")).toStrictEqual({
            outcome: {
                applied: false,
                action: "mergeByHand",
                elementId: "Task_Pack",
                blockedBy: [],
                discarded: true,
            },
        });
    });
});
