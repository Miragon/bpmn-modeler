import { describe, expect, it } from "vitest";

import { layoutSpotNotes } from "./layoutSpotNotes";

describe("layoutSpotNotes", () => {
    it("gives one note per flow for its ends and for the shapes it runs through", () => {
        expect(
            layoutSpotNotes([
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
            ]),
        ).toEqual([
            { kind: "flowEndOffShape", id: "Flow_1", shapes: ["Task_A", "Task_B"] },
            { kind: "flowThroughShape", id: "Flow_1", shapes: ["Task_C", "Task_D"] },
            { kind: "flowThroughShape", id: "Flow_2", shapes: ["Task_C"] },
        ]);
    });

    it("names a flow's end once when both its ends lie on one shape", () => {
        expect(
            layoutSpotNotes([
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
            ]),
        ).toEqual([{ kind: "flowEndOffShape", id: "Flow_Loop", shapes: ["Task_A"] }]);
    });

    it("gives one note per shape for the containers it lies outside", () => {
        expect(
            layoutSpotNotes([
                { kind: "shapeOutsideContainer", shape: "Task_A", container: "Pool_1" },
                { kind: "shapeOutsideContainer", shape: "Task_A", container: "Lane_A" },
            ]),
        ).toEqual([{ kind: "shapeOutsideContainer", id: "Task_A", shapes: ["Pool_1", "Lane_A"] }]);
    });

    it("gives one note per overlap, boundary event and pair of lanes", () => {
        expect(
            layoutSpotNotes([
                { kind: "shapesOverlap", shapes: ["Task_A", "Task_B"] },
                { kind: "shapesOverlap", shapes: ["Task_A", "Task_C"] },
                { kind: "boundaryEventOffHost", boundaryEvent: "Boundary_1", host: "Task_A" },
                { kind: "lanesOverlap", lanes: ["Lane_A", "Lane_B"] },
            ]),
        ).toEqual([
            { kind: "shapesOverlap", ids: ["Task_A", "Task_B"] },
            { kind: "shapesOverlap", ids: ["Task_A", "Task_C"] },
            { kind: "boundaryEventOffHost", id: "Boundary_1", host: "Task_A" },
            { kind: "lanesOverlap", ids: ["Lane_A", "Lane_B"] },
        ]);
    });
});
