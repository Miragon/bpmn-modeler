import { describe, expect, it } from "vitest";

import { compareTabLabel, diffTabLabelNamesFile } from "./diffTabLabel";

describe("compareTabLabel", () => {
    it("joins both basenames with the compare separator", () => {
        expect(compareTabLabel("a.bpmn", "b.bpmn")).toBe("a.bpmn ↔ b.bpmn");
    });
});

describe("diffTabLabelNamesFile", () => {
    it.each([
        ["an SCM working-tree label", "c.bpmn (Working Tree)", "c.bpmn", true],
        ["an SCM ref-to-ref label", "c.bpmn (HEAD~1 ↔ HEAD)", "c.bpmn", true],
        ["an SCM label of another file", "d.bpmn (Working Tree)", "c.bpmn", false],
        ["a file name without the parenthetical", "c.bpmn", "c.bpmn", false],
        ["the left side of a compare label", "a.bpmn ↔ b.bpmn", "a.bpmn", true],
        ["the right side of a compare label", "a.bpmn ↔ b.bpmn", "b.bpmn", true],
        ["a compare label of other files", "a.bpmn ↔ b.bpmn", "c.bpmn", false],
        ["a compare label of another format", "a.bpmn ↔ b.bpmn", "shipping.dmn", false],
        ["a side that only contains the name", "aa.bpmn ↔ b.bpmn", "a.bpmn", false],
        ["a label with more than two sides", "a.bpmn ↔ b.bpmn ↔ c.bpmn", "a.bpmn", false],
    ])("%s: %j names %j → %s", (_case, label, basename, expected) => {
        expect(diffTabLabelNamesFile(label, basename)).toBe(expected);
    });

    it("recognises both files in the label compareTabLabel builds", () => {
        const label = compareTabLabel("before.dmn", "after.dmn");

        expect(diffTabLabelNamesFile(label, "before.dmn")).toBe(true);
        expect(diffTabLabelNamesFile(label, "after.dmn")).toBe(true);
    });
});
