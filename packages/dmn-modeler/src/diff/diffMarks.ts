import type { DiffCategory, DiffCounts } from "@miragon/bpmn-modeler-types";

/** How an element a diff pane shows differs; a move is a DRD layout change only. */
export type DmnDiffStatus = Exclude<DiffCategory, "layoutChanged">;

/** One decision table's changes, as one diff pane marks them. */
export interface DmnTableMarks {
    readonly columns: {
        readonly added: readonly string[];
        readonly removed: readonly string[];
        readonly changed: readonly string[];
    };
    readonly rules: {
        readonly added: readonly string[];
        readonly removed: readonly string[];
        readonly changed: readonly string[];
        readonly moved: readonly string[];
    };
    readonly cells: readonly string[];
    readonly annotations: readonly string[];
    readonly properties: readonly string[];
    readonly counts: DiffCounts;
    /** The table's id when its attributes changed and it has one: the step that focuses them. */
    readonly attributesStep?: string;
}

/** What one DMN diff pane marks: the DRD's changes, each changed table's and the changed expressions. */
export interface DmnDiffMarks {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly string[];
    readonly layoutChanged: readonly string[];
    readonly tables: Readonly<Record<string, DmnTableMarks>>;
    readonly expressions: readonly string[];
}

/**
 * How the open view of a decision or business knowledge model differs. A
 * changed decision table has none: its rows and cells carry the marks.
 */
export function viewStatusOf(marks: DmnDiffMarks, elementId: string): DmnDiffStatus | undefined {
    if (marks.added.includes(elementId)) return "added";
    if (marks.removed.includes(elementId)) return "removed";
    if (marks.expressions.includes(elementId)) return "changed";
    return undefined;
}

/** The change a diff pane's stepper is on, in a decision table. */
export interface DmnDiffFocus {
    readonly kind: "rule" | "column" | "table";
    readonly id: string;
}

/**
 * The stylesheet that marks one decision table's changes in a pane whose
 * container matches `scope`. It selects cells by the ids dmn-js renders on
 * them, so it survives every re-render of the table. Output column headers
 * carry no id, so they are found by their position in `columns`, the table's
 * input and output clause ids in order.
 */
export function tableMarksCss(
    scope: string,
    marks: DmnTableMarks,
    columns: readonly string[],
): string {
    const select = selectors(scope, columns);
    const tint = (kind: DmnDiffStatus, share: number) =>
        `background-color: color-mix(in srgb, var(--dmn-diff-${kind}) ${share}%, var(--decision-table-background-color)) !important;`;
    const bar = (kind: DmnDiffStatus | "moved") =>
        `box-shadow: inset 4px 0 0 var(--dmn-diff-${kind});`;
    const outline = (kind: DmnDiffStatus) => `box-shadow: inset 0 0 0 2px var(--dmn-diff-${kind});`;
    const { rules, columns: changedColumns } = marks;

    return [
        rule(select.rows(rules.added), tint("added", 16)),
        rule(select.ruleNumbers(rules.added), bar("added")),
        rule(select.rows(rules.removed), tint("removed", 14)),
        rule(select.ruleNumbers(rules.removed), bar("removed")),
        rule(select.ruleNumbers(rules.changed), bar("changed")),
        rule(
            select.ruleNumbers(rules.moved),
            "background-image: repeating-linear-gradient(to bottom, var(--dmn-diff-moved) 0 4px, transparent 4px 7px) !important; background-size: 4px 100% !important; background-repeat: no-repeat !important;",
        ),
        rule(
            select.ruleNumbers(rules.moved).map((selector) => `${selector}::after`),
            'content: " ↕"; color: var(--dmn-diff-moved);',
        ),
        rule(select.cells(marks.cells), `${tint("changed", 18)} ${outline("changed")}`),
        rule(select.annotations(marks.annotations), `${tint("changed", 18)} ${outline("changed")}`),
        rule(select.columnCells(changedColumns.added), tint("added", 10)),
        rule(
            select.headers(changedColumns.added),
            "box-shadow: inset 0 3px 0 var(--dmn-diff-added);",
        ),
        rule(select.columnCells(changedColumns.removed), tint("removed", 10)),
        rule(
            select.headers(changedColumns.removed),
            "box-shadow: inset 0 3px 0 var(--dmn-diff-removed);",
        ),
        rule(
            select.headers(changedColumns.changed),
            `${tint("changed", 18)} ${outline("changed")}`,
        ),
        rule(
            marks.properties.length > 0 ? [`${scope} .hit-policy`] : [],
            `${tint("changed", 18)} ${outline("changed")}`,
        ),
    ].join("");
}

/** The stylesheet that outlines the change a pane's stepper is on. */
export function focusCss(
    scope: string,
    focus: DmnDiffFocus | undefined,
    columns: readonly string[],
): string {
    if (!focus) return "";
    const select = selectors(scope, columns);
    const targets = {
        rule: [`${scope} tr:has(> td[data-row-id="${attributeValue(focus.id)}"])`],
        column: select.columnCells([focus.id]),
        table: [`${scope} .hit-policy`],
    }[focus.kind];
    return rule(targets, "outline: 2px solid var(--dmn-diff-current); outline-offset: -2px;");
}

function selectors(scope: string, columns: readonly string[]) {
    const each =
        (template: (id: string) => string) =>
        (ids: readonly string[]): string[] =>
            ids.map((id) => `${scope} ${template(attributeValue(id))}`);
    const outputHeaders = (ids: readonly string[]) =>
        ids
            .map((id) => columns.indexOf(id))
            .filter((index) => index >= 0)
            // The rule-number column comes first; nth-child counts from one.
            .map((index) => `${scope} thead th:nth-child(${index + 2}):not([data-col-id])`);
    const headers = (ids: readonly string[]) => [
        ...each((id) => `th[data-col-id="${id}"]`)(ids),
        ...outputHeaders(ids),
    ];
    return {
        rows: each((id) => `td[data-row-id="${id}"]`),
        ruleNumbers: each((id) => `td.rule-index[data-row-id="${id}"]`),
        cells: each((id) => `td[data-element-id="${id}"]`),
        annotations: each((id) => `td.annotation[data-element-id="${id}"]`),
        headers,
        columnCells: (ids: readonly string[]) => [
            ...each((id) => `td[data-col-id="${id}"]`)(ids),
            ...headers(ids),
        ],
    };
}

function rule(selectorList: readonly string[], declarations: string): string {
    return selectorList.length > 0 ? `${selectorList.join(",\n")} { ${declarations} }\n` : "";
}

/** An id as a double-quoted CSS attribute value. */
export function attributeValue(id: string): string {
    return id.replace(/["\\]/g, "\\$&");
}
