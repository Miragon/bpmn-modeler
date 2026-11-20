import { describe, expect, expectTypeOf, it } from "vitest";

import type {
    MergeBrokenFlowKind,
    MergeFlowRepair,
} from "@miragon/bpmn-modeler-types/mergeBuildNotes";

import type { FlowRepair } from "./layoutFlowRepair";
import { layoutSpotNotes } from "./layoutSpotNotes";
import { type SpotRepair, flowSpotRepairs } from "./layoutSpotRepairs";
import type { FlowSpot, LayoutSpot } from "./layoutSpots";

const NOT_REPAIRED: FlowRepair[] = [
    { kind: "notRepaired", flow: "Flow_1" },
    { kind: "notRepaired", flow: "Flow_2" },
    { kind: "notRepaired", flow: "Flow_Loop" },
];

const NO_LANES_STACKED = { laneStackings: [] } as const;

const overlapOf = (first: string, second: string) =>
    ({ kind: "shapesOverlap", shapes: [first, second] }) as const;

const outsideOf = (shape: string, container: string) =>
    ({ kind: "shapeOutsideContainer", shape, container }) as const;

describe("layoutSpotNotes", () => {
    it("names the broken flows and their repairs as the notes do", () => {
        expectTypeOf<FlowSpot["kind"]>().toEqualTypeOf<MergeBrokenFlowKind>();
        expectTypeOf<FlowRepair["kind"]>().toEqualTypeOf<MergeFlowRepair>();
    });

    it("gives one note per flow for its ends and for the shapes it runs through", () => {
        expect(
            notesOf(
                [
                    {
                        kind: "flowEndOffShape",
                        flow: "Flow_1",
                        end: "Task_A",
                        at: "source",
                        lies: "outside",
                    },
                    {
                        kind: "flowEndOffShape",
                        flow: "Flow_1",
                        end: "Task_B",
                        at: "target",
                        lies: "outside",
                    },
                    { kind: "flowThroughShape", flow: "Flow_1", shape: "Task_C" },
                    { kind: "flowThroughShape", flow: "Flow_2", shape: "Task_C" },
                    { kind: "flowThroughShape", flow: "Flow_1", shape: "Task_D" },
                ],
                NOT_REPAIRED,
            ),
        ).toEqual([
            {
                kind: "flowEndOffShape",
                id: "Flow_1",
                shapes: ["Task_A", "Task_B"],
                repair: "notRepaired",
            },
            {
                kind: "flowThroughShape",
                id: "Flow_1",
                shapes: ["Task_C", "Task_D"],
                repair: "notRepaired",
            },
            {
                kind: "flowThroughShape",
                id: "Flow_2",
                shapes: ["Task_C"],
                repair: "notRepaired",
            },
        ]);
    });

    it("names a flow's end once when both its ends lie on one shape", () => {
        expect(
            notesOf(
                [
                    {
                        kind: "flowEndOffShape",
                        flow: "Flow_Loop",
                        end: "Task_A",
                        at: "source",
                        lies: "outside",
                    },
                    {
                        kind: "flowEndOffShape",
                        flow: "Flow_Loop",
                        end: "Task_A",
                        at: "target",
                        lies: "outside",
                    },
                ],
                NOT_REPAIRED,
            ),
        ).toEqual([
            {
                kind: "flowEndOffShape",
                id: "Flow_Loop",
                shapes: ["Task_A"],
                repair: "notRepaired",
            },
        ]);
    });

    it("says the build moved a flow it re-routed, and keeps naming one it could not", () => {
        const spots: LayoutSpot[] = [
            {
                kind: "flowEndOffShape",
                flow: "Flow_1",
                end: "Task_A",
                at: "target",
                lies: "inside",
            },
            { kind: "flowThroughShape", flow: "Flow_1", shape: "Task_C" },
            { kind: "flowThroughShape", flow: "Flow_2", shape: "Task_C" },
        ];

        expect(
            notesOf(spots, [
                { kind: "movedByBuild", flow: "Flow_1", waypoints: [] },
                { kind: "notRepaired", flow: "Flow_2" },
            ]),
        ).toEqual([
            { kind: "flowEndOffShape", id: "Flow_1", shapes: ["Task_A"], repair: "movedByBuild" },
            { kind: "flowThroughShape", id: "Flow_1", shapes: ["Task_C"], repair: "movedByBuild" },
            { kind: "flowThroughShape", id: "Flow_2", shapes: ["Task_C"], repair: "notRepaired" },
        ]);
    });

    it("gives one note per shape for the containers it lies outside", () => {
        expect(
            notesOf(
                [
                    { kind: "shapeOutsideContainer", shape: "Task_A", container: "Pool_1" },
                    { kind: "shapeOutsideContainer", shape: "Task_A", container: "Lane_A" },
                ],
                [],
            ),
        ).toEqual([
            {
                kind: "shapeOutsideContainer",
                id: "Task_A",
                shapes: ["Pool_1", "Lane_A"],
                repair: "notRepaired",
            },
        ]);
    });

    it("says the build moved a shape into its containers or grew one to hold it, and keeps naming one it could not", () => {
        const stuck = outsideOf("Task_C", "Lane_2");
        const repairs: SpotRepair[] = [
            { spot: outsideOf("Task_A", "Pool_1"), repair: { kind: "movedIntoContainer" } },
            { spot: outsideOf("Task_A", "Lane_1"), repair: { kind: "movedIntoContainer" } },
            {
                spot: outsideOf("Task_B", "Sub_1"),
                repair: { kind: "grewContainerAndShifted", shifted: ["Task_X"] },
            },
            { spot: stuck, repair: { kind: "notRepaired" } },
        ];

        const notes = layoutSpotNotes({
            laneStackings: [],
            spots: [
                outsideOf("Task_A", "Pool_1"),
                outsideOf("Task_A", "Lane_1"),
                outsideOf("Task_B", "Sub_1"),
                stuck,
            ],
            spotsAfterMoves: [stuck],
            repairs,
        });

        expect(notes).toEqual([
            {
                kind: "shapeOutsideContainer",
                id: "Task_A",
                shapes: ["Pool_1", "Lane_1"],
                repair: "movedIntoContainer",
            },
            {
                kind: "shapeOutsideContainer",
                id: "Task_B",
                shapes: ["Sub_1"],
                repair: "grewContainerAndShifted",
                shifted: ["Task_X"],
            },
            {
                kind: "shapeOutsideContainer",
                id: "Task_C",
                shapes: ["Lane_2"],
                repair: "notRepaired",
            },
        ]);
    });

    it("says the build moved a shape off another when bringing it into its container did", () => {
        const notes = layoutSpotNotes({
            laneStackings: [],
            spots: [
                { kind: "shapesOverlap", shapes: ["Task_A", "Task_B"] },
                { kind: "shapeOutsideContainer", shape: "Task_B", container: "Sub_1" },
            ],
            spotsAfterMoves: [],
            repairs: [
                { spot: outsideOf("Task_B", "Sub_1"), repair: { kind: "movedIntoContainer" } },
                {
                    spot: overlapOf("Task_A", "Task_B"),
                    repair: { kind: "movedByBuild", moved: "Task_B" },
                },
            ],
        });

        expect(notes).toEqual([
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "movedByBuild",
                moved: "Task_B",
            },
            {
                kind: "shapeOutsideContainer",
                id: "Task_B",
                shapes: ["Sub_1"],
                repair: "movedIntoContainer",
            },
        ]);
    });

    it("gives one note per overlap, boundary event and pair of lanes", () => {
        expect(
            notesOf(
                [
                    { kind: "shapesOverlap", shapes: ["Task_A", "Task_B"] },
                    { kind: "shapesOverlap", shapes: ["Task_A", "Task_C"] },
                    { kind: "boundaryEventOffHost", boundaryEvent: "Boundary_1", host: "Task_A" },
                    { kind: "lanesOverlap", lanes: ["Lane_A", "Lane_B"] },
                ],
                [],
            ),
        ).toEqual([
            { kind: "shapesOverlap", ids: ["Task_A", "Task_B"], repair: "notRepaired" },
            { kind: "shapesOverlap", ids: ["Task_A", "Task_C"], repair: "notRepaired" },
            { kind: "boundaryEventOffHost", id: "Boundary_1", host: "Task_A" },
            { kind: "lanesOverlap", ids: ["Lane_A", "Lane_B"], repair: "notRepaired" },
        ]);
    });

    it("says which shape the build moved off another, what it shifted and which frames it grew to make room", () => {
        const spots: LayoutSpot[] = [
            { kind: "shapesOverlap", shapes: ["Task_A", "Task_B"] },
            { kind: "shapesOverlap", shapes: ["Task_C", "Task_D"] },
            { kind: "shapesOverlap", shapes: ["Task_E", "Task_F"] },
        ];
        const repairs: SpotRepair[] = [
            {
                spot: overlapOf("Task_A", "Task_B"),
                repair: { kind: "movedByBuild", moved: "Task_B" },
            },
            {
                spot: overlapOf("Task_C", "Task_D"),
                repair: {
                    kind: "madeRoom",
                    moved: "Task_C",
                    shifted: ["Task_G", "Task_H"],
                    grown: ["Lane_A"],
                },
            },
            { spot: overlapOf("Task_E", "Task_F"), repair: { kind: "notRepaired" } },
        ];

        expect(notesOf(spots, [], repairs)).toEqual([
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "movedByBuild",
                moved: "Task_B",
            },
            {
                kind: "shapesOverlap",
                ids: ["Task_C", "Task_D"],
                repair: "madeRoom",
                moved: "Task_C",
                shifted: ["Task_G", "Task_H"],
                grown: ["Lane_A"],
            },
            { kind: "shapesOverlap", ids: ["Task_E", "Task_F"], repair: "notRepaired" },
        ]);
    });

    it("names the flows a shape move broke as the flow repair left them, and drops those it mended", () => {
        const overlap = { kind: "shapesOverlap", shapes: ["Task_A", "Task_B"] } as const;
        const throughMoved: LayoutSpot = {
            kind: "flowThroughShape",
            flow: "Flow_Through",
            shape: "Task_B",
        };
        const offMoved = (flow: string): LayoutSpot => ({
            kind: "flowEndOffShape",
            flow,
            end: "Task_B",
            at: "target",
            lies: "outside",
        });

        const spotsAfterMoves = [offMoved("Flow_In"), offMoved("Flow_Stuck")];

        const notes = layoutSpotNotes({
            spots: [overlap, throughMoved],
            spotsAfterMoves,
            ...NO_LANES_STACKED,
            repairs: [
                { spot: overlap, repair: { kind: "movedByBuild", moved: "Task_B" } },
                ...flowSpotRepairs(spotsAfterMoves, [
                    { kind: "movedByBuild", flow: "Flow_In", waypoints: [] },
                    { kind: "notRepaired", flow: "Flow_Stuck" },
                ]),
            ],
        });

        expect(notes).toEqual([
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "movedByBuild",
                moved: "Task_B",
            },
            { kind: "flowEndOffShape", id: "Flow_In", shapes: ["Task_B"], repair: "movedByBuild" },
            {
                kind: "flowEndOffShape",
                id: "Flow_Stuck",
                shapes: ["Task_B"],
                repair: "notRepaired",
            },
        ]);
    });

    it("names a flow still broken after the moves by the spot read before them, with the flow's repair", () => {
        const offBefore: LayoutSpot = {
            kind: "flowEndOffShape",
            flow: "Flow_1",
            end: "Task_B",
            at: "target",
            lies: "outside",
        };
        const throughAfter: LayoutSpot = {
            kind: "flowThroughShape",
            flow: "Flow_1",
            shape: "Task_A",
        };

        const notes = layoutSpotNotes({
            spots: [overlapOf("Task_A", "Task_B"), offBefore],
            spotsAfterMoves: [throughAfter],
            ...NO_LANES_STACKED,
            repairs: [
                {
                    spot: overlapOf("Task_A", "Task_B"),
                    repair: { kind: "movedByBuild", moved: "Task_A" },
                },
                ...flowSpotRepairs(
                    [throughAfter],
                    [{ kind: "movedByBuild", flow: "Flow_1", waypoints: [] }],
                ),
            ],
        });

        expect(notes).toEqual([
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "movedByBuild",
                moved: "Task_A",
            },
            { kind: "flowEndOffShape", id: "Flow_1", shapes: ["Task_B"], repair: "movedByBuild" },
            { kind: "flowThroughShape", id: "Flow_1", shapes: ["Task_A"], repair: "movedByBuild" },
        ]);
    });

    it("drops a shape outside its container that a move put back inside, and keeps the shape spots still there", () => {
        const overlap = { kind: "shapesOverlap", shapes: ["Task_T", "Task_X"] } as const;
        const outsideLane: LayoutSpot = {
            kind: "shapeOutsideContainer",
            shape: "Task_T",
            container: "Lane_L",
        };
        const offHost: LayoutSpot = { kind: "boundaryEventOffHost", boundaryEvent: "B", host: "H" };

        const notes = layoutSpotNotes({
            spots: [overlap, outsideLane, offHost],
            ...NO_LANES_STACKED,
            spotsAfterMoves: [{ kind: "boundaryEventOffHost", host: "H", boundaryEvent: "B" }],
            repairs: [{ spot: overlap, repair: { kind: "movedByBuild", moved: "Task_T" } }],
        });

        expect(notes).toEqual([
            {
                kind: "shapesOverlap",
                ids: ["Task_T", "Task_X"],
                repair: "movedByBuild",
                moved: "Task_T",
            },
            { kind: "boundaryEventOffHost", id: "B", host: "H" },
        ]);
    });

    it("drops an overlap that is gone after the moves when no step mended it", () => {
        const overlap = overlapOf("Task_A", "Task_B");

        const notes = layoutSpotNotes({
            ...NO_LANES_STACKED,
            spots: [overlap],
            spotsAfterMoves: [],
            repairs: [{ spot: overlap, repair: { kind: "notRepaired" } }],
        });

        expect(notes).toEqual([]);
    });

    it("names an overlap a move made as not repaired, though a container repair moved one of its shapes before", () => {
        const notes = layoutSpotNotes({
            ...NO_LANES_STACKED,
            spots: [outsideOf("Task_B", "Sub_1")],
            spotsAfterMoves: [overlapOf("Task_A", "Task_B")],
            repairs: [
                { spot: outsideOf("Task_B", "Sub_1"), repair: { kind: "movedIntoContainer" } },
            ],
        });

        expect(notes).toEqual([
            {
                kind: "shapeOutsideContainer",
                id: "Task_B",
                shapes: ["Sub_1"],
                repair: "movedIntoContainer",
            },
            { kind: "shapesOverlap", ids: ["Task_A", "Task_B"], repair: "notRepaired" },
        ]);
    });

    it("names a shape a move carried out of its lane, as its host went into its own", () => {
        const notes = layoutSpotNotes({
            ...NO_LANES_STACKED,
            spots: [outsideOf("Task_A", "Lane_A")],
            spotsAfterMoves: [outsideOf("Boundary_1", "Lane_B")],
            repairs: [
                { spot: outsideOf("Task_A", "Lane_A"), repair: { kind: "movedIntoContainer" } },
            ],
        });

        expect(notes).toEqual([
            {
                kind: "shapeOutsideContainer",
                id: "Task_A",
                shapes: ["Lane_A"],
                repair: "movedIntoContainer",
            },
            {
                kind: "shapeOutsideContainer",
                id: "Boundary_1",
                shapes: ["Lane_B"],
                repair: "notRepaired",
            },
        ]);
    });

    it("says the build moved a lane below its pool's lanes, grew the pool and shifted what lay below, before the spots it left", () => {
        const notes = layoutSpotNotes({
            laneStackings: [
                {
                    lane: "Lane_C",
                    grown: ["Pool_1"],
                    overlapped: ["Lane_A", "Lane_B"],
                    shifted: ["Pool_2"],
                },
            ],
            spots: [{ kind: "lanesOverlap", lanes: ["Lane_D", "Lane_E"] }],
            spotsAfterMoves: [{ kind: "lanesOverlap", lanes: ["Lane_D", "Lane_E"] }],
            repairs: [],
        });

        expect(notes).toEqual([
            {
                kind: "lanesOverlap",
                ids: ["Lane_C", "Lane_A", "Lane_B"],
                repair: "movedByBuild",
                moved: "Lane_C",
                grown: ["Pool_1"],
                shifted: ["Pool_2"],
            },
            { kind: "lanesOverlap", ids: ["Lane_D", "Lane_E"], repair: "notRepaired" },
        ]);
    });
});

/** The notes of spots no shape move changed. */
function notesOf(
    spots: readonly LayoutSpot[],
    flowRepairs: readonly FlowRepair[],
    shapeRepairs: readonly SpotRepair[] = [],
) {
    return layoutSpotNotes({
        spots,
        spotsAfterMoves: spots,
        ...NO_LANES_STACKED,
        repairs: [...shapeRepairs, ...flowSpotRepairs(spots, flowRepairs)],
    });
}
