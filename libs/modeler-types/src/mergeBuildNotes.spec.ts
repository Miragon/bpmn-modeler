import { describe, expect, expectTypeOf, it } from "vitest";

import {
    type MergeBuildNote,
    type MergeBuildNoteContent,
    elementsNamedBy,
} from "./mergeBuildNotes";

type JsonValue =
    | string
    | number
    | boolean
    | null
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue | undefined };

describe("MergeBuildNote", () => {
    it("is plain data a protocol message can carry", () => {
        expectTypeOf<MergeBuildNote>().toExtend<JsonValue>();
    });
});

// A record, so the compiler names a note kind the merge adds and this spec misses.
const NAMED: Record<MergeBuildNoteContent["kind"], [MergeBuildNoteContent, readonly string[]]> = {
    flowEndOffShape: [
        {
            kind: "flowEndOffShape",
            id: "Flow_1",
            shapes: ["Task_A", "Task_B"],
            repair: "movedByBuild",
        },
        ["Flow_1", "Task_A", "Task_B"],
    ],
    shapesOverlap: [
        {
            kind: "shapesOverlap",
            ids: ["Task_A", "Task_B"],
            repair: "madeRoom",
            moved: "Task_B",
            shifted: ["Task_C", "End_1"],
            grown: ["Lane_1"],
        },
        ["Task_A", "Task_B", "Task_C", "End_1", "Lane_1"],
    ],
    flowThroughShape: [
        { kind: "flowThroughShape", id: "Flow_1", shapes: ["Task_C"], repair: "notRepaired" },
        ["Flow_1", "Task_C"],
    ],
    shapeOutsideContainer: [
        {
            kind: "shapeOutsideContainer",
            id: "Task_A",
            shapes: ["Sub_1"],
            repair: "grewContainerAndShifted",
            shifted: ["Task_C", "End_1"],
        },
        ["Task_A", "Sub_1", "Task_C", "End_1"],
    ],
    boundaryEventOffHost: [
        { kind: "boundaryEventOffHost", id: "Timer_1", host: "Task_A" },
        ["Timer_1", "Task_A"],
    ],
    lanesOverlap: [
        {
            kind: "lanesOverlap",
            ids: ["Lane_2", "Lane_1"],
            repair: "movedByBuild",
            moved: "Lane_2",
            grown: ["Pool_1", "Lane_0"],
            shifted: ["Pool_2"],
        },
        ["Lane_2", "Lane_1", "Pool_1", "Lane_0", "Pool_2"],
    ],
    restoredWithoutRemovedWith: [
        { kind: "restoredWithoutRemovedWith", id: "Task_A", connections: ["Flow_1", "Flow_2"] },
        ["Task_A", "Flow_1", "Flow_2"],
    ],
    defaultFlowNotRestored: [
        { kind: "defaultFlowNotRestored", id: "Gateway_1", flow: "Flow_1", keptDefault: "Flow_2" },
        ["Gateway_1", "Flow_1", "Flow_2"],
    ],
    layoutChangedByBoth: [
        { kind: "layoutChangedByBoth", ids: ["Task_A", "Gateway_1"], keptSide: "incoming" },
        ["Task_A", "Gateway_1"],
    ],
    frameDiffers: [{ kind: "frameDiffers", attribute: "exporter" }, []],
    flowNotDrawn: [
        { kind: "flowNotDrawn", id: "Flow_1", source: "Task_A", target: "Task_B" },
        ["Flow_1", "Task_A", "Task_B"],
    ],
};

describe("elementsNamedBy", () => {
    it.each(Object.entries(NAMED))(
        "names the elements a %s note shows, in the order its entry offers them",
        (_kind, [note, ids]) => {
            expect(elementsNamedBy(note)).toStrictEqual(ids);
        },
    );

    it("names the boundary events a kept element is noted without", () => {
        expect(
            elementsNamedBy({
                kind: "restoredWithoutRemovedWith",
                id: "Task_A",
                connections: ["Flow_1"],
                boundaryEvents: ["Timer_1"],
            }),
        ).toStrictEqual(["Task_A", "Timer_1", "Flow_1"]);
    });

    it("names only the two shapes of an overlap the build moved one of or left as is", () => {
        const ids = ["Task_A", "Task_B"];

        expect(
            elementsNamedBy({
                kind: "shapesOverlap",
                ids,
                repair: "movedByBuild",
                moved: "Task_B",
            }),
        ).toStrictEqual(ids);
        expect(
            elementsNamedBy({ kind: "shapesOverlap", ids, repair: "notRepaired" }),
        ).toStrictEqual(ids);
    });

    it("names only the shape and its containers when the build moved it inside, grew one or left it", () => {
        for (const repair of ["movedIntoContainer", "grewContainer", "notRepaired"] as const) {
            expect(
                elementsNamedBy({
                    kind: "shapeOutsideContainer",
                    id: "Task_A",
                    shapes: ["Pool_1", "Lane_1"],
                    repair,
                }),
            ).toStrictEqual(["Task_A", "Pool_1", "Lane_1"]);
        }
    });

    it("names only the lanes of an overlap the build left as is", () => {
        expect(
            elementsNamedBy({
                kind: "lanesOverlap",
                ids: ["Lane_1", "Lane_2"],
                repair: "notRepaired",
            }),
        ).toStrictEqual(["Lane_1", "Lane_2"]);
    });

    it("names only the end a flow left out of the drawing has", () => {
        expect(
            elementsNamedBy({ kind: "flowNotDrawn", id: "Flow_1", target: "Task_B" }),
        ).toStrictEqual(["Flow_1", "Task_B"]);
    });

    it("names no kept default for a source that keeps none", () => {
        expect(
            elementsNamedBy({ kind: "defaultFlowNotRestored", id: "Gateway_1", flow: "Flow_1" }),
        ).toStrictEqual(["Gateway_1", "Flow_1"]);
    });
});
