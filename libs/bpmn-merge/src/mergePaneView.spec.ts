import { describe, expect, it } from "vitest";

import { scenarioNamed } from "./__fixtures__/mergeScenarios";
import {
    mergeElement,
    mergeResult,
    mergeResultWithoutBase,
} from "./__fixtures__/mergeResultBuilder";
import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import { mergePaneView } from "./mergePaneView";

const NO_MARKS = { takenFromThisSide: [], takenFromOtherSide: [], conflict: [] };

const process = (state: "unchanged" | "bothChanged") =>
    mergeElement("Process_1", state, { type: "bpmn:Process", drawn: true });

describe("mergePaneView", () => {
    it("marks an element only incoming changed as taken from incoming on its pane and from the other side on current's", () => {
        const decisions = MergeDecisions.from(
            mergeResult(mergeElement("Task_Reject", "takenFromIncoming")),
        );

        expect(mergePaneView(decisions, "incoming").marks).toEqual({
            ...NO_MARKS,
            takenFromThisSide: ["Task_Reject"],
        });
        expect(mergePaneView(decisions, "current").marks).toEqual({
            ...NO_MARKS,
            takenFromOtherSide: ["Task_Reject"],
        });
    });

    it("marks an element current removed as taken from the other side on incoming's pane", () => {
        const decisions = MergeDecisions.from(
            mergeResult(mergeElement("Note_Check", "removedByCurrent")),
        );

        expect(mergePaneView(decisions, "incoming").marks).toEqual({
            ...NO_MARKS,
            takenFromOtherSide: ["Note_Check"],
        });
        expect(mergePaneView(decisions, "current").marks).toEqual(NO_MARKS);
    });

    it("marks an element one side added as taken from that side on its own pane only", () => {
        const decisions = MergeDecisions.from(
            mergeResult(mergeElement("Task_Audit", "addedByIncoming")),
        );

        expect(mergePaneView(decisions, "incoming").marks).toEqual({
            ...NO_MARKS,
            takenFromThisSide: ["Task_Audit"],
        });
        expect(mergePaneView(decisions, "current").marks).toEqual(NO_MARKS);
    });

    it("marks open and dangling elements as conflicts", async () => {
        const decisions = MergeDecisions.from(
            await computeMerge(
                scenarioNamed("dangling: current removes a task, incoming adds a flow from it"),
            ),
        );

        const incoming = mergePaneView(decisions, "incoming").marks;
        expect(incoming.conflict).toEqual(expect.arrayContaining(["Task_Reject", "Flow_Escalate"]));
        expect(incoming.takenFromThisSide).not.toContain("Task_Reject");
        expect(incoming.takenFromOtherSide).not.toContain("Task_Reject");
        expect(mergePaneView(decisions, "current").marks.conflict).not.toContain("Task_Reject");
    });

    it("marks a conflict on both panes that hold the element", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                mergeElement("Task_Pack", "bothChanged"),
                mergeElement("End_Rejected", "removedAndChanged"),
            ),
        );

        expect(mergePaneView(decisions, "current").marks).toEqual({
            ...NO_MARKS,
            conflict: ["Task_Pack"],
        });
        expect(mergePaneView(decisions, "incoming").marks).toEqual({
            ...NO_MARKS,
            conflict: ["Task_Pack", "End_Rejected"],
        });
    });

    it.each(["unchanged", "sameChange", "sameAddition", "removedByBoth"] as const)(
        "leaves an element %s unmarked",
        (state) => {
            const decisions = MergeDecisions.from(mergeResult(mergeElement("Task_1", state)));

            expect(mergePaneView(decisions, "current").marks).toEqual(NO_MARKS);
            expect(mergePaneView(decisions, "incoming").marks).toEqual(NO_MARKS);
        },
    );

    it("marks every content difference as a conflict without an ancestor", () => {
        const decisions = MergeDecisions.from(
            mergeResultWithoutBase(
                mergeElement("Task_Same", "unchanged"),
                mergeElement("Task_Check", "differs"),
                mergeElement("Task_Audit", "onlyInCurrent"),
                mergeElement("Task_Extra", "onlyInIncoming"),
            ),
        );

        expect(mergePaneView(decisions, "current").marks).toEqual({
            ...NO_MARKS,
            conflict: ["Task_Check", "Task_Audit"],
        });
        expect(mergePaneView(decisions, "incoming").marks).toEqual({
            ...NO_MARKS,
            conflict: ["Task_Check", "Task_Extra"],
        });
    });

    it("follows a pick: the picked side's pane shows the element taken from it", () => {
        const decisions = MergeDecisions.from(
            mergeResult(mergeElement("Task_Pack", "bothChanged")),
        );
        decisions.pick("Task_Pack", "incoming");

        expect(mergePaneView(decisions, "incoming").marks).toEqual({
            ...NO_MARKS,
            takenFromThisSide: ["Task_Pack"],
        });
        expect(mergePaneView(decisions, "current").marks).toEqual({
            ...NO_MARKS,
            takenFromOtherSide: ["Task_Pack"],
        });
    });

    it("lists a marked element no canvas draws instead of marking it", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                process("bothChanged"),
                mergeElement("Message_Order", "takenFromIncoming", {
                    type: "bpmn:Message",
                    drawn: false,
                }),
                mergeElement("Task_Pack", "bothChanged"),
            ),
        );

        expect(mergePaneView(decisions, "current")).toEqual({
            marks: { ...NO_MARKS, conflict: ["Task_Pack"] },
            shapeless: [
                { id: "Process_1", type: "bpmn:Process", marker: "conflict" },
                { id: "Message_Order", type: "bpmn:Message", marker: "takenFromOtherSide" },
            ],
        });
    });

    it("lists no shape-less element the pane leaves unmarked", () => {
        const decisions = MergeDecisions.from(mergeResult(process("unchanged")));

        expect(mergePaneView(decisions, "incoming").shapeless).toEqual([]);
    });
});
