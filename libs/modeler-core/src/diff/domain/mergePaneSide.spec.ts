import { describe, expect, it } from "vitest";

import type { DiffSide, MergeSide } from "@miragon/bpmn-modeler-types";

import { inPaneOrder, mergeSideOfPane, otherMergeSide } from "./mergePaneSide";

describe("mergeSideOfPane", () => {
    it.each<[DiffSide, MergeSide]>([
        ["before", "current"],
        ["after", "incoming"],
    ])("puts the %s pane on the %s side, during a rebase too", (diffSide, mergeSide) => {
        expect(mergeSideOfPane(diffSide)).toBe(mergeSide);
    });
});

describe("inPaneOrder", () => {
    it("puts the left pane's side first", () => {
        expect(inPaneOrder({ current: "left", incoming: "right" })).toStrictEqual([
            "left",
            "right",
        ]);
    });
});

describe("otherMergeSide", () => {
    it.each<[MergeSide, MergeSide]>([
        ["current", "incoming"],
        ["incoming", "current"],
    ])("merges %s with %s", (side, other) => {
        expect(otherMergeSide(side)).toBe(other);
    });
});
