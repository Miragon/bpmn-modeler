import { describe, expect, it } from "vitest";

import { elementsNamedBy, elementsRedrawnBy } from "./mergeBuildNoteReaders";
import type {
    MergeBuildNoteContent,
    MergeBuildNoteOfKind,
    MergeNoteRepairOf,
    MergeRepairedNoteKind,
} from "./mergeBuildNotes";

type NoteKind = MergeBuildNoteContent["kind"];

type RedrawnCase<Note> = readonly [Note, readonly string[]];

/**
 * Every repair of every repaired note, with what it redraws, so the compiler names a kind or a
 * repair the merge adds and this spec misses.
 */
const REDRAWN: {
    [Kind in MergeRepairedNoteKind]: Record<
        MergeNoteRepairOf<MergeBuildNoteOfKind<Kind>>,
        RedrawnCase<MergeBuildNoteOfKind<Kind>>
    >;
} = {
    flowEndOffShape: {
        movedByBuild: [
            { kind: "flowEndOffShape", id: "Flow_1", shapes: ["Task_A"], repair: "movedByBuild" },
            ["Flow_1"],
        ],
        notRepaired: [
            { kind: "flowEndOffShape", id: "Flow_1", shapes: ["Task_A"], repair: "notRepaired" },
            [],
        ],
    },
    flowThroughShape: {
        movedByBuild: [
            { kind: "flowThroughShape", id: "Flow_1", shapes: ["Task_C"], repair: "movedByBuild" },
            ["Flow_1"],
        ],
        notRepaired: [
            { kind: "flowThroughShape", id: "Flow_1", shapes: ["Task_C"], repair: "notRepaired" },
            [],
        ],
    },
    shapesOverlap: {
        movedByBuild: [
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "movedByBuild",
                moved: "Task_B",
            },
            ["Task_B"],
        ],
        madeRoomByShifting: [
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "madeRoomByShifting",
                moved: "Task_B",
                shifted: ["Task_C", "End_1"],
            },
            ["Task_B", "Task_C", "End_1"],
        ],
        madeRoomByGrowing: [
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "madeRoomByGrowing",
                moved: "Task_B",
                grown: ["Lane_1"],
            },
            ["Task_B", "Lane_1"],
        ],
        madeRoomByGrowingAndShifting: [
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "madeRoomByGrowingAndShifting",
                moved: "Task_B",
                shifted: ["Task_C", "End_1"],
                grown: ["Lane_1"],
            },
            ["Task_B", "Task_C", "End_1", "Lane_1"],
        ],
        notRepaired: [
            { kind: "shapesOverlap", ids: ["Task_A", "Task_B"], repair: "notRepaired" },
            [],
        ],
    },
    shapeOutsideContainer: {
        movedIntoContainer: [
            {
                kind: "shapeOutsideContainer",
                id: "Task_A",
                shapes: ["Pool_1", "Lane_1"],
                repair: "movedIntoContainer",
            },
            ["Task_A"],
        ],
        grewContainer: [
            {
                kind: "shapeOutsideContainer",
                id: "Task_A",
                shapes: ["Sub_1"],
                repair: "grewContainer",
            },
            ["Task_A", "Sub_1"],
        ],
        grewContainerAndShifted: [
            {
                kind: "shapeOutsideContainer",
                id: "Task_A",
                shapes: ["Sub_1"],
                repair: "grewContainerAndShifted",
                shifted: ["Task_C", "End_1"],
            },
            ["Task_A", "Sub_1", "Task_C", "End_1"],
        ],
        notRepaired: [
            {
                kind: "shapeOutsideContainer",
                id: "Task_A",
                shapes: ["Sub_1"],
                repair: "notRepaired",
            },
            [],
        ],
    },
    lanesOverlap: {
        movedByBuild: [
            {
                kind: "lanesOverlap",
                ids: ["Lane_2", "Lane_1"],
                repair: "movedByBuild",
                moved: "Lane_2",
                grown: ["Pool_1", "Lane_0"],
            },
            ["Lane_2", "Pool_1", "Lane_0"],
        ],
        movedByBuildAndShifted: [
            {
                kind: "lanesOverlap",
                ids: ["Lane_2", "Lane_1"],
                repair: "movedByBuildAndShifted",
                moved: "Lane_2",
                grown: ["Pool_1", "Lane_0"],
                shifted: ["Pool_2"],
            },
            ["Lane_2", "Pool_1", "Lane_0", "Pool_2"],
        ],
        notRepaired: [
            { kind: "lanesOverlap", ids: ["Lane_1", "Lane_2"], repair: "notRepaired" },
            [],
        ],
    },
};

/** Every note no repair writes, so the compiler names a kind the merge adds and this spec misses. */
const UNREPAIRED: {
    [Kind in Exclude<NoteKind, MergeRepairedNoteKind>]: MergeBuildNoteOfKind<Kind>;
} = {
    boundaryEventOffHost: { kind: "boundaryEventOffHost", id: "Timer_1", host: "Task_A" },
    restoredWithoutRemovedWith: {
        kind: "restoredWithoutRemovedWith",
        id: "Task_A",
        connections: ["Flow_1"],
        boundaryEvents: ["Timer_1"],
    },
    defaultFlowNotRestored: {
        kind: "defaultFlowNotRestored",
        id: "Gateway_1",
        flow: "Flow_1",
        keptDefault: "Flow_2",
    },
    layoutChangedByBoth: { kind: "layoutChangedByBoth", ids: ["Task_A"], keptSide: "incoming" },
    frameDiffers: { kind: "frameDiffers", attribute: "exporter" },
    flowNotDrawn: { kind: "flowNotDrawn", id: "Flow_1", source: "Task_A", target: "Task_B" },
};

const REDRAWN_CASES = Object.entries<Record<string, RedrawnCase<MergeBuildNoteContent>>>(
    REDRAWN,
).flatMap(([kind, byRepair]) =>
    Object.entries(byRepair).map(
        ([repair, [note, ids]]) => [`${kind} ${repair}`, note, ids] as const,
    ),
);

describe("elementsRedrawnBy", () => {
    it.each(REDRAWN_CASES)("names what the build redrew for a %s note", (_case, note, ids) => {
        expect(elementsRedrawnBy(note)).toStrictEqual(ids);
    });

    it.each(REDRAWN_CASES)("names only elements a %s note names", (_case, note) => {
        const named = new Set(elementsNamedBy(note));

        expect(elementsRedrawnBy(note).filter((id) => !named.has(id))).toStrictEqual([]);
    });

    it.each(Object.entries(UNREPAIRED))(
        "names nothing for a %s note, which no repair writes",
        (_kind, note) => {
            expect(elementsRedrawnBy(note)).toStrictEqual([]);
        },
    );
});
