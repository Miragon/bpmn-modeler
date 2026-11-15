import { describe, expect, it } from "vitest";

import type { DiffSide, MergeSide } from "@miragon/bpmn-modeler-types";

import { mergeSideOfPane } from "./mergePaneSide";

describe("mergeSideOfPane", () => {
    it.each<[DiffSide, MergeSide]>([
        ["before", "current"],
        ["after", "incoming"],
    ])("puts the %s pane on the %s side, during a rebase too", (diffSide, mergeSide) => {
        expect(mergeSideOfPane(diffSide)).toBe(mergeSide);
    });
});
