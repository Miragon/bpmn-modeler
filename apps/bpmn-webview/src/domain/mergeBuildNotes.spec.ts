import { describe, expect, it } from "vitest";

import type { MergePaneBuildNote } from "@miragon/bpmn-modeler-shared";

import { buildNoteElementIds } from "./mergeBuildNotes";

// A record, so the compiler names a note kind the merge adds and this spec misses.
const CASES: Record<MergePaneBuildNote["kind"], [MergePaneBuildNote, readonly string[]]> = {
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
        },
        ["Task_A", "Task_B", "Task_C", "End_1"],
    ],
    flowThroughShape: [
        { kind: "flowThroughShape", id: "Flow_1", shapes: ["Task_C"], repair: "notRepaired" },
        ["Flow_1", "Task_C"],
    ],
    shapeOutsideContainer: [
        { kind: "shapeOutsideContainer", id: "Task_A", shapes: ["Sub_1", "Lane_1"] },
        ["Task_A", "Sub_1", "Lane_1"],
    ],
    boundaryEventOffHost: [
        { kind: "boundaryEventOffHost", id: "Timer_1", host: "Task_A" },
        ["Timer_1", "Task_A"],
    ],
    lanesOverlap: [{ kind: "lanesOverlap", ids: ["Lane_1", "Lane_2"] }, ["Lane_1", "Lane_2"]],
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

describe("buildNoteElementIds", () => {
    it.each(Object.entries(CASES))("names the elements a %s note shows", (_kind, [note, ids]) => {
        expect(buildNoteElementIds(note)).toStrictEqual(ids);
    });

    it("names the boundary events a kept element is noted without", () => {
        expect(
            buildNoteElementIds({
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
            buildNoteElementIds({
                kind: "shapesOverlap",
                ids,
                repair: "movedByBuild",
                moved: "Task_B",
            }),
        ).toStrictEqual(ids);
        expect(
            buildNoteElementIds({ kind: "shapesOverlap", ids, repair: "notRepaired" }),
        ).toStrictEqual(ids);
    });

    it("names only the end a flow left out of the drawing has", () => {
        expect(
            buildNoteElementIds({ kind: "flowNotDrawn", id: "Flow_1", target: "Task_B" }),
        ).toStrictEqual(["Flow_1", "Task_B"]);
    });

    it("names no kept default for a source that keeps none", () => {
        expect(
            buildNoteElementIds({
                kind: "defaultFlowNotRestored",
                id: "Gateway_1",
                flow: "Flow_1",
            }),
        ).toStrictEqual(["Gateway_1", "Flow_1"]);
    });
});
