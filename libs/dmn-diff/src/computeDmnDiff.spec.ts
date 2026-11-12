import { describe, expect, it } from "vitest";

import { computeDmnDiff } from "./computeDmnDiff";
import { SHIPPING_AFTER_XML, SHIPPING_BEFORE_XML } from "./__fixtures__/shipping";
import {
    TWO_RULES,
    decision,
    decisionTable,
    dmn,
    edge,
    shape,
    withTable,
    type TableSpec,
} from "./__fixtures__/dmnXml";

const NO_COUNTS = { added: 0, removed: 0, changed: 0, layoutChanged: 0 };

const NO_CHANGES = {
    added: [],
    removed: [],
    changed: [],
    layoutChanged: [],
    counts: NO_COUNTS,
    navigationOrder: [],
    tables: {},
    expressions: [],
};

function withRules(spec: TableSpec, rules: TableSpec["rules"]): TableSpec {
    return { ...spec, rules };
}

describe("computeDmnDiff", () => {
    it("reports every category of the shipping change, DRD and table", async () => {
        await expect(computeDmnDiff(SHIPPING_BEFORE_XML, SHIPPING_AFTER_XML)).resolves.toEqual({
            added: ["IR_Insured", "Input_Insured"],
            removed: ["Decision_Surcharge", "IR_Surcharge"],
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
            tables: {
                Decision_Shipping: {
                    columns: { added: ["Col_Insured"], removed: [], changed: [] },
                    rules: {
                        added: ["Rule_10"],
                        removed: ["Rule_6"],
                        changed: ["Rule_3"],
                        moved: ["Rule_8"],
                    },
                    cells: ["Out_Cost_3"],
                    annotations: [],
                    properties: [],
                    counts: { added: 2, removed: 1, changed: 1, layoutChanged: 1 },
                    navigationOrder: ["Col_Insured", "Rule_3", "Rule_6", "Rule_8", "Rule_10"],
                },
            },
            expressions: [],
        });
    });

    it("reports nothing for two identical documents", async () => {
        await expect(computeDmnDiff(SHIPPING_BEFORE_XML, SHIPPING_BEFORE_XML)).resolves.toEqual(
            NO_CHANGES,
        );
    });

    it("reports a shape that only moved as layout-changed, not changed", async () => {
        const before = dmn('<inputData id="I1" name="Weight" />', shape("I1", 100, 100, 125, 45));
        const after = dmn('<inputData id="I1" name="Weight" />', shape("I1", 300, 100, 125, 45));

        const result = await computeDmnDiff(before, after);

        expect(result.layoutChanged).toEqual(["I1"]);
        expect(result.changed).toEqual([]);
    });

    it("reports an edge whose waypoints changed as layout-changed", async () => {
        const body = (id: string) =>
            `<decision id="D1" name="D1"><informationRequirement id="${id}"><requiredInput href="#I1" /></informationRequirement></decision><inputData id="I1" name="Weight" />`;
        const diagram = (y: number) =>
            shape("D1", 100, 100) +
            shape("I1", 100, 300, 125, 45) +
            edge("IR_1", [
                [160, 300],
                [160, y],
            ]);

        const result = await computeDmnDiff(
            dmn(body("IR_1"), diagram(180)),
            dmn(body("IR_1"), diagram(170)),
        );

        expect(result.layoutChanged).toEqual(["IR_1"]);
    });

    it("steps past an edge that only moved with its shape, but still counts it", async () => {
        const body =
            '<decision id="D1" name="D1"><informationRequirement id="IR_1"><requiredInput href="#I1" /></informationRequirement></decision><inputData id="I1" name="Weight" />';
        const diagram = (x: number) =>
            shape("D1", 100, 100) +
            shape("I1", x, 300, 125, 45) +
            edge("IR_1", [
                [x + 60, 300],
                [160, 180],
            ]);

        const result = await computeDmnDiff(dmn(body, diagram(100)), dmn(body, diagram(400)));

        expect(result.layoutChanged).toEqual(["IR_1", "I1"]);
        expect(result.navigationOrder).toEqual(["I1"]);
    });

    it("ignores column widths, which only change the layout", async () => {
        const before = withTable({ ...TWO_RULES, columnAttributes: { In_A: 'biodi:width="192"' } });
        const after = withTable({ ...TWO_RULES, columnAttributes: { In_A: 'biodi:width="320"' } });

        await expect(computeDmnDiff(before, after)).resolves.toEqual(NO_CHANGES);
    });

    it("reports a changed hit policy as a table attribute and the decision as changed", async () => {
        const before = withTable({ ...TWO_RULES, attributes: 'hitPolicy="UNIQUE"' });
        const after = withTable({ ...TWO_RULES, attributes: 'hitPolicy="FIRST"' });

        const result = await computeDmnDiff(before, after);

        expect(result.changed).toEqual(["D1"]);
        expect(result.tables.D1).toMatchObject({
            properties: ["hitPolicy"],
            counts: { added: 0, removed: 0, changed: 1, layoutChanged: 0 },
            attributesStep: "Table_1",
            navigationOrder: ["Table_1"],
        });
    });

    it("names no attributes step when the table attributes did not change", async () => {
        const after = withRules(TWO_RULES, [
            { id: "R1", entries: ['"a"', "&lt; 20", '"x"'], description: "First" },
            TWO_RULES.rules[1],
        ]);

        const result = await computeDmnDiff(withTable(TWO_RULES), withTable(after));

        expect(result.tables.D1).toBeDefined();
        expect(result.tables.D1).not.toHaveProperty("attributesStep");
    });

    it("names no attributes step for a table without id, and starts its steps with the changed rule", async () => {
        const withoutTableId = (xml: string) => xml.replace(' id="Table_1"', "");
        const before = withoutTableId(
            withTable({ ...TWO_RULES, attributes: 'hitPolicy="UNIQUE"' }),
        );
        const after = withoutTableId(
            withTable({
                ...withRules(TWO_RULES, [
                    { id: "R1", entries: ['"a"', "&lt; 20", '"x"'], description: "First" },
                    TWO_RULES.rules[1],
                ]),
                attributes: 'hitPolicy="FIRST"',
            }),
        );

        const result = await computeDmnDiff(before, after);

        expect(result.tables.D1).toMatchObject({
            properties: ["hitPolicy"],
            navigationOrder: ["R1"],
        });
        expect(result.tables.D1).not.toHaveProperty("attributesStep");
    });

    it("reports a changed input expression as a changed column", async () => {
        const after = withTable({ ...TWO_RULES, expressions: { In_A: "customer.country" } });

        const result = await computeDmnDiff(withTable(TWO_RULES), after);

        expect(result.tables.D1?.columns).toEqual({ added: [], removed: [], changed: ["In_A"] });
        expect(result.tables.D1?.rules.changed).toEqual([]);
    });

    it("reports a changed cell and its rule", async () => {
        const after = withRules(TWO_RULES, [
            { id: "R1", entries: ['"a"', "&lt; 20", '"x"'], description: "First" },
            TWO_RULES.rules[1],
        ]);

        const result = await computeDmnDiff(withTable(TWO_RULES), withTable(after));

        expect(result.tables.D1).toMatchObject({
            cells: ["R1_In_B"],
            rules: { added: [], removed: [], changed: ["R1"], moved: [] },
            annotations: [],
            navigationOrder: ["R1"],
        });
    });

    it("reports a changed annotation and its rule, with no changed cell", async () => {
        const after = withRules(TWO_RULES, [
            { ...TWO_RULES.rules[0], description: "First match" },
            TWO_RULES.rules[1],
        ]);

        const result = await computeDmnDiff(withTable(TWO_RULES), withTable(after));

        expect(result.tables.D1).toMatchObject({
            cells: [],
            annotations: ["R1"],
            rules: { changed: ["R1"] },
        });
    });

    it("matches cells by column, so reordered columns change nothing", async () => {
        const reordered: TableSpec = {
            ...TWO_RULES,
            inputs: ["In_B", "In_A"],
            rules: [
                { id: "R1", entries: ["&lt; 10", '"a"', '"x"'], description: "First" },
                { id: "R2", entries: ["&gt;= 10", '"b"', '"y"'], description: "Second" },
            ],
        };

        await expect(computeDmnDiff(withTable(TWO_RULES), withTable(reordered))).resolves.toEqual(
            NO_CHANGES,
        );
    });

    it("reports an added column without marking its cells or the rules", async () => {
        const after: TableSpec = {
            ...TWO_RULES,
            inputs: ["In_A", "In_B", "In_C"],
            rules: [
                { id: "R1", entries: ['"a"', "&lt; 10", "-", '"x"'], description: "First" },
                { id: "R2", entries: ['"b"', "&gt;= 10", "true", '"y"'], description: "Second" },
            ],
        };

        const result = await computeDmnDiff(withTable(TWO_RULES), withTable(after));

        expect(result.tables.D1).toMatchObject({
            columns: { added: ["In_C"], removed: [], changed: [] },
            rules: { added: [], removed: [], changed: [], moved: [] },
            cells: [],
            counts: { added: 1, removed: 0, changed: 0, layoutChanged: 0 },
        });
    });

    it("reports a removed column and anchors it after its left neighbour", async () => {
        const before: TableSpec = {
            ...TWO_RULES,
            outputs: ["Out_X", "Out_Y"],
            rules: TWO_RULES.rules.map((rule) => ({ ...rule, entries: [...rule.entries, '"z"'] })),
        };
        const after = withRules(TWO_RULES, [
            { id: "R1", entries: ['"a"', "&lt; 20", '"x"'], description: "First" },
            TWO_RULES.rules[1],
        ]);

        const result = await computeDmnDiff(withTable(before), withTable(after));

        expect(result.tables.D1?.columns.removed).toEqual(["Out_Y"]);
        expect(result.tables.D1?.navigationOrder).toEqual(["Out_Y", "R1"]);
    });

    it("reports a rule that moved among the rules both versions share", async () => {
        const three = withRules(TWO_RULES, [
            ...TWO_RULES.rules,
            { id: "R3", entries: ["-", "-", '"z"'], description: "Third" },
        ]);
        const moved = withRules(TWO_RULES, [three.rules[2], three.rules[0], three.rules[1]]);

        const result = await computeDmnDiff(withTable(three), withTable(moved));

        expect(result.tables.D1?.rules).toEqual({
            added: [],
            removed: [],
            changed: [],
            moved: ["R3"],
        });
        expect(result.tables.D1?.counts.layoutChanged).toBe(1);
    });

    it("lists a changed entry under both ids when it got a new id", async () => {
        const after = withRules(TWO_RULES, [
            {
                id: "R1",
                entries: ['"a"', "&lt; 20", '"x"'],
                description: "First",
                entryIds: { In_B: "Entry_New" },
            },
            TWO_RULES.rules[1],
        ]);

        const result = await computeDmnDiff(withTable(TWO_RULES), withTable(after));

        expect(result.tables.D1?.cells).toEqual(["Entry_New", "R1_In_B"]);
    });

    it("ignores an entry that only got a new id", async () => {
        const after = withRules(TWO_RULES, [
            { ...TWO_RULES.rules[0], entryIds: { In_B: "Entry_New" } },
            TWO_RULES.rules[1],
        ]);

        await expect(computeDmnDiff(withTable(TWO_RULES), withTable(after))).resolves.toEqual(
            NO_CHANGES,
        );
    });

    it("reports added and removed rules with the removed one next to its predecessor", async () => {
        const after = withRules(TWO_RULES, [
            { id: "R9", entries: ["-", "-", '"n"'] },
            TWO_RULES.rules[0],
        ]);

        const result = await computeDmnDiff(withTable(TWO_RULES), withTable(after));

        expect(result.tables.D1).toMatchObject({
            rules: { added: ["R9"], removed: ["R2"], changed: [], moved: [] },
            navigationOrder: ["R9", "R2"],
        });
    });

    it("reports a changed literal expression and its decision", async () => {
        const literal = (text: string) =>
            dmn(
                `<decision id="D1" name="Surcharge"><variable id="V1" name="surcharge" typeRef="number" /><literalExpression id="L1"><text>${text}</text></literalExpression></decision>`,
                shape("D1", 100, 100),
            );

        const result = await computeDmnDiff(literal("weight * 0.5"), literal("weight * 0.7"));

        expect(result.changed).toEqual(["D1"]);
        expect(result.expressions).toEqual(["D1"]);
        expect(result.tables).toEqual({});
    });

    it("reports a changed business knowledge model body as a changed expression", async () => {
        const bkm = (text: string) =>
            dmn(
                `<businessKnowledgeModel id="B1" name="Rebate"><encapsulatedLogic id="F1"><literalExpression id="L1"><text>${text}</text></literalExpression></encapsulatedLogic></businessKnowledgeModel>`,
                shape("B1", 100, 100, 135, 46),
            );

        const result = await computeDmnDiff(bkm("0.1"), bkm("0.2"));

        expect(result.expressions).toEqual(["B1"]);
        expect(result.changed).toEqual(["B1"]);
    });

    it("reports a decision whose logic changed from a table to a literal expression, without table changes", async () => {
        const literal = dmn(
            '<decision id="D1" name="D1"><literalExpression id="L1"><text>"x"</text></literalExpression></decision>',
            shape("D1", 100, 100),
        );

        const result = await computeDmnDiff(withTable(TWO_RULES), literal);

        expect(result.changed).toEqual(["D1"]);
        expect(result.tables).toEqual({});
        expect(result.expressions).toEqual([]);
    });

    it("reports an added requirement without marking its decision as changed", async () => {
        const body = (requirement: string) =>
            `<decision id="D1" name="D1">${requirement}</decision><inputData id="I1" name="Weight" />`;
        const requirement =
            '<informationRequirement id="IR_1"><requiredInput href="#I1" /></informationRequirement>';
        const diagram = shape("D1", 100, 100) + shape("I1", 100, 300, 125, 45);

        const result = await computeDmnDiff(
            dmn(body(""), diagram),
            dmn(
                body(requirement),
                diagram +
                    edge("IR_1", [
                        [160, 300],
                        [160, 180],
                    ]),
            ),
        );

        expect(result.added).toEqual(["IR_1"]);
        expect(result.changed).toEqual([]);
    });

    it("reports a renamed element and a changed extension attribute as changed", async () => {
        const before = dmn(
            '<inputData id="I1" name="Weight" /><knowledgeSource id="K1" name="Contracts" acme:owner="sales" />',
            shape("I1", 100, 100, 125, 45) + shape("K1", 300, 100, 100, 63),
        );
        const after = dmn(
            '<inputData id="I1" name="Parcel weight" /><knowledgeSource id="K1" name="Contracts" acme:owner="legal" />',
            shape("I1", 100, 100, 125, 45) + shape("K1", 300, 100, 100, 63),
        );

        const result = await computeDmnDiff(before, after);

        expect(result.changed).toEqual(["I1", "K1"]);
    });

    it("reports a changed extension element of an unknown namespace", async () => {
        const knowledge = (value: string) =>
            dmn(
                `<knowledgeSource id="K1" name="Contracts"><extensionElements><acme:meta value="${value}" /></extensionElements></knowledgeSource>`,
                shape("K1", 100, 100, 100, 63),
            );

        const result = await computeDmnDiff(knowledge("2025"), knowledge("2026"));

        expect(result.changed).toEqual(["K1"]);
    });

    it("ignores a requirement without an id, which the DRD cannot draw", async () => {
        const body = (requirement: string) =>
            `<decision id="D1" name="D1">${requirement}</decision><inputData id="I1" name="Weight" />`;
        const diagram = shape("D1", 100, 100) + shape("I1", 100, 300, 125, 45);

        const result = await computeDmnDiff(
            dmn(body(""), diagram),
            dmn(
                body(
                    '<informationRequirement><requiredInput href="#I1" /></informationRequirement>',
                ),
                diagram,
            ),
        );

        expect(result).toEqual(NO_CHANGES);
    });

    it("reports added text annotations and associations", async () => {
        const base = '<inputData id="I1" name="Weight" />';
        const note =
            '<textAnnotation id="T1"><text>Check yearly</text></textAnnotation><association id="A1"><sourceRef href="#T1" /><targetRef href="#I1" /></association>';
        const diagram = shape("I1", 100, 300, 125, 45);

        const result = await computeDmnDiff(
            dmn(base, diagram),
            dmn(
                base + note,
                diagram +
                    shape("T1", 100, 100, 100, 45) +
                    edge("A1", [
                        [150, 145],
                        [150, 300],
                    ]),
            ),
        );

        expect(result.added).toEqual(["T1", "A1"]);
    });

    it("orders elements top to bottom, then left to right, and puts elements without DI last", async () => {
        const body =
            '<inputData id="Right" name="R" /><inputData id="Left" name="L" /><inputData id="Top" name="T" /><inputData id="NoDi" name="N" />';

        const result = await computeDmnDiff(
            dmn("", ""),
            dmn(
                body,
                shape("Right", 400, 300, 125, 45) +
                    shape("Left", 100, 300, 125, 45) +
                    shape("Top", 250, 100, 125, 45),
            ),
        );

        expect(result.navigationOrder).toEqual(["Top", "Left", "Right", "NoDi"]);
    });

    it("compares a decision table that sits in a decision without DI", async () => {
        const after = withRules(TWO_RULES, [
            { ...TWO_RULES.rules[0], entries: ['"c"', "&lt; 10", '"x"'] },
            TWO_RULES.rules[1],
        ]);

        const result = await computeDmnDiff(
            dmn(decision("D1", decisionTable(TWO_RULES))),
            dmn(decision("D1", decisionTable(after))),
        );

        expect(result.changed).toEqual(["D1"]);
        expect(result.tables.D1?.cells).toEqual(["R1_In_A"]);
    });

    it("rejects content the parser would skip", async () => {
        const broken = dmn('<inputData id="I1" name="Weight"><acme:unknown /></inputData>');

        await expect(computeDmnDiff(broken, broken)).rejects.toThrow(/unparsable content/);
    });

    it("rejects a document that is not XML", async () => {
        await expect(computeDmnDiff("not xml", SHIPPING_AFTER_XML)).rejects.toThrow();
    });
});
