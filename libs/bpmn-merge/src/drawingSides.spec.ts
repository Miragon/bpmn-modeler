import { describe, expect, it } from "vitest";

import { DrawingSides } from "./drawingSides";
import type { MergeSide } from "./mergeResult";

const drawingSides = new DrawingSides(
    { Task_Incoming: "incoming", Task_Current: "current", Input_Drawn: "incoming" },
    new Set(["Input_Drawn", "Input_Undrawn"]),
    new Set(["Task_Incoming", "Task_Current", "Task_Undrawn"]),
);

describe("DrawingSides", () => {
    it.each<[string, string, MergeSide | undefined]>([
        ["an element its drawing side draws", "Task_Incoming", "incoming"],
        ["an element taken with current's drawing", "Task_Current", "current"],
        ["a decided element with no drawing side", "Task_Undrawn", undefined],
        ["a part its holder's side draws", "Input_Drawn", "incoming"],
        ["a part no side draws", "Input_Undrawn", undefined],
        ["an id no decision and no part covers", "Process_Undecided", "current"],
    ])("takes for %s (%s) the DI of %s", (_case, id, side) => {
        expect(drawingSides.takenSideOf(id)).toBe(side);
    });

    it.each<[string, boolean]>([
        ["Process_Undecided", true],
        ["Task_Current", false],
        ["Task_Undrawn", false],
        ["Input_Undrawn", false],
    ])("keeps %s where current draws it: %s", (id, stays) => {
        expect(drawingSides.staysWhereCurrentDraws(id)).toBe(stays);
    });

    it("tells a part from an element", () => {
        expect([drawingSides.isPart("Input_Undrawn"), drawingSides.isPart("Task_Current")]).toEqual(
            [true, false],
        );
    });
});
