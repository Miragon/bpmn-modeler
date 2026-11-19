import { describe, expect, it } from "vitest";

import {
    type ElementSpec,
    mergeElement,
    mergeResult,
    mergeResultWithoutBase,
    refersTo,
} from "./__fixtures__/mergeResultBuilder";
import {
    addedAtSamePlaceNotes,
    drawnApartFromContainerNotes,
    flowEndsNotes,
    layoutChangedByBothNotes,
    restoredWithoutRemovedWithNotes,
} from "./buildNotes";
import type { DiagramBounds } from "./diagramIndex";
import type { MergeResolution } from "./mergeDecisions";
import { type LayoutState, MERGE_SIDES, type MergeResult, type MergeSide } from "./mergeResult";

const FLOW_ENDS = [
    refersTo("bpmn:SequenceFlow#sourceRef", "Task_A"),
    refersTo("bpmn:SequenceFlow#targetRef", "Task_B"),
];

function flowBetweenTasks(layouts: {
    flow: LayoutState;
    source: LayoutState;
    target: LayoutState;
}) {
    return mergeResult(
        mergeElement("Task_A", "unchanged", { layout: layouts.source }),
        mergeElement("Task_B", "unchanged", { layout: layouts.target }),
        mergeElement("Flow_AB", "unchanged", { layout: layouts.flow, references: FLOW_ENDS }),
    );
}

function resolutionWithLayout(layout: Record<string, MergeSide>): MergeResolution {
    return {
        elements: Object.fromEntries(Object.keys(layout).map((id) => [id, "current"])),
        layout,
    };
}

describe("flowEndsNotes", () => {
    it.each([
        {
            rule: "names a flow whose ends are drawn from different sides",
            layouts: {
                flow: "bothChanged",
                source: "takenFromCurrent",
                target: "takenFromIncoming",
            },
            sides: { Flow_AB: "current", Task_A: "current", Task_B: "incoming" },
            expected: [
                { kind: "flowEndsFromDifferentSides", id: "Flow_AB", ends: ["Task_A", "Task_B"] },
            ],
        },
        {
            rule: "names a flow drawn on another side than one moved end",
            layouts: { flow: "takenFromIncoming", source: "takenFromCurrent", target: "unchanged" },
            sides: { Flow_AB: "incoming", Task_A: "current", Task_B: "current" },
            expected: [
                { kind: "flowEndsFromDifferentSides", id: "Flow_AB", ends: ["Task_A", "Task_B"] },
            ],
        },
        {
            rule: "ignores an end whose layout both sides share",
            layouts: {
                flow: "takenFromIncoming",
                source: "unchanged",
                target: "takenFromIncoming",
            },
            sides: { Flow_AB: "incoming", Task_A: "current", Task_B: "incoming" },
            expected: [],
        },
        {
            rule: "ignores a flow drawn from one side with its ends",
            layouts: { flow: "bothChanged", source: "takenFromCurrent", target: "bothChanged" },
            sides: { Flow_AB: "current", Task_A: "current", Task_B: "current" },
            expected: [],
        },
    ] as const)("$rule", ({ layouts, sides, expected }) => {
        expect(flowEndsNotes(flowBetweenTasks(layouts), resolutionWithLayout(sides))).toEqual(
            expected,
        );
    });

    it("ignores a flow that is not drawn in the result", () => {
        const result = flowBetweenTasks({
            flow: "takenFromCurrent",
            source: "takenFromCurrent",
            target: "takenFromIncoming",
        });
        const resolution: MergeResolution = {
            elements: { Flow_AB: "current", Task_A: "current", Task_B: "incoming" },
            layout: { Task_A: "current", Task_B: "incoming" },
        };

        expect(flowEndsNotes(result, resolution)).toEqual([]);
    });

    it("ignores a flow that is not in the result", () => {
        const result = mergeResult(
            mergeElement("Task_A", "unchanged", { layout: "takenFromCurrent" }),
            mergeElement("Task_B", "unchanged", { layout: "takenFromIncoming" }),
            mergeElement("Flow_AB", "removedByIncoming", {
                layout: "takenFromCurrent",
                references: FLOW_ENDS,
            }),
        );
        const resolution: MergeResolution = {
            elements: { Flow_AB: "incoming", Task_A: "current", Task_B: "incoming" },
            layout: { Task_A: "current", Task_B: "incoming" },
        };

        expect(flowEndsNotes(result, resolution)).toEqual([]);
    });
});

describe("addedAtSamePlaceNotes", () => {
    const boundsByElement: Record<string, DiagramBounds> = {
        Task_Current: { x: 100, y: 100, width: 100, height: 80 },
        Task_Overlapping: { x: 150, y: 150, width: 100, height: 80 },
        Task_Touching: { x: 200, y: 100, width: 100, height: 80 },
        Task_Far: { x: 600, y: 100, width: 100, height: 80 },
    };
    const boundsOf = (id: string) => boundsByElement[id];

    it("names elements each side added where they overlap", () => {
        const result = mergeResult(
            mergeElement("Task_Current", "addedByCurrent"),
            mergeElement("Task_Overlapping", "addedByIncoming"),
            mergeElement("Task_Touching", "addedByIncoming"),
            mergeElement("Task_Far", "addedByIncoming"),
        );
        const resolution: MergeResolution = {
            elements: {
                Task_Current: "current",
                Task_Overlapping: "incoming",
                Task_Touching: "incoming",
                Task_Far: "incoming",
            },
            layout: {},
        };

        expect(addedAtSamePlaceNotes(result, resolution, boundsOf)).toEqual([
            { kind: "addedAtSamePlace", ids: ["Task_Current", "Task_Overlapping"] },
        ]);
    });

    it("counts elements only one side has without a base", () => {
        const result = mergeResultWithoutBase(
            mergeElement("Task_Current", "onlyInCurrent"),
            mergeElement("Task_Overlapping", "onlyInIncoming"),
        );
        const resolution: MergeResolution = {
            elements: { Task_Current: "current", Task_Overlapping: "incoming" },
            layout: {},
        };

        expect(addedAtSamePlaceNotes(result, resolution, boundsOf)).toHaveLength(1);
    });

    it("ignores additions the result leaves out, the same addition and undrawn elements", () => {
        const result = mergeResult(
            mergeElement("Task_Current", "addedByCurrent"),
            mergeElement("Task_Overlapping", "addedByIncoming"),
            mergeElement("Task_Touching", "sameAddition"),
            mergeElement("Task_Undrawn", "addedByIncoming"),
        );
        const resolution: MergeResolution = {
            elements: {
                Task_Current: "current",
                Task_Overlapping: "current",
                Task_Touching: "current",
                Task_Undrawn: "incoming",
            },
            layout: {},
        };

        expect(addedAtSamePlaceNotes(result, resolution, boundsOf)).toEqual([]);
    });
});

describe("drawnApartFromContainerNotes", () => {
    const enclosing =
        (...containers: string[]) =>
        (id: string) =>
            containers.includes(id);

    function taskInContainers(layouts: { task: LayoutState; sub: LayoutState; lane: LayoutState }) {
        return mergeResult(
            mergeElement("Lane_A", "unchanged", { type: "bpmn:Lane", layout: layouts.lane }),
            mergeElement("Sub_1", "unchanged", { type: "bpmn:SubProcess", layout: layouts.sub }),
            mergeElement("Task_In", "unchanged", {
                parent: "Sub_1",
                lanes: ["Lane_A"],
                layout: layouts.task,
            }),
        );
    }

    it.each([
        {
            rule: "names an element drawn from another side than its sub-process and lane",
            layouts: { task: "takenFromCurrent", sub: "takenFromIncoming", lane: "bothChanged" },
            sides: { Task_In: "current", Sub_1: "incoming", Lane_A: "incoming" },
            expected: [
                { kind: "drawnApartFromContainer", id: "Task_In", containers: ["Sub_1", "Lane_A"] },
            ],
        },
        {
            rule: "names only the container drawn from the other side",
            layouts: { task: "bothChanged", sub: "takenFromIncoming", lane: "bothChanged" },
            sides: { Task_In: "current", Sub_1: "incoming", Lane_A: "current" },
            expected: [{ kind: "drawnApartFromContainer", id: "Task_In", containers: ["Sub_1"] }],
        },
        {
            rule: "ignores a container whose layout both sides share",
            layouts: { task: "takenFromCurrent", sub: "unchanged", lane: "unchanged" },
            sides: { Task_In: "current", Sub_1: "incoming", Lane_A: "incoming" },
            expected: [],
        },
        {
            rule: "ignores an element whose layout both sides share",
            layouts: { task: "unchanged", sub: "takenFromIncoming", lane: "takenFromIncoming" },
            sides: { Task_In: "current", Sub_1: "incoming", Lane_A: "incoming" },
            expected: [],
        },
        {
            rule: "ignores an element drawn from its containers' side",
            layouts: { task: "bothChanged", sub: "takenFromIncoming", lane: "takenFromIncoming" },
            sides: { Task_In: "incoming", Sub_1: "incoming", Lane_A: "incoming" },
            expected: [],
        },
    ] as const)("$rule", ({ layouts, sides, expected }) => {
        expect(
            drawnApartFromContainerNotes(
                taskInContainers(layouts),
                resolutionWithLayout(sides),
                enclosing("Sub_1", "Lane_A"),
            ),
        ).toEqual(expected);
    });

    it("reads the containers from the version the element is taken from", () => {
        const result = mergeResult(
            mergeElement("Sub_1", "unchanged", {
                type: "bpmn:SubProcess",
                layout: "takenFromIncoming",
            }),
            mergeElement("Task_In", "takenFromIncoming", {
                layout: "takenFromCurrent",
                incoming: { parent: "Sub_1" },
            }),
        );
        const resolution: MergeResolution = {
            elements: { Sub_1: "current", Task_In: "incoming" },
            layout: { Sub_1: "incoming", Task_In: "current" },
        };

        expect(drawnApartFromContainerNotes(result, resolution, enclosing("Sub_1"))).toEqual([
            { kind: "drawnApartFromContainer", id: "Task_In", containers: ["Sub_1"] },
        ]);
    });

    it("ignores a parent that does not enclose its contents, such as a process or an activity", () => {
        const result = mergeResult(
            mergeElement("Process_1", "unchanged", { type: "bpmn:Process", layout: "bothChanged" }),
            mergeElement("Task_A", "unchanged", { parent: "Process_1", layout: "bothChanged" }),
            mergeElement("Association_A", "unchanged", {
                type: "bpmn:DataInputAssociation",
                parent: "Task_A",
                layout: "takenFromIncoming",
            }),
        );

        expect(
            drawnApartFromContainerNotes(
                result,
                resolutionWithLayout({
                    Process_1: "current",
                    Task_A: "current",
                    Association_A: "incoming",
                }),
                enclosing(),
            ),
        ).toEqual([]);
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

        expect(restoredWithoutRemovedWithNotes(result, { elements, layout: {} })).toEqual([]);
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
                { elements: { Task_A: "current" }, layout: {} },
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

    it("leaves a flow whose ends each side moved one of to the note on its ends", () => {
        const result = mergeResult(
            mergeElement("Task_A", "unchanged", { layout: "takenFromCurrent" }),
            mergeElement("Task_B", "unchanged", { layout: "takenFromIncoming" }),
            moved("Flow_AB", { references: FLOW_ENDS }),
        );
        const sides = { Task_A: "current", Task_B: "incoming", Flow_AB: "current" } as const;

        expect(notesOf(result, sides)).toEqual([]);
        expect(flowEndsNotes(result, resolutionWithLayout(sides))).toEqual([
            { kind: "flowEndsFromDifferentSides", id: "Flow_AB", ends: ["Task_A", "Task_B"] },
        ]);
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
