import { describe, expect, it } from "vitest";

import type { MergePaneBlock, MergePaneOutcome } from "@miragon/bpmn-modeler-shared";

import {
    answersActedDecision,
    type MergeActedDecision,
    mergeOutcomeCardContent,
    mergeOutcomeLine,
} from "./mergeOutcomeCard";
import type { MergeTranslate } from "./mergeTexts";

const untranslated: MergeTranslate = (key, replacements = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

const NAMES: Record<string, string> = {
    Task_Remind: "Send reminder email",
    Task_Cancel: "Cancel bike order",
    Flow_1: "Flow from 7 days to Send reminder email",
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

const acted = (overrides: Partial<MergeActedDecision> = {}): MergeActedDecision => ({
    action: "pick",
    elementId: "Task_Cancel",
    scope: "element",
    side: "incoming",
    ...overrides,
});

const card = (
    outcome: MergePaneOutcome,
    decision: MergeActedDecision,
    restoreOffer?: Parameters<typeof mergeOutcomeCardContent>[2],
) => mergeOutcomeCardContent(outcome, decision, restoreOffer, nameOf, untranslated);

describe("mergeOutcomeCardContent", () => {
    it("names the kept side and the element", () => {
        expect(card(applied("pick", "Task_Cancel"), acted()).headline).toBe(
            "Kept from incoming: Cancel bike order",
        );
        expect(
            card(applied("pick", "Task_Cancel"), acted({ scope: "withContents", side: "current" }))
                .headline,
        ).toBe("Kept from current with everything inside: Cancel bike order");
    });

    it("names the side that removed what the user left out", () => {
        const content = card(
            applied("leaveOut", "Task_Remind", { dropped: ["Flow_1"] }),
            acted({ elementId: "Task_Remind", side: "current" }),
        );

        expect(content.headline).toBe("Left out: Send reminder email, as current removed it");
        expect(content.rows).toStrictEqual([{ label: "Dropped:", elementIds: ["Flow_1"] }]);
    });

    it("says an undo opened the conflict again, or took back the pick", () => {
        const undo = acted({ action: "unpick" });

        const reopened = card(
            applied("unpick", "Task_Cancel", { reopened: ["Task_Cancel"] }),
            undo,
        );
        expect(reopened.headline).toBe(
            "Took back the pick. Cancel bike order is an open conflict again.",
        );
        expect(reopened.rows).toStrictEqual([]);
        expect(card(applied("unpick", "Task_Cancel"), undo).headline).toBe(
            "Took back the pick of Cancel bike order",
        );
    });

    it("lists what the pick pulled in, dropped and opened again, in that order", () => {
        const content = card(
            applied("pick", "Task_Cancel", {
                reopened: ["Task_Remind"],
                pulledIn: ["Flow_1"],
                dropped: [],
            }),
            acted(),
        );

        expect(content.rows).toStrictEqual([
            { label: "Pulled in:", elementIds: ["Flow_1"] },
            { label: "Open again:", elementIds: ["Task_Remind"] },
        ]);
    });

    it("offers to keep the flows removed with the element the host offers them for", () => {
        const offer = {
            elementId: "Task_Remind",
            connections: ["F1", "F2"],
            removedBy: "current",
        } as const;

        expect(
            card(applied("pick", "Task_Remind"), acted({ elementId: "Task_Remind" }), offer).offer,
        ).toStrictEqual({
            elementId: "Task_Remind",
            text: "Also keep the 2 flows current removed with it",
        });
        expect(card(applied("pick", "Task_Cancel"), acted(), offer).offer).toBeUndefined();
    });

    it("says why a decision was refused, three reasons at most, and marks what blocks it", () => {
        const block = (elementId: string): MergePaneBlock => ({
            elementId,
            targetId: "Task_Remind",
            obstacle: "dependentPicked",
        });
        const content = card(
            {
                applied: false,
                action: "leaveOut",
                elementId: "Task_Remind",
                blockedBy: [block("Flow_1"), block("Flow_2"), block("Flow_1"), block("Flow_3")],
            },
            acted({ elementId: "Task_Remind", side: "current" }),
        );

        expect(content.applied).toBe(false);
        expect(content.headline).toBe("Cannot leave out Send reminder email");
        expect(content.reasons).toStrictEqual([
            "Flow from 7 days to Send reminder email, which you picked, needs Send reminder email",
            "Flow_2, which you picked, needs Send reminder email",
            "Flow from 7 days to Send reminder email, which you picked, needs Send reminder email",
        ]);
        expect(content.moreReasons).toBe("and 1 more");
        expect(content.blockers).toStrictEqual(["Flow_1", "Flow_2", "Flow_3"]);
        expect(mergeOutcomeLine(content)).toBe(
            "Cannot leave out Send reminder email: Flow from 7 days to Send reminder email, which you picked, needs Send reminder email",
        );
    });

    it("puts an applied outcome in one line by its headline", () => {
        expect(mergeOutcomeLine(card(applied("pick", "Task_Cancel"), acted()))).toBe(
            "Kept from incoming: Cancel bike order",
        );
    });
});

describe("answersActedDecision", () => {
    it("matches an outcome of the same element and kind of decision", () => {
        expect(answersActedDecision(applied("pick", "Task_Cancel"), acted())).toBe(true);
        expect(answersActedDecision(applied("leaveOut", "Task_Cancel"), acted())).toBe(true);
        expect(
            answersActedDecision(applied("unpick", "Task_Cancel"), acted({ action: "unpick" })),
        ).toBe(true);
    });

    it("matches no outcome of another element or kind, and none without a decision sent", () => {
        expect(answersActedDecision(applied("pick", "Task_Remind"), acted())).toBe(false);
        expect(answersActedDecision(applied("unpick", "Task_Cancel"), acted())).toBe(false);
        expect(answersActedDecision(applied("pick", "Task_Cancel"), undefined)).toBe(false);
        expect(answersActedDecision(undefined, acted())).toBe(false);
    });
});
