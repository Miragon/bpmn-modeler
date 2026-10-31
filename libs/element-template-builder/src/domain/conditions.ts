export type ConditionOperator = "equals" | "oneOf" | "isActive" | "isEmpty";

/** One comparison of a C8 property condition, as the builder edits it. */
export interface ConditionRow {
    property: string;
    operator: ConditionOperator;
    /** The value as text; a list is comma-separated. */
    value: string;
}

const OPERATORS: readonly ConditionOperator[] = ["equals", "oneOf", "isActive", "isEmpty"];

type Json = Record<string, unknown>;

/** The rows of a condition: itself, or each comparison of its `allMatch`. */
export function conditionRows(condition: unknown): ConditionRow[] {
    if (!isObject(condition)) {
        return [];
    }
    const comparisons = Array.isArray(condition.allMatch) ? condition.allMatch : [condition];
    return comparisons.filter(isObject).map((comparison) => {
        const operator = OPERATORS.find((candidate) => candidate in comparison) ?? "equals";
        const value = comparison[operator];
        return {
            property: typeof comparison.property === "string" ? comparison.property : "",
            operator,
            value: Array.isArray(value)
                ? value.join(", ")
                : value === undefined
                  ? ""
                  : String(value),
        };
    });
}

/**
 * The condition the rows describe, with each value typed after the property
 * it compares: one row is a comparison, more rows must all match.
 */
export function conditionOf(
    rows: readonly ConditionRow[],
    typeOf: (propertyId: string) => string | undefined,
): Json | undefined {
    const comparisons = rows.map((row): Json => ({
        property: row.property,
        [row.operator]: valueOf(row, typeOf(row.property)),
    }));
    if (comparisons.length === 0) {
        return undefined;
    }
    return comparisons.length === 1 ? comparisons[0] : { allMatch: comparisons };
}

function valueOf(row: ConditionRow, type: string | undefined): unknown {
    if (row.operator === "isActive" || row.operator === "isEmpty") {
        return row.value === "true";
    }
    if (row.operator === "oneOf") {
        return row.value
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== "")
            .map((item) => typed(item, type));
    }
    return typed(row.value, type);
}

function typed(value: string, type: string | undefined): unknown {
    if (type === "Boolean") {
        return value === "true";
    }
    if (type === "Number" && value.trim() !== "" && !Number.isNaN(Number(value))) {
        return Number(value);
    }
    return value;
}

function isObject(value: unknown): value is Json {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
