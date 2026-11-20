import { describe, expect, it } from "vitest";

import type { MergePaneBlock } from "@miragon/bpmn-modeler-shared";

import {
    type MergeDecisionOutcome,
    type MergeRefusal,
    refusalFreedBy,
} from "./mergeDecisionOutcome";

const picked = (elementId: string): MergePaneBlock => ({
    elementId,
    targetId: "Task_Remind",
    obstacle: "dependentPicked",
});

const refusalBlockedBy = (...blockedBy: MergePaneBlock[]): MergeRefusal => ({
    applied: false,
    action: "leaveOut",
    elementId: "Task_Remind",
    blockedBy,
});

const undid = (elementId: string): MergeDecisionOutcome => ({
    applied: true,
    action: "unpick",
    elementId,
    pulledIn: [],
    dropped: [],
    reopened: [],
});

describe("refusalFreedBy", () => {
    const blockedByTwoPicks = refusalBlockedBy(picked("Flow_1"), picked("Flow_2"));

    it("frees the refusal when the undo took back a blocking pick and no blocking pick is left", () => {
        expect(refusalFreedBy(blockedByTwoPicks, undid("Flow_2"), new Set(["Task_Other"]))).toBe(
            true,
        );
    });

    it.each<[string, MergeRefusal, MergeDecisionOutcome, readonly string[]]>([
        ["a blocking pick is left", blockedByTwoPicks, undid("Flow_1"), ["Flow_2"]],
        ["the undo took back no blocker", blockedByTwoPicks, undid("Flow_9"), []],
        [
            "a reason was no pick an undo takes back",
            refusalBlockedBy(picked("Flow_1"), {
                elementId: "Task_Remind",
                targetId: "Data_1",
                obstacle: "targetInNoVersion",
            }),
            undid("Flow_1"),
            [],
        ],
        [
            "the outcome was a pick of the blocker, not its undo",
            blockedByTwoPicks,
            { ...undid("Flow_1"), action: "pick" },
            [],
        ],
        [
            "the undo was refused",
            blockedByTwoPicks,
            { applied: false, action: "unpick", elementId: "Flow_1", blockedBy: [] },
            [],
        ],
    ])("frees nothing where %s", (_case, refusal, outcome, pickedIds) => {
        expect(refusalFreedBy(refusal, outcome, new Set(pickedIds))).toBe(false);
    });
});
