import { describe, expect, it } from "vitest";

import type { FlowRepair } from "./layoutFlowRepair";
import type { OverlapRepair } from "./layoutShapeMoves";
import { layoutSpotNotes } from "./layoutSpotNotes";
import type { LayoutSpot } from "./layoutSpots";

const NOT_REPAIRED: FlowRepair[] = [
    { kind: "notRepaired", flow: "Flow_1" },
    { kind: "notRepaired", flow: "Flow_2" },
    { kind: "notRepaired", flow: "Flow_Loop" },
];

describe("layoutSpotNotes", () => {
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
        ).toEqual([{ kind: "shapeOutsideContainer", id: "Task_A", shapes: ["Pool_1", "Lane_A"] }]);
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
            { kind: "lanesOverlap", ids: ["Lane_A", "Lane_B"] },
        ]);
    });

    it("says which shape the build moved off another and what it shifted to make room", () => {
        const spots: LayoutSpot[] = [
            { kind: "shapesOverlap", shapes: ["Task_A", "Task_B"] },
            { kind: "shapesOverlap", shapes: ["Task_C", "Task_D"] },
            { kind: "shapesOverlap", shapes: ["Task_E", "Task_F"] },
        ];
        const overlapRepairs: OverlapRepair[] = [
            { kind: "movedByBuild", shapes: ["Task_A", "Task_B"], moved: "Task_B" },
            {
                kind: "madeRoom",
                shapes: ["Task_C", "Task_D"],
                moved: "Task_C",
                shifted: ["Task_G", "Task_H"],
            },
            { kind: "notRepaired", shapes: ["Task_E", "Task_F"] },
        ];

        expect(notesOf(spots, [], overlapRepairs)).toEqual([
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
            },
            { kind: "shapesOverlap", ids: ["Task_E", "Task_F"], repair: "notRepaired" },
        ]);
    });

    it("names the flows a shape move broke as the flow repair left them, and drops those it mended", () => {
        const overlap: LayoutSpot = { kind: "shapesOverlap", shapes: ["Task_A", "Task_B"] };
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

        const notes = layoutSpotNotes({
            spots: [overlap, throughMoved],
            flowSpotsAfterMoves: [offMoved("Flow_In"), offMoved("Flow_Stuck")],
            overlapRepairs: [
                { kind: "movedByBuild", shapes: ["Task_A", "Task_B"], moved: "Task_B" },
            ],
            flowRepairs: [
                { kind: "movedByBuild", flow: "Flow_In", waypoints: [] },
                { kind: "notRepaired", flow: "Flow_Stuck" },
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
});

/** The notes of spots no shape move changed. */
function notesOf(
    spots: readonly LayoutSpot[],
    flowRepairs: readonly FlowRepair[],
    overlapRepairs: readonly OverlapRepair[] = [],
) {
    return layoutSpotNotes({ spots, flowSpotsAfterMoves: spots, overlapRepairs, flowRepairs });
}
