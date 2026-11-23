import { describe, expectTypeOf, it } from "vitest";

import type { MergeBuildNote, MergeBuildNoteContent } from "./mergeBuildNotes";

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

describe("a repair named for what it shifted or grew", () => {
    it("carries at least one shape it shifted", () => {
        expectTypeOf({
            kind: "shapesOverlap",
            ids: ["Task_A", "Task_B"],
            repair: "madeRoomByShifting",
            moved: "Task_B",
            shifted: [],
        } as const).not.toExtend<MergeBuildNoteContent>();
        expectTypeOf({
            kind: "shapeOutsideContainer",
            id: "Task_A",
            shapes: ["Sub_1"],
            repair: "grewContainerAndShifted",
            shifted: [],
        } as const).not.toExtend<MergeBuildNoteContent>();
        expectTypeOf({
            kind: "lanesOverlap",
            ids: ["Lane_2", "Lane_1"],
            repair: "movedByBuildAndShifted",
            moved: "Lane_2",
            grown: ["Pool_1"],
            shifted: [],
        } as const).not.toExtend<MergeBuildNoteContent>();
    });

    it("carries at least one frame it grew", () => {
        expectTypeOf({
            kind: "shapesOverlap",
            ids: ["Task_A", "Task_B"],
            repair: "madeRoomByGrowing",
            moved: "Task_B",
            grown: [],
        } as const).not.toExtend<MergeBuildNoteContent>();
        expectTypeOf({
            kind: "shapesOverlap",
            ids: ["Task_A", "Task_B"],
            repair: "madeRoomByGrowingAndShifting",
            moved: "Task_B",
            shifted: ["Task_C"],
            grown: [],
        } as const).not.toExtend<MergeBuildNoteContent>();
        expectTypeOf({
            kind: "lanesOverlap",
            ids: ["Lane_2", "Lane_1"],
            repair: "movedByBuild",
            moved: "Lane_2",
            grown: [],
        } as const).not.toExtend<MergeBuildNoteContent>();
    });

    it("is a note when it names what it shifted and grew", () => {
        expectTypeOf({
            kind: "shapesOverlap",
            ids: ["Task_A", "Task_B"],
            repair: "madeRoomByGrowingAndShifting",
            moved: "Task_B",
            shifted: ["Task_C"],
            grown: ["Lane_1"],
        } as const).toExtend<MergeBuildNoteContent>();
    });
});
