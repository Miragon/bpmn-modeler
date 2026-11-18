import { describe, expect, it } from "vitest";

import type {
    MergePaneBlock,
    MergePaneOutcome,
    MergePaneRestoreOffer,
} from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision } from "./mergeActedDecision";
import { mergeOutcomeCardContent, type MergeRememberedOutcome } from "./mergeOutcomeCard";
import type { MergeTranslate } from "./mergeTexts";

const untranslated: MergeTranslate = (key, replacements = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

const NAMES: Record<string, string> = {
    Task_Remind: "Send invoice",
    Task_Cancel: "Cancel order",
    Flow_1: "Flow from Order received to Send invoice",
};
const nameOf = (id: string) => NAMES[id] ?? id;

const applied = (
    action: MergePaneOutcome["action"],
    elementId: string,
    lists: Partial<Record<"pulledIn" | "dropped" | "reopened", string[]>> = {},
): MergePaneOutcome => ({
    applied: true,
    action,
    elementId,
    pulledIn: [],
    dropped: [],
    reopened: [],
    ...lists,
});

const refused = (
    action: MergePaneOutcome["action"],
    elementId: string,
    blockedBy: MergePaneBlock[],
): Extract<MergePaneOutcome, { applied: false }> => ({
    applied: false,
    action,
    elementId,
    blockedBy,
});

const keep = (
    elementId: string,
    scope: "element" | "withContents" | "withRemoved" = "element",
    side: "current" | "incoming" = "incoming",
): MergeActedDecision => ({ kind: "keep", elementId, scope, side, origin: "canvas" });

const leaveOut = (
    elementId: string,
    otherSideLacks: "removed" | "missing" = "removed",
): MergeActedDecision => ({
    kind: "leaveOut",
    elementId,
    side: "current",
    otherSideLacks,
    origin: "canvas",
});

const undo = (elementId: string): MergeActedDecision => ({
    kind: "undo",
    elementId,
    scope: "element",
    origin: "canvas",
});

const card = (remembered: MergeRememberedOutcome, restoreOffer?: MergePaneRestoreOffer) =>
    mergeOutcomeCardContent(remembered, { restoreOffer, nameOf, translate: untranslated });

const picked = (elementId: string, targetId = "Task_Remind"): MergePaneBlock => ({
    elementId,
    targetId,
    obstacle: "dependentPicked",
});

describe("mergeOutcomeCardContent", () => {
    it.each<[string, MergeRememberedOutcome, string]>([
        [
            "the side a pick kept",
            { outcome: applied("pick", "Task_Cancel"), acted: keep("Task_Cancel") },
            "Kept from incoming: Cancel order",
        ],
        [
            "a container kept with everything inside",
            {
                outcome: applied("pick", "Task_Cancel"),
                acted: keep("Task_Cancel", "withContents", "current"),
            },
            "Kept from current with everything inside: Cancel order",
        ],
        [
            "an element kept with what was removed with it",
            {
                outcome: applied("pick", "Task_Cancel"),
                acted: keep("Task_Cancel", "withRemoved"),
            },
            "Kept from incoming with what was removed with it: Cancel order",
        ],
        [
            "a leave-out of what the other side removed",
            { outcome: applied("leaveOut", "Task_Remind"), acted: leaveOut("Task_Remind") },
            "Left out: Send invoice, as current removed it",
        ],
        [
            "a leave-out of what the other side never had",
            {
                outcome: applied("leaveOut", "Task_Remind"),
                acted: leaveOut("Task_Remind", "missing"),
            },
            "Left out: Send invoice, as current doesn't have it",
        ],
        [
            "an undo that opened the conflict again",
            {
                outcome: applied("unpick", "Task_Cancel", { reopened: ["Task_Cancel"] }),
                acted: undo("Task_Cancel"),
            },
            "Took back the pick. Cancel order is an open conflict again.",
        ],
        [
            "an undo that left no conflict open",
            { outcome: applied("unpick", "Task_Cancel"), acted: undo("Task_Cancel") },
            "Took back the pick of Cancel order",
        ],
        [
            "a refused pick",
            { outcome: refused("pick", "Task_Cancel", []), acted: keep("Task_Cancel") },
            "Can't keep Cancel order",
        ],
        [
            "a refused leave-out",
            { outcome: refused("leaveOut", "Task_Remind", []), acted: leaveOut("Task_Remind") },
            "Can't leave out Send invoice",
        ],
        [
            "a refused undo",
            { outcome: refused("unpick", "Task_Cancel", []), acted: undo("Task_Cancel") },
            "Can't take back the pick of Cancel order",
        ],
    ])("headlines %s", (_case, remembered, headline) => {
        expect(card(remembered).headline).toBe(headline);
    });

    it("lists what the decision pulled in, dropped and opened again, in that order, without the element itself", () => {
        const content = card({
            outcome: applied("unpick", "Task_Cancel", {
                reopened: ["Task_Cancel", "Task_Remind"],
                pulledIn: ["Flow_1"],
                dropped: [],
            }),
            acted: undo("Task_Cancel"),
        });

        expect(content.applied).toBe(true);
        expect(content.elementId).toBe("Task_Cancel");
        expect(content.rows).toStrictEqual([
            {
                label: "Pulled in:",
                links: [{ elementId: "Flow_1", name: "Flow from Order received to Send invoice" }],
            },
            {
                label: "Open again:",
                links: [{ elementId: "Task_Remind", name: "Send invoice" }],
            },
        ]);
        expect(content.reasons).toStrictEqual([]);
        expect(content.blockers).toStrictEqual([]);
    });

    it("offers the flows the other side removed while the host offers them for the element", () => {
        const offer: MergePaneRestoreOffer = {
            elementId: "Task_Remind",
            connections: ["F1", "F2"],
            removedBy: "current",
        };
        const kept = { outcome: applied("pick", "Task_Remind"), acted: keep("Task_Remind") };

        expect(card(kept, offer).offer).toStrictEqual({
            elementId: "Task_Remind",
            text: "Also keep the 2 flows current removed with it",
        });
        expect(card(kept).offer).toBeUndefined();
        expect(
            card({ outcome: applied("pick", "Task_Cancel"), acted: keep("Task_Cancel") }, offer)
                .offer,
        ).toBeUndefined();
        expect(
            card({ outcome: refused("pick", "Task_Remind", []), acted: keep("Task_Remind") }, offer)
                .offer,
        ).toBeUndefined();
    });

    it("gives three short reasons for a refusal at most, counts the rest and marks every blocker once", () => {
        const content = card({
            outcome: refused("leaveOut", "Task_Remind", [
                picked("Flow_1"),
                picked("Flow_2"),
                picked("Flow_1", "Task_Cancel"),
                picked("Flow_3"),
                picked("Flow_4"),
            ]),
            acted: leaveOut("Task_Remind"),
        });

        expect(content.applied).toBe(false);
        expect(content.reasons).toStrictEqual([
            "Your pick of Flow from Order received to Send invoice needs it",
            "Your pick of Flow_2 needs it",
            "Your pick of Flow from Order received to Send invoice needs Cancel order",
        ]);
        expect(content.moreReasons).toBe("and 2 more");
        expect(content.blockers).toStrictEqual(["Flow_1", "Flow_2", "Flow_3", "Flow_4"]);
    });

    it("lists every reason where there are three or fewer, and marks what the element itself needs, never the element", () => {
        const content = card({
            outcome: refused("pick", "Task_Cancel", [
                {
                    elementId: "Task_Cancel",
                    targetId: "Task_Remind",
                    obstacle: "sideLacksTarget",
                    missing: "part",
                },
            ]),
            acted: keep("Task_Cancel"),
        });

        expect(content.reasons).toStrictEqual([
            "Cancel order needs a part of Send invoice; this side lacks it",
        ]);
        expect(content.moreReasons).toBeUndefined();
        expect(content.blockers).toStrictEqual(["Task_Remind"]);
    });

    it("marks the pick that stands in the way where a reason names the decided element as the one that needs it", () => {
        const content = card({
            outcome: refused("pick", "Flow_1", [
                {
                    elementId: "Flow_1",
                    targetId: "Task_Remind",
                    obstacle: "targetPickedWithout",
                    missing: "target",
                },
                picked("Task_Cancel", "Flow_1"),
                { elementId: "Flow_1", targetId: "Task_Remind", obstacle: "targetNotInResult" },
            ]),
            acted: keep("Flow_1"),
        });

        expect(content.blockers).toStrictEqual(["Task_Remind", "Task_Cancel"]);
    });

    it("words what a screen reader announces: the headline, each row with its names, the reasons and what an undo freed", () => {
        expect(
            card({
                outcome: applied("pick", "Task_Cancel", { pulledIn: ["Flow_1", "Task_Remind"] }),
                acted: keep("Task_Cancel"),
            }).announcement,
        ).toStrictEqual([
            "Kept from incoming: Cancel order",
            "Pulled in: Flow from Order received to Send invoice, Send invoice",
        ]);
        expect(
            card({
                outcome: refused("leaveOut", "Task_Remind", [
                    picked("Flow_1"),
                    picked("Flow_2"),
                    picked("Flow_3"),
                    picked("Flow_4"),
                ]),
                acted: leaveOut("Task_Remind"),
            }).announcement,
        ).toStrictEqual([
            "Can't leave out Send invoice",
            "Your pick of Flow from Order received to Send invoice needs it",
            "Your pick of Flow_2 needs it",
            "Your pick of Flow_3 needs it",
            "and 1 more",
        ]);
        expect(
            card({
                outcome: applied("unpick", "Flow_1"),
                acted: undo("Flow_1"),
                lifted: refused("leaveOut", "Task_Remind", [picked("Flow_1")]),
            }).announcement,
        ).toStrictEqual([
            "Took back the pick of Flow from Order received to Send invoice",
            "Nothing blocks leaving out Send invoice now",
        ]);
    });

    it("says what an undo freed, with the element it freed", () => {
        const content = card({
            outcome: applied("unpick", "Flow_1"),
            acted: undo("Flow_1"),
            lifted: refused("leaveOut", "Task_Remind", [picked("Flow_1")]),
        });

        expect(content.unblocked).toStrictEqual({
            elementId: "Task_Remind",
            text: "Nothing blocks leaving out Send invoice now",
        });
        expect(
            card({ outcome: applied("unpick", "Flow_1"), acted: undo("Flow_1") }).unblocked,
        ).toBeUndefined();
    });
});
