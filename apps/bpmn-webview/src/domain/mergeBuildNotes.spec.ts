import { describe, expect, it } from "vitest";

import type { MergePaneBuildNote } from "@miragon/bpmn-modeler-shared";

import { buildNoteElementIds } from "./mergeBuildNotes";

// A record, so the compiler names a note kind the merge adds and this spec misses.
const CASES: Record<MergePaneBuildNote["kind"], [MergePaneBuildNote, readonly string[]]> = {
    flowEndsFromDifferentSides: [
        { kind: "flowEndsFromDifferentSides", id: "Flow_1", ends: ["Task_A", "Task_B"] },
        ["Flow_1", "Task_A", "Task_B"],
    ],
    addedAtSamePlace: [
        { kind: "addedAtSamePlace", ids: ["Task_A", "Task_B"] },
        ["Task_A", "Task_B"],
    ],
    drawnApartFromContainer: [
        { kind: "drawnApartFromContainer", id: "Task_A", containers: ["Sub_1"] },
        ["Task_A", "Sub_1"],
    ],
    restoredWithoutConnections: [
        { kind: "restoredWithoutConnections", id: "Task_A", connections: ["Flow_1", "Flow_2"] },
        ["Task_A", "Flow_1", "Flow_2"],
    ],
    layoutChangedByBoth: [
        { kind: "layoutChangedByBoth", ids: ["Task_A", "Gateway_1"], keptSide: "incoming" },
        ["Task_A", "Gateway_1"],
    ],
    frameDiffers: [{ kind: "frameDiffers", attribute: "exporter" }, []],
};

describe("buildNoteElementIds", () => {
    it.each(Object.entries(CASES))("names the elements a %s note shows", (_kind, [note, ids]) => {
        expect(buildNoteElementIds(note)).toStrictEqual(ids);
    });
});
