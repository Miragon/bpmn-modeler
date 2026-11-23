import { describe, expect, it } from "vitest";

import { handMergeVersions } from "../../__fixtures__/handMergeVersions";
import { computeMerge } from "../../classify/service/computeMerge";
import { prepareMergeSources } from "../../sources/service/buildMergedSources";
import {
    type HandMergeTexts,
    handMergeableSide,
    handMergeStartOf,
    takeBackHandMergePick,
} from "./handMergeEligibility";
import { type DecisionOrigin, MergeDecisions } from "./mergeDecisions";

async function opened() {
    const versions = handMergeVersions();
    const [result, sources] = await Promise.all([
        computeMerge(versions),
        prepareMergeSources(versions),
    ]);
    return { decisions: MergeDecisions.from(result), texts: sources.handMergeTexts };
}

const THREE_TEXTS: ReadonlyMap<string, HandMergeTexts> = new Map([
    ["Task_Check", { base: "<a/>", current: "<b/>", incoming: "<c/>" }],
]);

describe("handMergeStartOf", () => {
    it("starts with a pick on an open conflict whose three texts differ", async () => {
        const { decisions, texts } = await opened();

        expect(decisions.originOf("Task_Check")).toBeUndefined();
        expect(handMergeStartOf(decisions, texts, "Task_Check")).toBe("withPick");
        expect(handMergeableSide(decisions, texts, "Task_Check")).toBeUndefined();
    });

    it.each(["current", "incoming"] as const)(
        "starts on the picked version once the user's pick keeps it from %s",
        async (side) => {
            const { decisions, texts } = await opened();
            decisions.pick("Task_Check", side);

            expect(handMergeStartOf(decisions, texts, "Task_Check")).toBe("pickedVersion");
            expect(handMergeableSide(decisions, texts, "Task_Check")).toBe(side);
        },
    );

    it("starts with a pick again once the user's pick is taken back", async () => {
        const { decisions, texts } = await opened();
        decisions.pick("Task_Check", "current");
        decisions.unpick("Task_Check");

        expect(handMergeStartOf(decisions, texts, "Task_Check")).toBe("withPick");
    });

    it.each<[DecisionOrigin | undefined, "pickedVersion" | "withPick"]>([
        [undefined, "withPick"],
        ["automatic", "withPick"],
        ["consequence", "withPick"],
        ["picked", "pickedVersion"],
    ])("reads a decision of origin %s as a start %s", (origin, start) => {
        const decisions = { originOf: () => origin, sideOf: () => "incoming" as const };

        expect(handMergeStartOf(decisions, THREE_TEXTS, "Task_Check")).toBe(start);
    });

    it.each<[DecisionOrigin, "incoming" | undefined]>([
        ["automatic", undefined],
        ["consequence", undefined],
        ["picked", "incoming"],
    ])("lets a hand merge replace a side decided by origin %s: %s", (origin, replaceableSide) => {
        const decisions = { originOf: () => origin, sideOf: () => "incoming" as const };

        expect(handMergeableSide(decisions, THREE_TEXTS, "Task_Check")).toBe(replaceableSide);
    });

    it("offers no hand merge of an element whose three texts do not all differ, picked or not", async () => {
        const { decisions, texts } = await opened();

        expect(handMergeStartOf(decisions, texts, "Message_New")).toBeUndefined();
        decisions.pick("Message_New", "incoming");
        expect(handMergeStartOf(decisions, texts, "Message_New")).toBeUndefined();
        expect(handMergeableSide(decisions, texts, "Message_New")).toBeUndefined();
    });
});

describe("takeBackHandMergePick", () => {
    it("takes back the pick a hand merge made for itself, so the conflict is open again", async () => {
        const { decisions, texts } = await opened();
        decisions.pick("Task_Check", "current");

        expect(takeBackHandMergePick(decisions, texts, "Task_Check", "current")).toBe(true);
        expect(decisions.originOf("Task_Check")).toBeUndefined();
        expect(decisions.openConflicts.map(({ id }) => id)).toContain("Task_Check");
    });

    it("leaves a pick the user moved to the other side since", async () => {
        const { decisions, texts } = await opened();
        decisions.pick("Task_Check", "incoming");

        expect(takeBackHandMergePick(decisions, texts, "Task_Check", "current")).toBe(false);
        expect(decisions.originOf("Task_Check")).toBe("picked");
        expect(decisions.sideOf("Task_Check")).toBe("incoming");
    });

    it("takes nothing back once the user undid the pick", async () => {
        const { decisions, texts } = await opened();
        decisions.pick("Task_Check", "current");
        decisions.unpick("Task_Check");

        expect(takeBackHandMergePick(decisions, texts, "Task_Check", "current")).toBe(false);
    });

    it("leaves the pick of an element whose texts a hand merge cannot start from", async () => {
        const { decisions, texts } = await opened();
        decisions.pick("Message_New", "incoming");

        expect(takeBackHandMergePick(decisions, texts, "Message_New", "incoming")).toBe(false);
        expect(decisions.originOf("Message_New")).toBe("picked");
    });

    it("answers that it took nothing back where the undo is refused", () => {
        const refusingTheUndo = {
            originOf: () => "picked" as const,
            sideOf: () => "current" as const,
            unpick: () => ({ applied: false, handMergesAtStake: ["Task_Pack"] }) as const,
        };

        expect(takeBackHandMergePick(refusingTheUndo, THREE_TEXTS, "Task_Check", "current")).toBe(
            false,
        );
    });
});
