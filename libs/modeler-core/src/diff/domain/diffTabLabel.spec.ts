import { describe, expect, it } from "vitest";

import type { MergeSide, MergeSideCaption } from "@miragon/bpmn-modeler-types";

import {
    compareTabLabel,
    diffTabLabelNamesFile,
    mergeElementXmlDiffTitle,
    mergeResultTabLabel,
    mergeTabLabel,
} from "./diffTabLabel";
import { mergePaneBasename } from "./mergePaneName";

const CAPTIONS: Record<MergeSide, MergeSideCaption> = {
    current: { side: "current", role: "branch", ref: "main", shortHash: "1111111" },
    incoming: { side: "incoming", role: "upstream", ref: "feature", shortHash: "9f8e7d6" },
};

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

describe("mergeTabLabel", () => {
    it.each<[string, Record<MergeSide, MergeSideCaption>, string]>([
        ["names both branches of a merge", CAPTIONS, "order.bpmn (Merge: main ↔ feature)"],
        [
            "names a commit by its short hash when no branch names it",
            {
                current: { side: "current", role: "upstream", shortHash: "1111111" },
                incoming: { side: "incoming", role: "yourCommit", shortHash: "9f8e7d6" },
            },
            "order.bpmn (Merge: 1111111 ↔ 9f8e7d6)",
        ],
        [
            "names a side by its position when Git names nothing",
            {
                current: { side: "current", role: "unknown" },
                incoming: { side: "incoming", role: "stash" },
            },
            "order.bpmn (Merge: Current ↔ Incoming)",
        ],
    ])("%s", (_case, captions, expected) => {
        expect(mergeTabLabel("order.bpmn", captions)).toBe(expected);
    });
});

describe("mergeElementXmlDiffTitle", () => {
    it("names the element, the working file and the sides by position", () => {
        expect(mergeElementXmlDiffTitle("Task_Check", "my order.bpmn")).toBe(
            "Task_Check (XML): my order.bpmn (Current ↔ Incoming)",
        );
    });

    it("names no diagram diff's file, so it never counts as a diff tab of it", () => {
        expect(
            diffTabLabelNamesFile(
                mergeElementXmlDiffTitle("Task_Check", "order.bpmn"),
                "order.bpmn",
            ),
        ).toBe(false);
    });
});

describe("diffTabLabelNamesFile beside a merge view", () => {
    it("a merge tab's title does not name its working file", () => {
        expect(diffTabLabelNamesFile(mergeTabLabel("order.bpmn", CAPTIONS), "order.bpmn")).toBe(
            false,
        );
    });

    it("the label VS Code restores for a merge tab does not name its working file", () => {
        const restored = compareTabLabel(
            mergePaneBasename("order.bpmn", "current"),
            mergePaneBasename("order.bpmn", "incoming"),
        );

        expect(diffTabLabelNamesFile(restored, "order.bpmn")).toBe(false);
    });

    it("an SCM label still names the file", () => {
        expect(diffTabLabelNamesFile("order.bpmn (Working Tree)", "order.bpmn")).toBe(true);
    });

    it("a compare label still names either side", () => {
        const label = compareTabLabel("order.bpmn", "order-v2.bpmn");

        expect(diffTabLabelNamesFile(label, "order.bpmn")).toBe(true);
        expect(diffTabLabelNamesFile(label, "order-v2.bpmn")).toBe(true);
    });
});

describe("mergeResultTabLabel", () => {
    it.each<[MergeSide, string]>([
        ["current", "order.bpmn (Merge: Current ↔ Result)"],
        ["incoming", "order.bpmn (Merge: Incoming ↔ Result)"],
    ])("names the side the result is compared with, %s", (against, label) => {
        expect(mergeResultTabLabel("order.bpmn", against)).toBe(label);
    });

    it("names no file, so the working file opens as an editor beside the comparison", () => {
        expect(diffTabLabelNamesFile(mergeResultTabLabel("order.bpmn", "incoming"), "order.bpmn")).toBe(
            false,
        );
    });
});
