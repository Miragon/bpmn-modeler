import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult, refersTo } from "./__fixtures__/mergeResultBuilder";
import { addedAtSamePlaceNotes, drawnApartFromContainerNotes, flowEndsNotes } from "./buildNotes";
import type { DiagramBounds } from "./diagramIndex";
import type { MergeResolution } from "./mergeDecisions";
import type { LayoutState, MergeSide } from "./mergeResult";

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
        const result = {
            hasBase: false,
            elements: [
                mergeElement("Task_Current", "onlyInCurrent"),
                mergeElement("Task_Overlapping", "onlyInIncoming"),
            ],
        };
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
