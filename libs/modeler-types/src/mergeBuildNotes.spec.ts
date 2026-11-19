import { describe, expect, it } from "vitest";

import mergeBuildNotesSource from "./mergeBuildNotes.ts?raw";

import type { MergeBuildNote } from "./mergeBuildNotes";

describe("MergeBuildNote", () => {
    it("is plain data a protocol message can carry", () => {
        const notes: readonly MergeBuildNote[] = [
            {
                kind: "shapesOverlap",
                ids: ["Task_A", "Task_B"],
                repair: "madeRoom",
                moved: "Task_B",
                shifted: ["Task_C"],
                grown: ["Lane_1"],
            },
            { kind: "flowNotDrawn", id: "Flow_1", source: "Task_A" },
        ];

        expect(JSON.parse(JSON.stringify(notes))).toEqual(notes);
    });
});

describe("mergeBuildNotes.ts", () => {
    it("imports nothing at runtime, so a DOM-free workspace can load it alone", () => {
        const runtimeImport = /^(?:import|export)\s(?!type\s)(?:[^;]*from\s+)?["']/m;

        expect(mergeBuildNotesSource).not.toMatch(runtimeImport);
    });
});
