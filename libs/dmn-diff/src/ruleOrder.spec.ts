import { describe, expect, it } from "vitest";

import { movedIds } from "./ruleOrder";

describe("movedIds", () => {
    it.each([
        { case: "the same order", before: ["a", "b", "c"], after: ["a", "b", "c"], moved: [] },
        {
            case: "one rule pulled to the top",
            before: ["a", "b", "c"],
            after: ["c", "a", "b"],
            moved: ["c"],
        },
        {
            case: "one rule pushed to the bottom",
            before: ["a", "b", "c"],
            after: ["b", "c", "a"],
            moved: ["a"],
        },
        {
            case: "two neighbours swapped",
            before: ["a", "b", "c", "d"],
            after: ["a", "c", "b", "d"],
            moved: ["c"],
        },
        {
            case: "a reversed order",
            before: ["a", "b", "c"],
            after: ["c", "b", "a"],
            moved: ["c", "b"],
        },
        {
            case: "ids only one side has",
            before: ["a", "x", "b"],
            after: ["b", "y", "a"],
            moved: ["b"],
        },
        { case: "no shared ids", before: ["a"], after: ["b"], moved: [] },
    ])("reports $moved for $case", ({ before, after, moved }) => {
        expect(movedIds(before, after)).toEqual(moved);
    });
});
