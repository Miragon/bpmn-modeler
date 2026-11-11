import { describe, expect, it } from "vitest";

import type { DmnDiffView } from "@miragon/bpmn-modeler-shared";

import { countsOf, presentIn, statusOf, stepsOf, targetAt } from "./diffSteps";

const TABLE = {
    columns: { added: ["Col_Insured"], removed: [], changed: [] },
    rules: { added: ["Rule_10"], removed: [], changed: ["Rule_3"], moved: ["Rule_8"] },
    cells: ["Out_Cost_3"],
    annotations: [],
    properties: ["hitPolicy"],
    counts: { added: 2, removed: 1, changed: 2, layoutChanged: 1 },
    navigationOrder: ["Table_Shipping", "Col_Insured", "Rule_3", "Rule_6", "Rule_8", "Rule_10"],
};

/** The after pane's view of the shipping change: what only the before version has is blank. */
const AFTER: DmnDiffView = {
    added: ["IR_Insured", "Input_Insured"],
    removed: [],
    changed: ["Decision_Shipping"],
    layoutChanged: ["Source_Contracts", "AR_Contracts"],
    counts: { added: 2, removed: 2, changed: 1, layoutChanged: 2 },
    navigationOrder: [
        "Source_Contracts",
        "Decision_Shipping",
        "Decision_Surcharge",
        "IR_Surcharge",
        "IR_Insured",
        "Input_Insured",
    ],
    tables: { Decision_Shipping: TABLE },
    expressions: ["Decision_Literal"],
};

describe("stepsOf", () => {
    it.each([
        ["the DRD", null, AFTER.navigationOrder],
        ["a changed table", "Decision_Shipping", TABLE.navigationOrder],
        ["a table without changes", "Decision_Other", []],
    ])("walks the changes of %s", (_view, elementId, steps) => {
        expect(stepsOf(AFTER, elementId)).toEqual(steps);
    });
});

describe("presentIn", () => {
    it("knows the DRD changes this version has, not the removed ones", () => {
        const present = presentIn(AFTER, null);

        expect(present.has("Input_Insured")).toBe(true);
        expect(present.has("Source_Contracts")).toBe(true);
        expect(present.has("Decision_Surcharge")).toBe(false);
    });

    it("knows the table, column and rule changes this version has", () => {
        const present = presentIn(AFTER, "Decision_Shipping");

        expect([...present].sort()).toEqual(
            ["Col_Insured", "Rule_10", "Rule_3", "Rule_8", "Table_Shipping"].sort(),
        );
    });

    it("knows no changes of a table without changes", () => {
        expect(presentIn(AFTER, "Decision_Other").size).toBe(0);
    });
});

describe("targetAt", () => {
    const steps = TABLE.navigationOrder;
    const present = presentIn(AFTER, "Decision_Shipping");

    it.each([
        ["focuses a change this version has", 2, 1, { focus: "Rule_3" }],
        ["anchors a removed rule on the next change, stepping forward", 3, 1, { anchor: "Rule_8" }],
        [
            "anchors a removed rule on the previous change, stepping back",
            3,
            -1,
            { anchor: "Rule_3" },
        ],
    ] as const)("%s", (_case, cursor, direction, target) => {
        expect(targetAt(steps, present, cursor, direction)).toEqual(target);
    });

    it("anchors nowhere when this version has none of the changes", () => {
        expect(targetAt(["Gone"], new Set(), 0, 1)).toEqual({ anchor: undefined });
    });
});

describe("countsOf", () => {
    it.each([
        ["the DRD", null, AFTER.counts],
        ["a changed table", "Decision_Shipping", TABLE.counts],
        ["a view without a changed table", "Decision_Literal", undefined],
    ])("counts the changes of %s", (_view, elementId, counts) => {
        expect(countsOf(AFTER, elementId)).toEqual(counts);
    });
});

describe("statusOf", () => {
    it.each([
        ["an element only this version has", "Input_Insured", "added"],
        ["an element whose expression changed", "Decision_Literal", "changed"],
        ["an element without changes", "Input_Country", undefined],
    ])("names %s", (_case, elementId, status) => {
        expect(statusOf(AFTER, elementId)).toBe(status);
    });

    it("names a removed element on the before side", () => {
        expect(statusOf({ ...AFTER, removed: ["Decision_Surcharge"] }, "Decision_Surcharge")).toBe(
            "removed",
        );
    });
});
