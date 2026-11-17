import { describe, expect, it } from "vitest";

import { mergeStepPosition, mergeStepPositionText, nextMergeStep } from "./mergeStepper";

const ALL = ["Task_Check", "Task_Pack", "Gateway_Ok", "End_Done", "Process_1"];
const OPEN = ["Task_Pack", "End_Done", "Process_1"];

describe("nextMergeStep", () => {
    it.each<[string, readonly string[], string | undefined, 1 | -1, string | undefined]>([
        ["starts at the first step going forward", OPEN, undefined, 1, "Task_Pack"],
        ["starts at the last step going back", OPEN, undefined, -1, "Process_1"],
        ["moves to the next step", OPEN, "Task_Pack", 1, "End_Done"],
        ["moves to the previous step", OPEN, "End_Done", -1, "Task_Pack"],
        ["wraps after the last step", OPEN, "Process_1", 1, "Task_Pack"],
        ["wraps before the first step", OPEN, "Task_Pack", -1, "Process_1"],
        [
            "goes on from an element that left the list, after its place",
            OPEN,
            "Gateway_Ok",
            1,
            "End_Done",
        ],
        [
            "goes back from an element that left the list, before its place",
            OPEN,
            "Gateway_Ok",
            -1,
            "Task_Pack",
        ],
        ["wraps from an element after the last step", ["Task_Check"], "Process_1", 1, "Task_Check"],
        ["starts over from an element no list knows", OPEN, "Task_Gone", 1, "Task_Pack"],
        ["has nowhere to go in an empty list", [], "Task_Pack", 1, undefined],
    ])("%s", (_case, list, cursor, direction, expected) => {
        expect(nextMergeStep(list, ALL, cursor, direction)).toBe(expected);
    });
});

describe("mergeStepPosition", () => {
    it.each<
        [
            string,
            readonly string[],
            string | undefined,
            { index: number; total: number } | undefined,
        ]
    >([
        ["counts the step the cursor is on", OPEN, "End_Done", { index: 1, total: 3 }],
        ["shows none before the first step", OPEN, undefined, undefined],
        [
            "counts an element that left the list at its place among the steps",
            OPEN,
            "Gateway_Ok",
            { index: 1, total: 4 },
        ],
        [
            "counts an element before the first step as the first",
            OPEN,
            "Task_Check",
            { index: 0, total: 4 },
        ],
        [
            "counts an element after the last step as the last",
            ["Task_Check", "Task_Pack"],
            "Process_1",
            { index: 2, total: 3 },
        ],
        [
            "counts the only element left once the list is empty",
            [],
            "Task_Pack",
            { index: 0, total: 1 },
        ],
        ["shows none on an element no list knows", OPEN, "Task_Gone", undefined],
    ])("%s", (_case, list, cursor, expected) => {
        expect(mergeStepPosition(list, ALL, cursor)).toEqual(expected);
    });
});

describe("mergeStepPositionText", () => {
    it.each<[{ index: number; total: number } | undefined, number, string]>([
        [{ index: 1, total: 5 }, 5, "2/5"],
        [{ index: 2, total: 4 }, 3, "3/4"],
        [undefined, 5, "–/5"],
    ])("shows %o of %i as %s", (position, total, expected) => {
        expect(mergeStepPositionText(position, total)).toBe(expected);
    });
});
