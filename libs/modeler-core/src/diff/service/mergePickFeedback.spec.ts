import { describe, expect, it } from "vitest";

import type { BlockedPick, PickOutcome, RequirementObstacle } from "@miragon/bpmn-modeler-merge";
import type { MergePaneBlock } from "@miragon/bpmn-modeler-shared";

import { idsNamedInWords, mergePickFeedback } from "./mergePickFeedback";

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
