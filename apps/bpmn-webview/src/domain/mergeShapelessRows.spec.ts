import { describe, expect, it } from "vitest";

import { mergeShapelessRows, openShapelessConflicts } from "./mergeShapelessRows";

describe("mergeShapelessRows", () => {
    it("lists each shape-less mark with its host name and the user's pick", () => {
        const rows = mergeShapelessRows({
            shapeless: [
                { id: "Error_1", type: "bpmn:Error", marker: "takenFromThisSide" },
                { id: "Message_1", type: "bpmn:Message", marker: "conflict" },
            ],
            picksNotDrawn: [
                { id: "Error_1", keptSide: "incoming", scope: "element" },
                { id: "Task_1", keptSide: "current", scope: "element" },
            ],
            names: { Error_1: "Payment failed" },
        });

        expect(rows).toEqual([
            {
                id: "Error_1",
                type: "bpmn:Error",
                marker: "takenFromThisSide",
                name: "Payment failed",
                keptSide: "incoming",
                undo: "element",
            },
            { id: "Message_1", type: "bpmn:Message", marker: "conflict" },
        ]);
    });
});

describe("openShapelessConflicts", () => {
    it("counts the open conflicts without a shape", () => {
        const step = (id: string, shapeless: boolean) => ({
            id,
            shapeless,
            onThisPane: true,
            onOtherPane: true,
        });

        expect(
            openShapelessConflicts({
                openConflictSteps: [step("Task_1", false), step("Message_1", true)],
            }),
        ).toBe(1);
    });
});
