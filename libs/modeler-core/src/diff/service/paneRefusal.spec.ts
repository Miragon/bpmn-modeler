import { describe, expect, it } from "vitest";

import type { PickOutcome } from "@miragon/bpmn-modeler-merge";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import { type PaneDecision, PaneRefusal } from "./paneRefusal";

const APPLIED: PickOutcome = { applied: true, pulledIn: [], dropped: [] };
const BLOCKED: PickOutcome = { applied: false, blockedBy: [] };
const AT_STAKE: PickOutcome = { applied: false, handMergesAtStake: ["Task_Pack"] };

const leaveOut = (pane: DiffSide = "before"): PaneDecision => ({
    pane,
    action: "leaveOut",
    decision: { kind: "pick", id: "Task_Pack", side: "current", scope: "element" },
});
const undo = (id: string, pane: DiffSide = "before"): PaneDecision => ({
    pane,
    action: "unpick",
    decision: { kind: "unpick", id, scope: "element" },
});

const merge = (applies: boolean) => ({ wouldApply: () => applies });

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

    it("names nothing freed by the undo that repeats a refused undo", () => {
        const refused = PaneRefusal.after(undefined, undo("Task_Pack"), BLOCKED, merge(false));

        expect(
            PaneRefusal.after(refused.refusal, undo("Task_Pack"), APPLIED, merge(true)),
        ).toStrictEqual({});
    });

    it("forgets the refusal on the partner's decision, newer than it", () => {
        const { refusal } = refusedLeaveOut();

        expect(
            PaneRefusal.after(refusal, undo("Flow_2", "after"), APPLIED, merge(true)),
        ).toStrictEqual({});
    });
});
