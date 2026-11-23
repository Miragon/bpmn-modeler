import { describe, expect, it } from "vitest";

import { containersChangedByBoth, handMergeVersions } from "../../__fixtures__/handMergeVersions";
import { scenarioNamed } from "../../__fixtures__/mergeScenarios";
import {
    mergeElement,
    mergeResult,
    mergeResultWithoutBase,
    NO_SOURCES,
    refersTo,
} from "../../__fixtures__/mergeResultBuilder";
import { acceptHandMerge } from "../../build/service/acceptHandMerge";
import { prepareMergeSources } from "../../sources/service/buildMergedSources";
import { computeMerge } from "../../classify/service/computeMerge";
import { MergeDecisions } from "../../decide/domain/mergeDecisions";
import { type LackingSide, mergePaneView } from "./mergePaneView";
import type { ElementState, MergeElement } from "../../kernel/domain/mergeResult";

const NO_MARKS = { takenFromThisSide: [], takenFromOtherSide: [], conflict: [] };

const process = (state: "unchanged" | "bothChanged") =>
    mergeElement("Process_1", state, { type: "bpmn:Process", drawn: true });

describe("mergePaneView", () => {
    it("marks an element only incoming changed as taken from incoming on its pane and from the other side on current's", () => {
        const decisions = MergeDecisions.from(
            mergeResult(mergeElement("Task_Reject", "takenFromIncoming")),
        );

        expect(mergePaneView(decisions, "incoming", NO_SOURCES).marks).toEqual({
            ...NO_MARKS,
            takenFromThisSide: ["Task_Reject"],
        });
        expect(mergePaneView(decisions, "current", NO_SOURCES).marks).toEqual({
            ...NO_MARKS,
            takenFromOtherSide: ["Task_Reject"],
        });
    });

    it("marks an element current removed as taken from the other side on incoming's pane", () => {
        const decisions = MergeDecisions.from(
            mergeResult(mergeElement("Note_Check", "removedByCurrent")),
        );

        expect(mergePaneView(decisions, "incoming", NO_SOURCES).marks).toEqual({
            ...NO_MARKS,
            takenFromOtherSide: ["Note_Check"],
        });
        expect(mergePaneView(decisions, "current", NO_SOURCES).marks).toEqual(NO_MARKS);
    });

    it("marks an element one side added as taken from that side on its own pane only", () => {
        const decisions = MergeDecisions.from(
            mergeResult(mergeElement("Task_Audit", "addedByIncoming")),
        );

        expect(mergePaneView(decisions, "incoming", NO_SOURCES).marks).toEqual({
            ...NO_MARKS,
            takenFromThisSide: ["Task_Audit"],
        });
        expect(mergePaneView(decisions, "current", NO_SOURCES).marks).toEqual(NO_MARKS);
    });

    it("marks open and dangling elements as conflicts", async () => {
        const decisions = MergeDecisions.from(
            await computeMerge(
                scenarioNamed("dangling: current removes a task, incoming adds a flow from it"),
            ),
        );

        const incoming = mergePaneView(decisions, "incoming", NO_SOURCES).marks;
        expect(incoming.conflict).toEqual(expect.arrayContaining(["Task_Reject", "Flow_Escalate"]));
        expect(incoming.takenFromThisSide).not.toContain("Task_Reject");
        expect(incoming.takenFromOtherSide).not.toContain("Task_Reject");
        expect(mergePaneView(decisions, "current", NO_SOURCES).marks.conflict).not.toContain(
            "Task_Reject",
        );
    });

    it("marks a conflict on both panes that hold the element", () => {
        const decisions = MergeDecisions.from(
            mergeResult(
                mergeElement("Task_Pack", "bothChanged"),
                mergeElement("End_Rejected", "removedAndChanged"),
            ),
        );

        expect(mergePaneView(decisions, "current", NO_SOURCES).marks).toEqual({
            ...NO_MARKS,
            conflict: ["Task_Pack"],
        });
        expect(mergePaneView(decisions, "incoming", NO_SOURCES).marks).toEqual({
            ...NO_MARKS,
            conflict: ["Task_Pack", "End_Rejected"],
        });
    });

    it.each(["unchanged", "sameChange", "sameAddition", "removedByBoth"] as const)(
        "leaves an element %s unmarked",
        (state) => {
            const decisions = MergeDecisions.from(mergeResult(mergeElement("Task_1", state)));

            expect(mergePaneView(decisions, "current", NO_SOURCES).marks).toEqual(NO_MARKS);
            expect(mergePaneView(decisions, "incoming", NO_SOURCES).marks).toEqual(NO_MARKS);
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

        expect(mergePaneView(decisions, "current", NO_SOURCES).marks).toEqual({
            ...NO_MARKS,
            conflict: ["Task_Check", "Task_Audit"],
        });
        expect(mergePaneView(decisions, "incoming", NO_SOURCES).marks).toEqual({
            ...NO_MARKS,
            conflict: ["Task_Check", "Task_Extra"],
        });
    });

    it("follows a pick: the picked side's pane shows the element taken from it", () => {
        const decisions = MergeDecisions.from(
            mergeResult(mergeElement("Task_Pack", "bothChanged")),
        );
        decisions.pick("Task_Pack", "incoming");

        expect(mergePaneView(decisions, "incoming", NO_SOURCES).marks).toEqual({
            ...NO_MARKS,
            takenFromThisSide: ["Task_Pack"],
        });
        expect(mergePaneView(decisions, "current", NO_SOURCES).marks).toEqual({
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

        expect(mergePaneView(decisions, "current", NO_SOURCES)).toMatchObject({
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

        expect(mergePaneView(decisions, "current", NO_SOURCES).counts).toEqual({
            takenFromThisSide: 0,
            takenFromOtherSide: 1,
            conflict: 2,
        });
        expect(mergePaneView(decisions, "incoming", NO_SOURCES).counts).toEqual({
            takenFromThisSide: 2,
            takenFromOtherSide: 0,
            conflict: 2,
        });
    });

    it("lists no shape-less element the pane leaves unmarked", () => {
        const decisions = MergeDecisions.from(mergeResult(process("unchanged")));

        expect(mergePaneView(decisions, "incoming", NO_SOURCES).shapeless).toEqual([]);
    });

    describe("shape-less rows", () => {
        const shapeless = (id: string, state: ElementState, type = "bpmn:Message") =>
            mergeElement(id, state, { type, drawn: false });
        // Without sources no side names the element or writes a value.
        const heldByBoth = { current: {}, incoming: {}, differences: [] };
        const addedByCurrent = { current: {}, differences: [] };

        it("lists the shape-less elements either pane marks, also one the pane's side lacks, with the marker as this side sees it", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("bothChanged"),
                    shapeless("Message_Mine", "addedByCurrent"),
                    shapeless("Error_Theirs", "addedByIncoming", "bpmn:Error"),
                    shapeless("Message_Same", "unchanged"),
                    mergeElement("Task_A", "bothChanged"),
                ),
            );

            const incoming = mergePaneView(decisions, "incoming", NO_SOURCES);

            expect(incoming.shapelessRows).toStrictEqual([
                {
                    id: "Process_1",
                    type: "bpmn:Process",
                    marker: "conflict",
                    ...heldByBoth,
                },
                {
                    id: "Message_Mine",
                    type: "bpmn:Message",
                    marker: "takenFromOtherSide",
                    takenSide: "current",
                    lackingSide: { side: "incoming", lack: "missing" },
                    ...addedByCurrent,
                },
                {
                    id: "Error_Theirs",
                    type: "bpmn:Error",
                    marker: "takenFromThisSide",
                    takenSide: "incoming",
                    lackingSide: { side: "current", lack: "missing" },
                    incoming: {},
                    differences: [],
                },
            ]);
            expect(incoming.shapeless.map(({ id }) => id)).toStrictEqual([
                "Process_1",
                "Error_Theirs",
            ]);
            expect(incoming.counts.takenFromOtherSide).toBe(0);
        });

        it("names the side that removed a shape-less element", () => {
            const decisions = MergeDecisions.from(
                mergeResult(process("unchanged"), shapeless("Message_Old", "removedAndChanged")),
            );

            expect(mergePaneView(decisions, "current", NO_SOURCES).shapelessRows).toStrictEqual([
                {
                    id: "Message_Old",
                    type: "bpmn:Message",
                    marker: "conflict",
                    lackingSide: { side: "current", lack: "removed" },
                    incoming: {},
                    differences: [],
                },
            ]);
        });

        it("carries the user's pick of a shape-less element and how far Undo reaches", () => {
            const decisions = MergeDecisions.from(
                mergeResult(process("bothChanged"), shapeless("Message_Mine", "addedByCurrent")),
            );

            decisions.pick("Process_1", "incoming");
            decisions.pick("Message_Mine", "incoming");

            expect(mergePaneView(decisions, "incoming", NO_SOURCES).shapelessRows).toStrictEqual([
                {
                    id: "Process_1",
                    type: "bpmn:Process",
                    marker: "takenFromThisSide",
                    takenSide: "incoming",
                    pick: { keptSide: "incoming", scope: "element" },
                    ...heldByBoth,
                },
                {
                    id: "Message_Mine",
                    type: "bpmn:Message",
                    marker: "takenFromThisSide",
                    takenSide: "incoming",
                    lackingSide: { side: "incoming", lack: "missing" },
                    pick: { keptSide: "incoming", scope: "element" },
                    ...addedByCurrent,
                },
            ]);
        });

        it("tells a shape-less container, such as a process, which a pick can keep with everything inside", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("bothChanged"),
                    mergeElement("Task_A", "bothChanged", { parent: "Process_1" }),
                ),
            );

            expect(mergePaneView(decisions, "current", NO_SOURCES).shapelessRows).toStrictEqual([
                {
                    id: "Process_1",
                    type: "bpmn:Process",
                    marker: "conflict",
                    container: "contents",
                    ...heldByBoth,
                },
            ]);
        });

        it.each<[string, MergeElement[], string, "contents" | "poolProcesses"]>([
            [
                "a collaboration whose pool holds a process reaches every pool's process",
                [
                    mergeElement("Collaboration_1", "bothChanged", {
                        type: "bpmn:Collaboration",
                        drawn: false,
                    }),
                    mergeElement("Pool", "unchanged", {
                        type: "bpmn:Participant",
                        parent: "Collaboration_1",
                        references: [refersTo("bpmn:Participant#processRef", "Process_1")],
                    }),
                    process("unchanged"),
                    mergeElement("Task_A", "unchanged", { parent: "Process_1" }),
                ],
                "Collaboration_1",
                "poolProcesses",
            ],
            [
                "a collaboration of empty pools reaches only its contents",
                [
                    mergeElement("Collaboration_1", "bothChanged", {
                        type: "bpmn:Collaboration",
                        drawn: false,
                    }),
                    mergeElement("Pool", "unchanged", {
                        type: "bpmn:Participant",
                        parent: "Collaboration_1",
                    }),
                ],
                "Collaboration_1",
                "contents",
            ],
            [
                "a pool reaches its own process as its contents",
                [
                    mergeElement("Pool", "bothChanged", {
                        type: "bpmn:Participant",
                        references: [refersTo("bpmn:Participant#processRef", "Process_1")],
                    }),
                    process("unchanged"),
                    mergeElement("Task_A", "unchanged", { parent: "Process_1" }),
                ],
                "Pool",
                "contents",
            ],
        ])("tells how far everything inside reaches: %s", (_case, elements, id, reach) => {
            const view = mergePaneView(
                MergeDecisions.from(mergeResult(...elements)),
                "current",
                NO_SOURCES,
            );

            expect(view.pickable.find((element) => element.id === id)?.container).toBe(reach);
        });

        it("tells a collaboration's row that everything inside reaches every pool's process", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    mergeElement("Collaboration_1", "bothChanged", {
                        type: "bpmn:Collaboration",
                        drawn: false,
                    }),
                    mergeElement("Pool", "unchanged", {
                        type: "bpmn:Participant",
                        parent: "Collaboration_1",
                        references: [refersTo("bpmn:Participant#processRef", "Process_1")],
                    }),
                    process("unchanged"),
                ),
            );

            expect(
                mergePaneView(decisions, "current", NO_SOURCES).shapelessRows.find(
                    ({ id }) => id === "Collaboration_1",
                )?.container,
            ).toBe("poolProcesses");
        });
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

            expect(mergePaneView(decisions, "incoming", NO_SOURCES).badges).toEqual([
                {
                    id: "Task_Pack",
                    kind: "keptHere",
                    pick: { keptSide: "incoming", scope: "element" },
                },
            ]);
            expect(mergePaneView(decisions, "current", NO_SOURCES).badges).toEqual([
                {
                    id: "Task_Pack",
                    kind: "replacedHere",
                    pick: { keptSide: "incoming", scope: "element" },
                },
            ]);
        });

        it("badges no pick the side has no version of, which pickable carries", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Task_Reject", "removedByCurrent", { parent: "Process_1" }),
                ),
            );

            decisions.pick("Task_Reject", "incoming");

            const view = mergePaneView(decisions, "current", NO_SOURCES);
            expect(view.badges).toEqual([]);
            expect(view.pickable.find(({ id }) => id === "Task_Reject")?.pick).toEqual({
                keptSide: "incoming",
                scope: "element",
            });
            expect(mergePaneView(decisions, "incoming", NO_SOURCES).badges).toHaveLength(1);
        });

        it("badges a picked element no canvas draws on neither pane, and pickable carries it on both", () => {
            const decisions = MergeDecisions.from(mergeResult(process("bothChanged")));

            decisions.pick("Process_1", "current");

            for (const side of ["current", "incoming"] as const) {
                const view = mergePaneView(decisions, side, NO_SOURCES);
                expect(view.badges).toEqual([]);
                expect(view.pickable.find(({ id }) => id === "Process_1")?.pick).toEqual({
                    keptSide: "current",
                    scope: "element",
                });
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

            expect(mergePaneView(decisions, "incoming", NO_SOURCES).badges).toEqual([
                {
                    id: "Sub",
                    kind: "keptHere",
                    pick: { keptSide: "incoming", scope: "withContents" },
                },
                { id: "Inner", kind: "keptHere", pick: { keptSide: "incoming", scope: "element" } },
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

            decisions.pickWithRemoved("Task_Reject", "incoming");

            expect(mergePaneView(decisions, "incoming", NO_SOURCES).badges).toEqual([
                {
                    id: "Task_Reject",
                    kind: "keptHere",
                    pick: { keptSide: "incoming", scope: "withRemoved" },
                },
                {
                    id: "Flow_No",
                    kind: "keptHere",
                    pick: { keptSide: "incoming", scope: "element" },
                },
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

            const incoming = mergePaneView(decisions, "incoming", NO_SOURCES);
            expect(incoming.consequences).toEqual(["B"]);
            expect(incoming.badges.map(({ id }) => id)).toEqual(["F"]);
            expect(mergePaneView(decisions, "current", NO_SOURCES).consequences).toEqual([]);
        });

        it("offers every element for a pick, a removal included, a container with its contents, and how to take back a pick", () => {
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

            const pickable = [
                { id: "Process_1", container: "contents" },
                {
                    id: "Sub",
                    container: "contents",
                    takenSide: "current",
                    pick: { keptSide: "current", scope: "withContents" },
                },
                {
                    id: "Inner",
                    takenSide: "current",
                    pick: { keptSide: "current", scope: "element" },
                },
            ];
            const audit = {
                id: "Task_Audit",
                takenSide: "incoming",
                lackingSide: { side: "current", lack: "missing" },
            };
            expect(mergePaneView(decisions, "current", NO_SOURCES).pickable).toStrictEqual([
                ...pickable,
                audit,
            ]);
            expect(mergePaneView(decisions, "incoming", NO_SOURCES).pickable).toStrictEqual([
                ...pickable,
                audit,
            ]);
        });

        it.each<[ElementState, "withBase" | "withoutBase", LackingSide | undefined]>([
            ["removedByCurrent", "withBase", { side: "current", lack: "removed" }],
            ["removedAndChanged", "withBase", { side: "current", lack: "removed" }],
            ["removedByIncoming", "withBase", { side: "incoming", lack: "removed" }],
            ["changedAndRemoved", "withBase", { side: "incoming", lack: "removed" }],
            ["addedByCurrent", "withBase", { side: "incoming", lack: "missing" }],
            ["addedByIncoming", "withBase", { side: "current", lack: "missing" }],
            ["onlyInCurrent", "withoutBase", { side: "incoming", lack: "missing" }],
            ["onlyInIncoming", "withoutBase", { side: "current", lack: "missing" }],
            ["unchanged", "withBase", undefined],
            ["bothChanged", "withBase", undefined],
            ["sameAddition", "withBase", undefined],
            ["bothAdded", "withBase", undefined],
            ["removedByBoth", "withBase", undefined],
            ["differs", "withoutBase", undefined],
        ])(
            "tells both panes which side lacks a %s element, and why",
            (state, base, lackingSide) => {
                const build = base === "withBase" ? mergeResult : mergeResultWithoutBase;
                const decisions = MergeDecisions.from(
                    build(
                        process("unchanged"),
                        mergeElement("Task_A", state, { parent: "Process_1" }),
                    ),
                );
                const lackingSideOn = (side: "current" | "incoming") =>
                    mergePaneView(decisions, side, NO_SOURCES).pickable.find(
                        ({ id }) => id === "Task_A",
                    )?.lackingSide;

                expect(lackingSideOn("current")).toStrictEqual(lackingSide);
                expect(lackingSideOn("incoming")).toStrictEqual(lackingSide);
            },
        );

        it("badges a container with everything inside only while every element inside is picked on its side", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Sub", "bothChanged", {
                        type: "bpmn:SubProcess",
                        parent: "Process_1",
                    }),
                    mergeElement("Inner", "bothChanged", { parent: "Sub" }),
                    mergeElement("Inner2", "bothChanged", { parent: "Sub" }),
                ),
            );

            decisions.pick("Inner", "incoming");
            decisions.pick("Sub", "incoming");

            const view = mergePaneView(decisions, "incoming", NO_SOURCES);
            expect(view.badges.find(({ id }) => id === "Sub")?.pick.scope).toBe("element");
            expect(view.pickable.find(({ id }) => id === "Sub")?.pick?.scope).toBe("element");

            decisions.pick("Inner2", "incoming");

            expect(
                mergePaneView(decisions, "incoming", NO_SOURCES).badges.find(
                    ({ id }) => id === "Sub",
                )?.pick.scope,
            ).toBe("withContents");
        });

        it("badges an element with what was removed with it only once no flow a pick could keep with it is left out", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Gateway", "unchanged", { parent: "Process_1" }),
                    mergeElement("Task_End", "unchanged", { parent: "Process_1" }),
                    mergeElement("Task_Reject", "removedByCurrent", { parent: "Process_1" }),
                    flow("Flow_No", "Gateway", "Task_Reject", "removedByCurrent"),
                    flow("Flow_Rejected", "Task_Reject", "Task_End", "removedByCurrent"),
                ),
            );

            decisions.pick("Task_Reject", "incoming");
            decisions.pick("Flow_No", "incoming");

            const scopeOfTask = () =>
                mergePaneView(decisions, "incoming", NO_SOURCES).badges.find(
                    ({ id }) => id === "Task_Reject",
                )?.pick.scope;
            expect(scopeOfTask()).toBe("element");

            decisions.pick("Flow_Rejected", "incoming");

            expect(scopeOfTask()).toBe("withRemoved");
        });

        it("badges an element with what was removed with it only once no boundary event a pick could keep with it is left out", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Gateway", "unchanged", { parent: "Process_1" }),
                    mergeElement("Task_Pay", "removedByCurrent", { parent: "Process_1" }),
                    flow("Flow_Pay", "Gateway", "Task_Pay", "removedByCurrent"),
                    mergeElement("Timer_Pay", "removedByCurrent", {
                        type: "bpmn:BoundaryEvent",
                        parent: "Process_1",
                        references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "Task_Pay")],
                    }),
                ),
            );

            decisions.pick("Task_Pay", "incoming");
            decisions.pick("Flow_Pay", "incoming");

            const scopeOfTask = () =>
                mergePaneView(decisions, "incoming", NO_SOURCES).badges.find(
                    ({ id }) => id === "Task_Pay",
                )?.pick.scope;
            expect(scopeOfTask()).toBe("element");

            decisions.pick("Timer_Pay", "incoming");

            expect(scopeOfTask()).toBe("withRemoved");
        });

        it("offers no everything inside for a task that holds a data input association", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Task_Check", "bothChanged", {
                        type: "bpmn:ServiceTask",
                        parent: "Process_1",
                    }),
                    mergeElement("Association_Order", "bothChanged", {
                        type: "bpmn:DataInputAssociation",
                        parent: "Task_Check",
                    }),
                ),
            );

            expect(
                mergePaneView(decisions, "current", NO_SOURCES).pickable.find(
                    ({ id }) => id === "Task_Check",
                ),
            ).toEqual({ id: "Task_Check" });
        });

        it.each(["bpmn:SubProcess", "bpmn:Transaction", "bpmn:AdHocSubProcess", "bpmn:Lane"])(
            "offers everything inside for a %s with something inside",
            (type) => {
                const decisions = MergeDecisions.from(
                    mergeResult(
                        process("unchanged"),
                        mergeElement("Container", "bothChanged", { type, parent: "Process_1" }),
                        mergeElement("Inner", "bothChanged", { parent: "Container" }),
                    ),
                );

                expect(
                    mergePaneView(decisions, "current", NO_SOURCES).pickable.find(
                        ({ id }) => id === "Container",
                    )?.container,
                ).toBe("contents");
            },
        );

        it("tells the side the result takes where the sides differ, the side that lacks an element it leaves out, on both panes alike", () => {
            const decisions = MergeDecisions.from(
                mergeResult(
                    process("unchanged"),
                    mergeElement("Task_Open", "bothChanged", { parent: "Process_1" }),
                    mergeElement("Task_Removed", "removedByCurrent", { parent: "Process_1" }),
                    mergeElement("Task_Changed", "takenFromIncoming", { parent: "Process_1" }),
                ),
            );
            const takenSides = (side: "current" | "incoming") =>
                Object.fromEntries(
                    mergePaneView(decisions, side, NO_SOURCES).pickable.map(({ id, takenSide }) => [
                        id,
                        takenSide,
                    ]),
                );

            const expected = {
                Process_1: undefined,
                Task_Open: undefined,
                Task_Removed: "current",
                Task_Changed: "incoming",
            };
            expect(takenSides("current")).toStrictEqual(expected);
            expect(takenSides("incoming")).toStrictEqual(expected);
        });
    });

    describe("hand merges", () => {
        async function opened(versions: ReturnType<typeof handMergeVersions>) {
            const [result, sources] = await Promise.all([
                computeMerge(versions),
                prepareMergeSources(versions),
            ]);
            return { decisions: MergeDecisions.from(result), sources };
        }

        it("offers a hand merge on both panes only for a picked element with three differing texts", async () => {
            const { decisions, sources } = await opened(handMergeVersions());
            decisions.pick("Task_Check", "current");
            decisions.pick("Task_Reject", "incoming");

            for (const side of ["current", "incoming"] as const) {
                const offered = mergePaneView(decisions, side, sources)
                    .pickable.filter(({ handMergeable }) => handMergeable)
                    .map(({ id }) => id);
                expect(offered).toEqual(["Task_Check"]);
            }
        });

        it("badges an element merged by hand on both panes", async () => {
            const { decisions, sources } = await opened(handMergeVersions());
            decisions.pick("Task_Pack", "current");
            const renamed = sources.handMergeTexts
                .get("Task_Pack")!
                .current.replace('name="Pack parcel"', 'name="Pack it"');
            await acceptHandMerge(sources, decisions, "Task_Pack", "current", renamed);

            const badgeOf = (side: "current" | "incoming") =>
                mergePaneView(decisions, side, sources).badges.find(({ id }) => id === "Task_Pack");
            expect(badgeOf("current")).toEqual({
                id: "Task_Pack",
                kind: "keptHere",
                pick: { keptSide: "current", scope: "element", mergedByHand: true },
            });
            expect(badgeOf("incoming")).toMatchObject({
                kind: "replacedHere",
                pick: { mergedByHand: true },
            });
        });

        it("lists a shape-less element merged by hand with its hand-merged values", async () => {
            const { decisions, sources } = await opened(containersChangedByBoth());
            decisions.pick("Process_1", "current");
            const changed = sources.handMergeTexts
                .get("Process_1")!
                .current.replace(
                    'camunda:historyTimeToLive="30"',
                    'camunda:historyTimeToLive="60"',
                );
            expect(
                await acceptHandMerge(sources, decisions, "Process_1", "current", changed),
            ).toEqual({
                applied: true,
            });

            const view = mergePaneView(decisions, "incoming", sources);

            expect(view.pickable.find(({ id }) => id === "Process_1")?.pick).toEqual({
                keptSide: "current",
                scope: "element",
                mergedByHand: true,
            });
            expect(view.shapelessRows.find(({ id }) => id === "Process_1")).toMatchObject({
                pick: { keptSide: "current", mergedByHand: true },
                handMergeable: true,
                differences: [
                    { attribute: "camunda:historyTimeToLive", current: "60", incoming: "90" },
                ],
            });
        });
    });
});
