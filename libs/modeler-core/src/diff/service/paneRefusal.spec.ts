import { describe, expect, it } from "vitest";

import type { PickOutcome } from "@miragon/bpmn-modeler-merge";
import type { DiffSession } from "./DiffSession";
import { type DecidingPane, type PaneDecision, PaneRefusal } from "./paneRefusal";

const APPLIED: PickOutcome = { applied: true, pulledIn: [], dropped: [] };
const BLOCKED: PickOutcome = { applied: false, blockedBy: [] };
const AT_STAKE: PickOutcome = { applied: false, handMergesAtStake: ["Task_Pack"] };

const TAB = {} as DiffSession;
const OTHER_TAB = {} as DiffSession;
const CURRENT: DecidingPane = { tab: TAB, side: "before" };

const leaveOut = (pane: DecidingPane = CURRENT): PaneDecision => ({
    pane,
    action: "leaveOut",
    decision: { kind: "pick", id: "Task_Pack", side: "current", scope: "element" },
});
const undo = (id: string, pane: DecidingPane = CURRENT): PaneDecision => ({
    pane,
    action: "unpick",
    decision: { kind: "unpick", id, scope: "element" },
});

const merge = (applies: boolean, decidesAnything = true) => ({
    wouldApply: () => applies,
    decidesAnything: () => decidesAnything,
});

const refusedLeaveOut = () => PaneRefusal.after(undefined, leaveOut(), BLOCKED, merge(false));

describe("PaneRefusal.after", () => {
    it("keeps a blocked decision as the refusal", () => {
        expect(refusedLeaveOut().refusal).toBeDefined();
    });

    it("keeps none for a decision that asks before it drops versions merged by hand", () => {
        const { refusal } = refusedLeaveOut();

        expect(PaneRefusal.after(refusal, undo("Flow_2"), AT_STAKE, merge(true))).toStrictEqual({});
    });

    it("keeps the refusal through the pane's decisions while the merge would still refuse it", () => {
        const { refusal } = refusedLeaveOut();

        expect(PaneRefusal.after(refusal, undo("Flow_2"), APPLIED, merge(false))).toStrictEqual({
            refusal,
        });
    });

    it("names the refusal as freed by the pane's undo once the merge would apply it, and forgets it", () => {
        const { refusal } = refusedLeaveOut();

        expect(PaneRefusal.after(refusal, undo("Flow_2"), APPLIED, merge(true))).toStrictEqual({
            freed: { action: "leaveOut", elementId: "Task_Pack" },
        });
    });

    it.each<[string, PaneDecision]>([
        [
            "a pick of the pane",
            { ...leaveOut(), action: "pick", decision: { ...leaveOut().decision, id: "Flow_3" } },
        ],
        ["the refused decision itself", leaveOut()],
    ])("forgets the refusal %s lets apply, naming nothing freed", (_case, decided) => {
        const { refusal } = refusedLeaveOut();

        expect(PaneRefusal.after(refusal, decided, APPLIED, merge(true))).toStrictEqual({});
    });

    it.each([
        ["the undo that repeats it", "Task_Pack"],
        ["an undo that took its pick along", "Sub"],
    ])(
        "forgets a refused undo, naming nothing freed, once %s leaves no pick to take back",
        (_case, id) => {
            const refused = PaneRefusal.after(undefined, undo("Task_Pack"), BLOCKED, merge(false));

            expect(
                PaneRefusal.after(refused.refusal, undo(id), APPLIED, merge(true, false)),
            ).toStrictEqual({});
        },
    );

    it.each<[string, DecidingPane]>([
        ["the partner", { tab: TAB, side: "after" }],
        ["the same side in another tab", { tab: OTHER_TAB, side: "before" }],
    ])("forgets the refusal on a decision of %s, newer than it", (_case, pane) => {
        const { refusal } = refusedLeaveOut();

        expect(
            PaneRefusal.after(refusal, undo("Flow_2", pane), APPLIED, merge(true)),
        ).toStrictEqual({});
    });
});
