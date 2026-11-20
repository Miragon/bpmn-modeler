import { describe, expect, expectTypeOf, it } from "vitest";

import type {
    MergeContainerRepair,
    MergeOverlapRepair,
} from "@miragon/bpmn-modeler-types/mergeBuildNotes";

import {
    type ElementSpec,
    mergeElement,
    mergeResult,
    mergeResultWithoutBase,
    refersTo,
} from "./__fixtures__/mergeResultBuilder";
import {
    type BuildNoteContent,
    type NoteRepairOf,
    type RepairOf,
    buildNotesOf,
    flowNotDrawnNotes,
    layoutChangedByBothNotes,
    restoredWithoutRemovedWithNotes,
} from "./buildNotes";
import type { ConnectionEnds } from "./connectionEnds";
import type { MergeResolution } from "./mergeDecisions";
import { MERGE_SIDES, type MergeResult, type MergeSide } from "./mergeResult";

const FLOW_ENDS = [
    refersTo("bpmn:SequenceFlow#sourceRef", "Task_A"),
    refersTo("bpmn:SequenceFlow#targetRef", "Task_B"),
];

function resolutionWithLayout(layout: Record<string, MergeSide>): MergeResolution {
    return {
        elements: Object.fromEntries(Object.keys(layout).map((id) => [id, "current"])),
        layout,
        appendedLanes: [],
    };
}

describe("NoteRepairOf", () => {
    it("turns a repair the layout records back into the note's repair", () => {
        expectTypeOf<
            NoteRepairOf<RepairOf<MergeOverlapRepair>>
        >().toEqualTypeOf<MergeOverlapRepair>();
        expectTypeOf<
            NoteRepairOf<RepairOf<MergeContainerRepair>>
        >().toEqualTypeOf<MergeContainerRepair>();
    });
});

describe("buildNotesOf", () => {
    it("gives every note the elements it names, in the order its entry offers them", () => {
        const notes = buildNotesOf({
            result: mergeResult(),
            resolution: resolutionWithLayout({}),
            undrawnEdges: [{ id: "Flow_1", ends: { target: "Task_B" } }],
            layoutSpotNotes: [
                {
                    kind: "lanesOverlap",
                    ids: ["Lane_2", "Lane_1"],
                    repair: "movedByBuildAndShifted",
                    moved: "Lane_2",
                    grown: ["Pool_1"],
                    shifted: ["Pool_2"],
                },
            ],
            flowDefaults: [],
            restoredDefaults: new Map(),
            layoutOf: () => undefined,
            frameNotes: [{ kind: "frameDiffers", attribute: "exporter" }],
        });

        expect(notes.map(({ kind, named }) => ({ kind, named }))).toStrictEqual([
            { kind: "flowNotDrawn", named: ["Flow_1", "Task_B"] },
            { kind: "lanesOverlap", named: ["Lane_2", "Lane_1", "Pool_1", "Pool_2"] },
            { kind: "frameDiffers", named: [] },
        ]);
    });
});

describe("restoredWithoutRemovedWithNotes", () => {
    const flowInto = (target: string) => [
        refersTo("bpmn:SequenceFlow#sourceRef", "Gateway"),
        refersTo("bpmn:SequenceFlow#targetRef", target),
    ];
    const gateway = mergeElement("Gateway", "unchanged", { type: "bpmn:ExclusiveGateway" });

    it("names an element kept against the other side's removal whose flows on its side the result leaves out", () => {
        const result = mergeResult(
            gateway,
            mergeElement("Task_Reject", "removedByCurrent"),
            mergeElement("Flow_No", "removedByCurrent", {
                type: "bpmn:SequenceFlow",
                references: flowInto("Task_Reject"),
            }),
            mergeElement("Flow_Escalate", "addedByIncoming", {
                type: "bpmn:SequenceFlow",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", "Task_Reject"),
                    refersTo("bpmn:SequenceFlow#targetRef", "Gateway"),
                ],
            }),
        );
        const resolution: MergeResolution = {
            elements: {
                Gateway: "current",
                Task_Reject: "incoming",
                Flow_No: "current",
                Flow_Escalate: "incoming",
            },
            layout: {},
            appendedLanes: [],
        };

        expect(restoredWithoutRemovedWithNotes(result, resolution)).toEqual([
            { kind: "restoredWithoutRemovedWith", id: "Task_Reject", connections: ["Flow_No"] },
        ]);
    });

    it("names an element changed on one side and kept against the other side's removal", () => {
        const result = mergeResult(
            gateway,
            mergeElement("Task_Check", "changedAndRemoved"),
            mergeElement("Flow_In", "removedByIncoming", {
                type: "bpmn:SequenceFlow",
                references: flowInto("Task_Check"),
            }),
        );
        const resolution: MergeResolution = {
            elements: { Gateway: "current", Task_Check: "current", Flow_In: "incoming" },
            layout: {},
            appendedLanes: [],
        };

        expect(restoredWithoutRemovedWithNotes(result, resolution)).toEqual([
            { kind: "restoredWithoutRemovedWith", id: "Task_Check", connections: ["Flow_In"] },
        ]);
    });

    it.each([
        {
            rule: "ignores an element whose removal stands",
            elements: { Gateway: "current", Task_Reject: "current", Flow_No: "current" },
        },
        {
            rule: "ignores a kept element whose flows are kept too",
            elements: { Gateway: "current", Task_Reject: "incoming", Flow_No: "incoming" },
        },
    ] as const)("$rule", ({ elements }) => {
        const result = mergeResult(
            gateway,
            mergeElement("Task_Reject", "removedByCurrent"),
            mergeElement("Flow_No", "removedByCurrent", {
                type: "bpmn:SequenceFlow",
                references: flowInto("Task_Reject"),
            }),
        );

        expect(
            restoredWithoutRemovedWithNotes(result, { elements, layout: {}, appendedLanes: [] }),
        ).toEqual([]);
    });

    describe("with a boundary event the other side removed with the element", () => {
        /** Current removed Task_Pay with its timer and the timer's flow; incoming kept them all. */
        const removedWithItsTimer = mergeResult(
            gateway,
            mergeElement("Task_Pay", "removedByCurrent"),
            mergeElement("Timer_Pay", "removedByCurrent", {
                type: "bpmn:BoundaryEvent",
                references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "Task_Pay")],
            }),
            mergeElement("Flow_Timeout", "removedByCurrent", {
                type: "bpmn:SequenceFlow",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", "Timer_Pay"),
                    refersTo("bpmn:SequenceFlow#targetRef", "Gateway"),
                ],
            }),
        );
        const keeping = (kept: readonly string[]): MergeResolution => ({
            elements: Object.fromEntries(
                ["Gateway", "Task_Pay", "Timer_Pay", "Flow_Timeout"].map((id) => [
                    id,
                    kept.includes(id) ? "incoming" : "current",
                ]),
            ),
            layout: {},
            appendedLanes: [],
        });

        it("names the boundary event left out and its flow", () => {
            expect(
                restoredWithoutRemovedWithNotes(removedWithItsTimer, keeping(["Task_Pay"])),
            ).toEqual([
                {
                    kind: "restoredWithoutRemovedWith",
                    id: "Task_Pay",
                    connections: ["Flow_Timeout"],
                    boundaryEvents: ["Timer_Pay"],
                },
            ]);
        });

        it("leaves the flow of a kept boundary event to the event's own note", () => {
            expect(
                restoredWithoutRemovedWithNotes(
                    removedWithItsTimer,
                    keeping(["Task_Pay", "Timer_Pay"]),
                ),
            ).toEqual([
                {
                    kind: "restoredWithoutRemovedWith",
                    id: "Timer_Pay",
                    connections: ["Flow_Timeout"],
                },
            ]);
        });

        it("names nothing once the boundary event and its flow are kept", () => {
            expect(
                restoredWithoutRemovedWithNotes(
                    removedWithItsTimer,
                    keeping(["Task_Pay", "Timer_Pay", "Flow_Timeout"]),
                ),
            ).toEqual([]);
        });
    });

    it("ignores an element no side removed, even when the other side removed one of its flows", () => {
        const result = mergeResult(
            gateway,
            mergeElement("Task_A", "takenFromIncoming"),
            mergeElement("Flow_A", "removedByCurrent", {
                type: "bpmn:SequenceFlow",
                references: flowInto("Task_A"),
            }),
        );
        const resolution: MergeResolution = {
            elements: { Gateway: "current", Task_A: "incoming", Flow_A: "current" },
            layout: {},
            appendedLanes: [],
        };

        expect(restoredWithoutRemovedWithNotes(result, resolution)).toEqual([]);
    });
});

describe("layoutChangedByBothNotes", () => {
    const drawnApartBySide = (id: string, side: MergeSide) => `${id} as ${side} drew it`;
    const moved = (id: string, spec: ElementSpec = {}) =>
        mergeElement(id, "unchanged", { layout: "bothChanged", ...spec });
    const notesOf = (
        result: MergeResult,
        sides: Record<string, MergeSide>,
        layoutOf: (id: string, side: MergeSide) => string | undefined = drawnApartBySide,
    ) => layoutChangedByBothNotes(result, resolutionWithLayout(sides), layoutOf);

    it.each(MERGE_SIDES)(
        "names an element both sides moved differently and %s's layout, which the result keeps",
        (side) => {
            expect(notesOf(mergeResult(moved("Task_A")), { Task_A: side })).toEqual([
                { kind: "layoutChangedByBoth", ids: ["Task_A"], keptSide: side },
            ]);
        },
    );

    it("ignores an element both sides moved alike", () => {
        expect(
            notesOf(mergeResult(moved("Task_A")), { Task_A: "current" }, (id) => `${id} moved`),
        ).toEqual([]);
    });

    it.each([
        {
            rule: "only current moved",
            element: mergeElement("Task_A", "unchanged", { layout: "takenFromCurrent" }),
        },
        {
            rule: "only incoming moved",
            element: mergeElement("Task_A", "unchanged", { layout: "takenFromIncoming" }),
        },
        {
            rule: "current stopped drawing",
            element: moved("Task_A", { current: { drawn: false } }),
        },
        {
            rule: "incoming stopped drawing",
            element: moved("Task_A", { incoming: { drawn: false } }),
        },
        { rule: "the base did not draw", element: moved("Task_A", { base: { drawn: false } }) },
    ])("ignores an element $rule", ({ element }) => {
        expect(notesOf(mergeResult(element), { Task_A: "current" })).toEqual([]);
    });

    it("notes nothing without a base, where every layout the sides draw differently changed on both", () => {
        const result = mergeResultWithoutBase(
            mergeElement("Task_A", "differs", { layout: "bothChanged" }),
        );

        expect(notesOf(result, { Task_A: "current" })).toEqual([]);
    });

    it("ignores an element the result does not draw", () => {
        expect(
            layoutChangedByBothNotes(
                mergeResult(moved("Task_A")),
                { elements: { Task_A: "current" }, layout: {}, appendedLanes: [] },
                drawnApartBySide,
            ),
        ).toEqual([]);
    });

    it("lists a sub-process both sides moved with its contents, not each child", () => {
        const result = mergeResult(
            moved("Sub_1", { type: "bpmn:SubProcess" }),
            moved("Task_In", { parent: "Sub_1" }),
            moved("Boundary_In", {
                type: "bpmn:BoundaryEvent",
                parent: "Sub_1",
                references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "Task_In")],
            }),
            moved("Task_Next", { parent: "Sub_1" }),
            moved("Flow_In", {
                type: "bpmn:SequenceFlow",
                parent: "Sub_1",
                references: [
                    refersTo("bpmn:SequenceFlow#sourceRef", "Task_In"),
                    refersTo("bpmn:SequenceFlow#targetRef", "Task_Next"),
                ],
            }),
        );
        const sides = Object.fromEntries(
            result.elements.map(({ id }): [string, MergeSide] => [id, "current"]),
        );

        expect(notesOf(result, sides)).toEqual([
            { kind: "layoutChangedByBoth", ids: ["Sub_1"], keptSide: "current" },
        ]);
    });

    it("lists a boundary event's host for both", () => {
        const result = mergeResult(
            moved("Task_A"),
            moved("Boundary_A", {
                type: "bpmn:BoundaryEvent",
                references: [refersTo("bpmn:BoundaryEvent#attachedToRef", "Task_A")],
            }),
        );

        expect(notesOf(result, { Task_A: "incoming", Boundary_A: "incoming" })).toEqual([
            { kind: "layoutChangedByBoth", ids: ["Task_A"], keptSide: "incoming" },
        ]);
    });

    it("lists the pool for the elements of the process it draws", () => {
        const result = mergeResult(
            moved("Participant_1", {
                type: "bpmn:Participant",
                references: [refersTo("bpmn:Participant#processRef", "Process_1")],
            }),
            mergeElement("Process_1", "unchanged", { type: "bpmn:Process", drawn: false }),
            moved("Task_A", { parent: "Process_1" }),
        );

        expect(notesOf(result, { Participant_1: "current", Task_A: "current" })).toEqual([
            { kind: "layoutChangedByBoth", ids: ["Participant_1"], keptSide: "current" },
        ]);
    });

    it("gives one note to elements a flow both sides moved links, without the flow", () => {
        const result = mergeResult(
            moved("Task_A"),
            moved("Task_B"),
            moved("Flow_AB", { references: FLOW_ENDS }),
        );

        expect(
            notesOf(result, { Task_A: "current", Task_B: "current", Flow_AB: "current" }),
        ).toEqual([
            { kind: "layoutChangedByBoth", ids: ["Task_A", "Task_B"], keptSide: "current" },
        ]);
    });

    it("gives two notes to two elements no flow both sides moved links", () => {
        const result = mergeResult(
            moved("Task_A"),
            moved("Task_B"),
            mergeElement("Flow_AB", "unchanged", {
                layout: "takenFromCurrent",
                references: FLOW_ENDS,
            }),
        );

        expect(
            notesOf(result, { Task_A: "current", Task_B: "current", Flow_AB: "current" }),
        ).toEqual([
            { kind: "layoutChangedByBoth", ids: ["Task_A"], keptSide: "current" },
            { kind: "layoutChangedByBoth", ids: ["Task_B"], keptSide: "current" },
        ]);
    });

    it("lists no flow that changed with an end both sides moved", () => {
        const result = mergeResult(
            moved("Task_A"),
            mergeElement("Task_B", "unchanged"),
            moved("Flow_AB", { references: FLOW_ENDS }),
        );

        expect(
            notesOf(result, { Task_A: "current", Task_B: "current", Flow_AB: "current" }),
        ).toEqual([{ kind: "layoutChangedByBoth", ids: ["Task_A"], keptSide: "current" }]);
    });

    it("leaves out a flow whose ends each side moved one of", () => {
        const result = mergeResult(
            mergeElement("Task_A", "unchanged", { layout: "takenFromCurrent" }),
            mergeElement("Task_B", "unchanged", { layout: "takenFromIncoming" }),
            moved("Flow_AB", { references: FLOW_ENDS }),
        );
        const sides = { Task_A: "current", Task_B: "incoming", Flow_AB: "current" } as const;

        expect(notesOf(result, sides)).toEqual([]);
    });

    it("names a flow both sides re-routed between ends neither moved", () => {
        const result = mergeResult(
            mergeElement("Task_A", "unchanged"),
            mergeElement("Task_B", "unchanged"),
            moved("Flow_AB", { references: FLOW_ENDS }),
        );

        expect(
            notesOf(result, { Task_A: "current", Task_B: "current", Flow_AB: "incoming" }),
        ).toEqual([{ kind: "layoutChangedByBoth", ids: ["Flow_AB"], keptSide: "incoming" }]);
    });

    it("does not join elements by the lane that holds them", () => {
        const result = mergeResult(
            moved("Lane_A", { type: "bpmn:Lane" }),
            moved("Task_A", { lanes: ["Lane_A"] }),
            moved("Task_B", { lanes: ["Lane_A"] }),
        );

        expect(
            notesOf(result, { Lane_A: "current", Task_A: "current", Task_B: "current" }),
        ).toEqual(
            ["Lane_A", "Task_A", "Task_B"].map((id) => ({
                kind: "layoutChangedByBoth",
                ids: [id],
                keptSide: "current",
            })),
        );
    });

    it("splits a group by the side each element is drawn from", () => {
        const result = mergeResult(
            moved("Sub_1", { type: "bpmn:SubProcess" }),
            moved("Task_In", { parent: "Sub_1" }),
            moved("Task_Next", { parent: "Sub_1" }),
        );

        expect(
            notesOf(result, { Sub_1: "current", Task_In: "incoming", Task_Next: "incoming" }),
        ).toEqual([
            { kind: "layoutChangedByBoth", ids: ["Sub_1"], keptSide: "current" },
            { kind: "layoutChangedByBoth", ids: ["Task_In", "Task_Next"], keptSide: "incoming" },
        ]);
    });
});

describe("flowNotDrawnNotes", () => {
    it.each<[ConnectionEnds, BuildNoteContent]>([
        [
            { source: "Task_A", target: "Task_B" },
            { kind: "flowNotDrawn", id: "Flow_1", source: "Task_A", target: "Task_B" },
        ],
        [{ target: "Task_B" }, { kind: "flowNotDrawn", id: "Flow_1", target: "Task_B" }],
        [{ source: "Task_A" }, { kind: "flowNotDrawn", id: "Flow_1", source: "Task_A" }],
    ])("names an edge left out of the drawing with its ends %o by role", (ends, note) => {
        expect(flowNotDrawnNotes([{ id: "Flow_1", ends }])).toStrictEqual([note]);
    });
});
