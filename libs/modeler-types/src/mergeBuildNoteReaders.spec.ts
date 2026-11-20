import { describe, expect, expectTypeOf, it } from "vitest";

import {
    elementsNamedBy,
    framesGrownBy,
    isNonEmpty,
    noteVariantEntry,
    shapesShiftedBy,
} from "./mergeBuildNoteReaders";
import type { MergeBuildNoteContent, MergeNonEmptyIds } from "./mergeBuildNotes";

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
            repair: "madeRoomByGrowingAndShifting",
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
            repair: "movedByBuildAndShifted",
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

    it("names the shapes an overlap's repair shifted or the frames it grew, whichever it did", () => {
        const ids = ["Task_A", "Task_B"];

        expect(
            elementsNamedBy({
                kind: "shapesOverlap",
                ids,
                repair: "madeRoomByShifting",
                moved: "Task_B",
                shifted: ["Task_C"],
            }),
        ).toStrictEqual([...ids, "Task_C"]);
        expect(
            elementsNamedBy({
                kind: "shapesOverlap",
                ids,
                repair: "madeRoomByGrowing",
                moved: "Task_B",
                grown: ["Lane_1"],
            }),
        ).toStrictEqual([...ids, "Lane_1"]);
    });

    it("names the lanes and the frames grown for a lane the build moved without shifting shapes", () => {
        expect(
            elementsNamedBy({
                kind: "lanesOverlap",
                ids: ["Lane_2", "Lane_1"],
                repair: "movedByBuild",
                moved: "Lane_2",
                grown: ["Pool_1"],
            }),
        ).toStrictEqual(["Lane_2", "Lane_1", "Pool_1"]);
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

describe("noteVariantEntry", () => {
    const repairs = { movedByBuild: "moved", notRepaired: "left" };
    const table: Record<MergeBuildNoteContent["kind"], unknown> = {
        flowEndOffShape: repairs,
        flowThroughShape: repairs,
        shapeOutsideContainer: repairs,
        shapesOverlap: repairs,
        lanesOverlap: repairs,
        layoutChangedByBoth: "layout",
        boundaryEventOffHost: "boundary",
        restoredWithoutRemovedWith: "restored",
        defaultFlowNotRestored: "default",
        flowNotDrawn: "flow",
        frameDiffers: "frame",
    };

    it("picks a repaired note's entry by its kind and repair", () => {
        const note: MergeBuildNoteContent = {
            kind: "flowThroughShape",
            id: "Flow_1",
            shapes: ["Task_C"],
            repair: "notRepaired",
        };

        expect(noteVariantEntry<string>(table, note)).toBe("left");
    });

    it("picks any other note's entry by its kind alone", () => {
        const note: MergeBuildNoteContent = {
            kind: "boundaryEventOffHost",
            id: "Event_1",
            host: "Task_A",
        };

        expect(noteVariantEntry<string>(table, note)).toBe("boundary");
    });
});

describe("isNonEmpty", () => {
    it("tells a list that holds an id from an empty one", () => {
        expect(isNonEmpty(["Task_A"])).toBe(true);
        expect(isNonEmpty([])).toBe(false);
    });

    it("narrows a list to the ids a repair promises", () => {
        const ids: readonly string[] = ["Task_A"];
        if (isNonEmpty(ids)) expectTypeOf(ids).toEqualTypeOf<MergeNonEmptyIds>();
    });
});

describe("shapesShiftedBy", () => {
    it("gives the shapes a repair shifted, and none for one that shifted nothing", () => {
        expect(
            shapesShiftedBy({
                kind: "shapeOutsideContainer",
                id: "Task_A",
                shapes: ["Sub_1"],
                repair: "grewContainerAndShifted",
                shifted: ["Task_C"],
            }),
        ).toStrictEqual(["Task_C"]);
        expect(
            shapesShiftedBy({
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "madeRoomByGrowing",
                moved: "Task_B",
                grown: ["Lane_1"],
            }),
        ).toStrictEqual([]);
    });

    it("reads only the notes whose repair can shift shapes", () => {
        expectTypeOf<MergeBuildNoteContent>().not.toExtend<Parameters<typeof shapesShiftedBy>[0]>();
        expectTypeOf({
            kind: "flowEndOffShape",
            id: "Flow_1",
            shapes: ["Task_A"],
            repair: "movedByBuild",
        } as const).not.toExtend<Parameters<typeof shapesShiftedBy>[0]>();
    });
});

describe("framesGrownBy", () => {
    it("gives the frames an overlap's repair grew, and none for one that grew nothing", () => {
        expect(
            framesGrownBy({
                kind: "lanesOverlap",
                ids: ["Lane_2", "Lane_1"],
                repair: "movedByBuild",
                moved: "Lane_2",
                grown: ["Pool_1"],
            }),
        ).toStrictEqual(["Pool_1"]);
        expect(
            framesGrownBy({
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "madeRoomByShifting",
                moved: "Task_B",
                shifted: ["Task_C"],
            }),
        ).toStrictEqual([]);
    });

    it("does not read a container repair, whose grown containers are the note's shapes", () => {
        expectTypeOf({
            kind: "shapeOutsideContainer",
            id: "Task_A",
            shapes: ["Sub_1"],
            repair: "grewContainer",
        } as const).not.toExtend<Parameters<typeof framesGrownBy>[0]>();
    });
});
