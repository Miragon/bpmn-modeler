import { describe, expect, it } from "vitest";

import type { MergePaneBadge } from "@miragon/bpmn-modeler-shared";

import { MERGE_MARK_LOOKS, mergeMarkLooks } from "./mergeMarkLooks";

const picked = (id: string, kind: MergePaneBadge["kind"] = "keptHere"): MergePaneBadge => ({
    id,
    kind,
    pick: { keptSide: "incoming", scope: "element" },
});

const mergedByHand = (id: string, kind: MergePaneBadge["kind"] = "keptHere"): MergePaneBadge => ({
    id,
    kind,
    pick: { keptSide: "incoming", scope: "element", mergedByHand: true },
});

const NO_MARKS = { takenFromThisSide: [], takenFromOtherSide: [], conflict: [] };

describe("mergeMarkLooks", () => {
    it("draws each element by its marker where nothing is merged by hand", () => {
        const marks = {
            takenFromThisSide: ["Task_Pack"],
            takenFromOtherSide: ["Flow_1"],
            conflict: ["Task_Check"],
        };

        expect(mergeMarkLooks(marks, [picked("Task_Pack")])).toStrictEqual({
            ...marks,
            mergedByHand: [],
        });
    });

    it.each<[string, MergePaneBadge["kind"], "takenFromThisSide" | "takenFromOtherSide"]>([
        ["the pane whose side it was kept from", "keptHere", "takenFromThisSide"],
        ["the pane of the other side", "replacedHere", "takenFromOtherSide"],
    ])(
        "draws a version merged by hand as one on %s, not as taken from a side",
        (_pane, kind, marker) => {
            const marks = { ...NO_MARKS, [marker]: ["Task_Check", "Task_Pack"] };

            expect(mergeMarkLooks(marks, [mergedByHand("Task_Check", kind)])).toStrictEqual({
                ...NO_MARKS,
                [marker]: ["Task_Pack"],
                mergedByHand: ["Task_Check"],
            });
        },
    );

    it("keeps an open conflict a conflict", () => {
        const marks = { ...NO_MARKS, conflict: ["Task_Check"] };

        expect(mergeMarkLooks(marks, [mergedByHand("Task_Check")])).toStrictEqual({
            ...marks,
            mergedByHand: [],
        });
    });

    it("draws every version merged by hand, in the badges' order", () => {
        const marks = { ...NO_MARKS, takenFromThisSide: ["Task_Pack", "Task_Ship", "Task_Check"] };

        expect(
            mergeMarkLooks(marks, [
                mergedByHand("Task_Ship"),
                picked("Task_Pack"),
                mergedByHand("Task_Check"),
            ]),
        ).toStrictEqual({
            ...NO_MARKS,
            takenFromThisSide: ["Task_Pack"],
            mergedByHand: ["Task_Ship", "Task_Check"],
        });
    });
});

describe("MERGE_MARK_LOOKS", () => {
    it("lists the three markers, then the version merged by hand", () => {
        expect(MERGE_MARK_LOOKS).toStrictEqual([
            "takenFromThisSide",
            "takenFromOtherSide",
            "conflict",
            "mergedByHand",
        ]);
    });
});
