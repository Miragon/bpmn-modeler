import { describe, expect, it } from "vitest";

import type { DmnDiffResult } from "./dmnDiffResult";
import { dmnSideView } from "./dmnSideView";

const RESULT: DmnDiffResult = {
    added: ["Input_New"],
    removed: ["Decision_Old"],
    changed: ["Decision_Table"],
    layoutChanged: ["Source"],
    counts: { added: 1, removed: 1, changed: 1, layoutChanged: 1 },
    navigationOrder: ["Source", "Decision_Table", "Decision_Old", "Input_New"],
    tables: {
        Decision_Table: {
            columns: { added: ["Col_New"], removed: ["Col_Old"], changed: ["Col_Changed"] },
            rules: {
                added: ["Rule_New"],
                removed: ["Rule_Old"],
                changed: ["Rule_Changed"],
                moved: ["Rule_Moved"],
            },
            cells: ["Cell"],
            annotations: ["Rule_Changed"],
            properties: ["hitPolicy"],
            counts: { added: 2, removed: 2, changed: 3, layoutChanged: 1 },
            attributesStep: "Table",
            navigationOrder: ["Table", "Col_Old", "Col_New", "Rule_Old", "Rule_New"],
        },
    },
    expressions: ["Decision_Literal"],
};

describe("dmnSideView", () => {
    it("keeps only what the before version contains on the before side", () => {
        const view = dmnSideView(RESULT, "before");

        expect(view.added).toEqual([]);
        expect(view.removed).toEqual(["Decision_Old"]);
        expect(view.tables.Decision_Table?.columns).toEqual({
            added: [],
            removed: ["Col_Old"],
            changed: ["Col_Changed"],
        });
        expect(view.tables.Decision_Table?.rules).toEqual({
            added: [],
            removed: ["Rule_Old"],
            changed: ["Rule_Changed"],
            moved: ["Rule_Moved"],
        });
    });

    it("keeps only what the after version contains on the after side", () => {
        const view = dmnSideView(RESULT, "after");

        expect(view.added).toEqual(["Input_New"]);
        expect(view.removed).toEqual([]);
        expect(view.tables.Decision_Table?.columns.removed).toEqual([]);
        expect(view.tables.Decision_Table?.rules.removed).toEqual([]);
        expect(view.tables.Decision_Table?.rules.added).toEqual(["Rule_New"]);
    });

    it.each(["before", "after"] as const)(
        "passes the shared parts through on the %s side",
        (side) => {
            const view = dmnSideView(RESULT, side);

            expect(view).toMatchObject({
                changed: RESULT.changed,
                layoutChanged: RESULT.layoutChanged,
                counts: RESULT.counts,
                navigationOrder: RESULT.navigationOrder,
                expressions: RESULT.expressions,
            });
            expect(view.tables.Decision_Table).toMatchObject({
                cells: ["Cell"],
                annotations: ["Rule_Changed"],
                properties: ["hitPolicy"],
                counts: RESULT.tables.Decision_Table?.counts,
                attributesStep: "Table",
                navigationOrder: RESULT.tables.Decision_Table?.navigationOrder,
            });
        },
    );

    it("stays serializable as plain JSON", () => {
        const view = dmnSideView(RESULT, "after");

        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });
});
