import { describe, expect, it } from "vitest";

import { scenarioNamed } from "./__fixtures__/mergeScenarios";
import {
    mergeElement,
    mergeResult,
    mergeResultWithoutBase,
    refersTo,
} from "./__fixtures__/mergeResultBuilder";
import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import { mergePaneView } from "./mergePaneView";
import type { ElementState } from "./mergeResult";

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

        expect(mergePaneView(decisions, "current")).toMatchObject({
            marks: { ...NO_MARKS, conflict: ["Task_Pack"] },
            shapeless: [
                { id: "Process_1", type: "bpmn:Process", marker: "conflict" },
                { id: "Message_Order", type: "bpmn:Message", marker: "takenFromOtherSide" },
            ],
        });
    });

    it("counts each marker over what the pane marks and lists, so a conflict without a shape counts too", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                process("bothChanged"),
                mergeElement("Message_Order", "takenFromIncoming", {
                    type: "bpmn:Message",
                    drawn: false,
                }),
                mergeElement("Task_Pack", "bothChanged"),
                mergeElement("Task_Audit", "addedByIncoming"),
            ),
        );

        expect(mergePaneView(decisions, "current").counts).toEqual({
            takenFromThisSide: 0,
            takenFromOtherSide: 1,
            conflict: 2,
        });
        expect(mergePaneView(decisions, "incoming").counts).toEqual({
            takenFromThisSide: 2,
            takenFromOtherSide: 0,
            conflict: 2,
        });
    });

    it("lists no shape-less element the pane leaves unmarked", () => {
        const decisions = MergeDecisions.from(mergeResult(process("unchanged")));

        expect(mergePaneView(decisions, "incoming").shapeless).toEqual([]);
    });

    describe("picks", () => {
        const flow = (id: string, source: string, target: string, state: ElementState) =>
            mergeElement(id, state, {
                type: "bpmn:SequenceFlow",
                parent: "Process_1",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", source),
                    refersTo("bpmn:SequenceFlow#targetRef", target),
                ],
            });

        it("badges only user picks, kept here on the kept side and replaced here on the other", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Task_Pack", "bothChanged", { parent: "Process_1" }),
                    mergeElement("Task_Check", "takenFromCurrent", { parent: "Process_1" }),
                ),
            );

            decisions.pick("Task_Pack", "incoming");

            expect(mergePaneView(decisions, "incoming").badges).toEqual([
                { id: "Task_Pack", kind: "keptHere", keptSide: "incoming", scope: "element" },
            ]);
            expect(mergePaneView(decisions, "current").badges).toEqual([
                { id: "Task_Pack", kind: "replacedHere", keptSide: "incoming", scope: "element" },
            ]);
            expect(mergePaneView(decisions, "current").picksNotDrawn).toEqual([]);
        });

        it("lists a pick the side has no version of as not drawn", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Task_Reject", "removedByCurrent", { parent: "Process_1" }),
                ),
            );

            decisions.pick("Task_Reject", "incoming");

            expect(mergePaneView(decisions, "current").badges).toEqual([]);
            expect(mergePaneView(decisions, "current").picksNotDrawn).toEqual([
                { id: "Task_Reject", keptSide: "incoming", scope: "element" },
            ]);
            expect(mergePaneView(decisions, "incoming").badges).toHaveLength(1);
        });

        it("lists a picked element no canvas draws as not drawn on both panes", () => {
            const decisions = MergeDecisions.from(mergeResult(process("bothChanged")));

            decisions.pick("Process_1", "current");

            for (const side of ["current", "incoming"] as const) {
                expect(mergePaneView(decisions, side).picksNotDrawn).toEqual([
                    { id: "Process_1", keptSide: "current", scope: "element" },
                ]);
            }
        });

        it("badges a container kept with its contents and each element inside", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Sub", "bothChanged", {
                        type: "bpmn:SubProcess",
                        parent: "Process_1",
                    }),
                    mergeElement("Inner", "bothChanged", { parent: "Sub" }),
                ),
            );

            decisions.pickWithContents("Sub", "incoming");

            expect(mergePaneView(decisions, "incoming").badges).toEqual([
                { id: "Sub", kind: "keptHere", keptSide: "incoming", scope: "withContents" },
                { id: "Inner", kind: "keptHere", keptSide: "incoming", scope: "element" },
            ]);
        });

        it("names the flows kept with an element in its scope", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Gateway", "unchanged", { parent: "Process_1" }),
                    mergeElement("Task_Reject", "removedByCurrent", { parent: "Process_1" }),
                    flow("Flow_No", "Gateway", "Task_Reject", "removedByCurrent"),
                ),
            );

            decisions.pickWithConnections("Task_Reject", "incoming");

            expect(mergePaneView(decisions, "incoming").badges).toEqual([
                {
                    id: "Task_Reject",
                    kind: "keptHere",
                    keptSide: "incoming",
                    scope: "withConnections",
                },
                { id: "Flow_No", kind: "keptHere", keptSide: "incoming", scope: "element" },
            ]);
        });

        it("outlines what a pick pulled in as its consequence, with no badge", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("A", "unchanged", { parent: "Process_1" }),
                    mergeElement("B", "removedByCurrent", { parent: "Process_1" }),
                    flow("F", "A", "B", "bothChanged"),
                ),
            );

            decisions.pick("F", "incoming");

            const incoming = mergePaneView(decisions, "incoming");
            expect(incoming.consequences).toEqual(["B"]);
            expect(incoming.badges.map(({ id }) => id)).toEqual(["F"]);
            expect(mergePaneView(decisions, "current").consequences).toEqual([]);
        });

        it("offers every element the side holds for a pick, a container with its contents, and how to take back a pick", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Sub", "bothChanged", {
                        type: "bpmn:SubProcess",
                        parent: "Process_1",
                    }),
                    mergeElement("Inner", "bothChanged", { parent: "Sub" }),
                    mergeElement("Task_Audit", "addedByIncoming", { parent: "Process_1" }),
                ),
            );
            decisions.pickWithContents("Sub", "current");

            expect(mergePaneView(decisions, "current").pickable).toEqual([
                { id: "Process_1", container: true },
                { id: "Sub", container: true, undo: "withContents" },
                { id: "Inner", container: false, undo: "element" },
            ]);
            expect(mergePaneView(decisions, "incoming").pickable).toContainEqual({
                id: "Task_Audit",
                container: false,
            });
        });
    });
});
