/** Small DMN 1.3 documents for targeted `computeDmnDiff` specs. */

const NAMESPACES = [
    'xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"',
    'xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"',
    'xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"',
    'xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/"',
    'xmlns:biodi="http://bpmn.io/schema/dmn/biodi/2.0"',
    'xmlns:camunda="http://camunda.org/schema/1.0/dmn"',
    'xmlns:acme="urn:acme"',
].join(" ");

export function dmn(body: string, diagram = ""): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<definitions ${NAMESPACES} id="Definitions_1" name="Spec" namespace="http://camunda.org/schema/1.0/dmn">
${body}
<dmndi:DMNDI><dmndi:DMNDiagram id="DRD_1">${diagram}</dmndi:DMNDiagram></dmndi:DMNDI>
</definitions>`;
}

export function shape(id: string, x: number, y: number, width = 180, height = 80): string {
    return `<dmndi:DMNShape id="Shape_${id}" dmnElementRef="${id}"><dc:Bounds height="${height}" width="${width}" x="${x}" y="${y}" /></dmndi:DMNShape>`;
}

export function edge(id: string, points: ReadonlyArray<readonly [number, number]>): string {
    const waypoints = points.map(([x, y]) => `<di:waypoint x="${x}" y="${y}" />`).join("");
    return `<dmndi:DMNEdge id="Edge_${id}" dmnElementRef="${id}">${waypoints}</dmndi:DMNEdge>`;
}

interface TableRule {
    readonly id: string;
    /** One text per input column, then one per output column. */
    readonly entries: readonly string[];
    readonly description?: string;
    /** Entry ids by column id, for entries that do not follow `<rule>_<column>`. */
    readonly entryIds?: Readonly<Record<string, string>>;
}

export interface TableSpec {
    readonly id?: string;
    readonly attributes?: string;
    readonly inputs: readonly string[];
    readonly outputs: readonly string[];
    readonly rules: readonly TableRule[];
    /** Extra XML attributes per column id, such as `biodi:width="300"`. */
    readonly columnAttributes?: Readonly<Record<string, string>>;
    /** Input expression text per input column id; defaults to the lower-cased id. */
    readonly expressions?: Readonly<Record<string, string>>;
}

/** A decision table whose entries are named `<rule>_<column>`. */
export function decisionTable(spec: TableSpec): string {
    const extra = (column: string) => spec.columnAttributes?.[column] ?? "";
    const inputs = spec.inputs
        .map(
            (column) =>
                `<input id="${column}" label="${column}" ${extra(column)}><inputExpression id="Expr_${column}" typeRef="string"><text>${spec.expressions?.[column] ?? column.toLowerCase()}</text></inputExpression></input>`,
        )
        .join("");
    const outputs = spec.outputs
        .map(
            (column) =>
                `<output id="${column}" label="${column}" name="${column.toLowerCase()}" typeRef="string" ${extra(column)} />`,
        )
        .join("");
    const rules = spec.rules
        .map((rule) => {
            const columns = [...spec.inputs, ...spec.outputs];
            const entries = columns
                .map((column, index) => {
                    const tag = index < spec.inputs.length ? "inputEntry" : "outputEntry";
                    const id = rule.entryIds?.[column] ?? `${rule.id}_${column}`;
                    return `<${tag} id="${id}"><text>${rule.entries[index]}</text></${tag}>`;
                })
                .join("");
            const description = rule.description
                ? `<description>${rule.description}</description>`
                : "";
            return `<rule id="${rule.id}">${description}${entries}</rule>`;
        })
        .join("");
    return `<decisionTable id="${spec.id ?? "Table_1"}" ${spec.attributes ?? ""}>${inputs}${outputs}${rules}</decisionTable>`;
}

/** Two rules over inputs In_A, In_B and output Out_X. */
export const TWO_RULES: TableSpec = {
    inputs: ["In_A", "In_B"],
    outputs: ["Out_X"],
    rules: [
        { id: "R1", entries: ['"a"', "&lt; 10", '"x"'], description: "First" },
        { id: "R2", entries: ['"b"', "&gt;= 10", '"y"'], description: "Second" },
    ],
};

export function decision(id: string, table: string, attributes = ""): string {
    return `<decision id="${id}" name="${id}" ${attributes}>${table}</decision>`;
}

export function withTable(spec: TableSpec, decisionAttributes = ""): string {
    return dmn(decision("D1", decisionTable(spec), decisionAttributes), shape("D1", 100, 100));
}
