import { describe, expect, expectTypeOf, it } from "vitest";

import type { DiffCategory, DiffCounts } from "@miragon/bpmn-modeler-types";

import {
    type DmnDiffMarks,
    type DmnDiffStatus,
    focusCss,
    tableMarksCss,
    type DmnTableMarks,
    viewStatusOf,
} from "./diffMarks";

const SCOPE = '[data-dmn-diff="pane-1"]';
const COLUMNS = ["In_Country", "In_Insured", "Out_Carrier", "Out_Cost"];

const NONE: DmnTableMarks = {
    columns: { added: [], removed: [], changed: [] },
    rules: { added: [], removed: [], changed: [], moved: [] },
    cells: [],
    annotations: [],
    properties: [],
    counts: { added: 0, removed: 0, changed: 0, layoutChanged: 0 },
};

function marks(overrides: Partial<DmnTableMarks>): DmnTableMarks {
    return { ...NONE, ...overrides };
}

describe("tableMarksCss", () => {
    it("marks nothing for a table without changes", () => {
        expect(tableMarksCss(SCOPE, NONE, COLUMNS)).toBe("");
    });

    it.each([
        ["an added rule", marks({ rules: { ...NONE.rules, added: ["Rule_10"] } }), "added"],
        ["a removed rule", marks({ rules: { ...NONE.rules, removed: ["Rule_6"] } }), "removed"],
    ])("tints %s and bars its rule number", (_case, table, kind) => {
        const id = kind === "added" ? "Rule_10" : "Rule_6";
        const css = tableMarksCss(SCOPE, table, COLUMNS);

        expect(css).toContain(`${SCOPE} td[data-row-id="${id}"]`);
        expect(css).toContain(`color-mix(in srgb, var(--dmn-diff-${kind})`);
        expect(css).toContain(
            `${SCOPE} td.rule-index[data-row-id="${id}"] { box-shadow: inset 4px 0 0 var(--dmn-diff-${kind}); }`,
        );
    });

    it("outlines a changed cell and bars its rule number", () => {
        const css = tableMarksCss(
            SCOPE,
            marks({ cells: ["Out_Cost_3"], rules: { ...NONE.rules, changed: ["Rule_3"] } }),
            COLUMNS,
        );

        expect(css).toContain(`${SCOPE} td[data-element-id="Out_Cost_3"]`);
        expect(css).toContain("inset 0 0 0 2px var(--dmn-diff-changed)");
        expect(css).toContain(
            `${SCOPE} td.rule-index[data-row-id="Rule_3"] { box-shadow: inset 4px 0 0 var(--dmn-diff-changed); }`,
        );
    });

    it("marks a moved rule with a dashed bar and an arrow", () => {
        const css = tableMarksCss(
            SCOPE,
            marks({ rules: { ...NONE.rules, moved: ["Rule_8"] } }),
            COLUMNS,
        );

        expect(css).toContain(`${SCOPE} td.rule-index[data-row-id="Rule_8"]::after`);
        expect(css).toContain("repeating-linear-gradient");
    });

    it("finds an output column's header by its position, as dmn-js renders no id on it", () => {
        const css = tableMarksCss(
            SCOPE,
            marks({ columns: { added: ["In_Insured", "Out_Cost"], removed: [], changed: [] } }),
            COLUMNS,
        );

        expect(css).toContain(`${SCOPE} th[data-col-id="In_Insured"]`);
        expect(css).toContain(`${SCOPE} td[data-col-id="Out_Cost"]`);
        // The rule-number column comes first, so the fourth column is the fifth header cell.
        expect(css).toContain(`${SCOPE} thead th:nth-child(5):not([data-col-id])`);
    });

    it("marks a changed annotation and a changed hit policy", () => {
        const css = tableMarksCss(
            SCOPE,
            marks({ annotations: ["Rule_2"], properties: ["hitPolicy"] }),
            COLUMNS,
        );

        expect(css).toContain(`${SCOPE} td.annotation[data-element-id="Rule_2"]`);
        expect(css).toContain(`${SCOPE} .hit-policy`);
    });

    it("escapes quotes and backslashes in ids", () => {
        const css = tableMarksCss(SCOPE, marks({ cells: ['a"b\\c'] }), COLUMNS);

        expect(css).toContain('td[data-element-id="a\\"b\\\\c"]');
    });
});

describe("focusCss", () => {
    it.each([
        ["rule", "Rule_3", `${SCOPE} tr:has(> td[data-row-id="Rule_3"])`],
        ["column", "In_Insured", `${SCOPE} th[data-col-id="In_Insured"]`],
        ["column", "Out_Cost", `${SCOPE} thead th:nth-child(5):not([data-col-id])`],
        ["table", "Table_1", `${SCOPE} .hit-policy`],
    ] as const)("outlines the current %s", (kind, id, selector) => {
        const css = focusCss(SCOPE, { kind, id }, COLUMNS);

        expect(css).toContain(selector);
        expect(css).toContain("var(--dmn-diff-current)");
    });

    it("outlines nothing without a current change", () => {
        expect(focusCss(SCOPE, undefined, COLUMNS)).toBe("");
    });
});

describe("DmnTableMarks", () => {
    it("counts a table's changes like every diff and names a status by a diff category", () => {
        expectTypeOf<DmnTableMarks["counts"]>().toEqualTypeOf<DiffCounts>();
        expectTypeOf<DmnTableMarks["attributesStep"]>().toEqualTypeOf<string | undefined>();
        expectTypeOf<DmnDiffStatus>().toEqualTypeOf<Exclude<DiffCategory, "layoutChanged">>();
    });
});

describe("viewStatusOf", () => {
    const DRD: DmnDiffMarks = {
        added: ["Decision_New"],
        removed: ["Decision_Old"],
        changed: ["Decision_Table", "Decision_Expression"],
        layoutChanged: [],
        tables: {},
        expressions: ["Decision_Expression"],
    };

    it.each([
        ["Decision_New", "added"],
        ["Decision_Old", "removed"],
        ["Decision_Expression", "changed"],
    ] as const)("marks the open view of %s as %s", (elementId, status) => {
        expect(viewStatusOf(DRD, elementId)).toBe(status);
    });

    it("gives a changed decision table no view status, since its cells carry the marks", () => {
        expect(viewStatusOf(DRD, "Decision_Table")).toBeUndefined();
    });
});
