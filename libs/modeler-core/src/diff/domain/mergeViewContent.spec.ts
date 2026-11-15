import { describe, expect, it } from "vitest";

import { MergeViewContent, showsSameConflict } from "./mergeViewContent";

const OPEN: MergeViewContent = {
    stages: { base: "<base/>", current: "<current/>", incoming: "<incoming/>" },
    title: "order.bpmn (Merge: main ↔ feature)",
};

describe("showsSameConflict", () => {
    it.each<[string, MergeViewContent, boolean]>([
        ["the same sides and title", { ...OPEN, stages: { ...OPEN.stages } }, true],
        ["another current side", { ...OPEN, stages: { ...OPEN.stages, current: "<c2/>" } }, false],
        ["another incoming side", { ...OPEN, stages: { ...OPEN.stages, incoming: "<i2/>" } }, false],
        ["another ancestor", { ...OPEN, stages: { ...OPEN.stages, base: "<b2/>" } }, false],
        [
            "no ancestor any more",
            { ...OPEN, stages: { current: "<current/>", incoming: "<incoming/>" } },
            false,
        ],
        ["the same sides named otherwise", { ...OPEN, title: "order.bpmn (Merge: main ↔ fix)" }, false],
    ])("%s → %s", (_case, now, expected) => {
        expect(showsSameConflict(OPEN, now)).toBe(expected);
    });
});
