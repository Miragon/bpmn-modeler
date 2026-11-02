import { isObject, type Json } from "./json";
import { readNumberText } from "./numberText";
import type { JsonPath } from "./templateText";

export type ConditionOperator = "equals" | "oneOf" | "isActive" | "isEmpty";

/** One comparison of a C8 property condition, as the builder edits it. */
export interface ConditionRow {
    property: string;
    operator: ConditionOperator;
    /** The value as text; a list is comma-separated. */
    value: string;
}

export const CONDITION_OPERATORS: readonly ConditionOperator[] = [
    "equals",
    "oneOf",
    "isActive",
    "isEmpty",
];

/** How a row's value is entered: a yes or no, a comma-separated list, or plain text. */
export type ConditionValueKind = "flag" | "list" | "text";

export function conditionValueKind(
    operator: ConditionOperator,
    type: string | undefined,
): ConditionValueKind {
    if (operator === "isActive" || operator === "isEmpty") {
        return "flag";
    }
    if (operator === "oneOf") {
        return "list";
    }
    return type === "Boolean" ? "flag" : "text";
}

/** A condition's comparisons with their paths inside it: itself, or each of its `allMatch`. */
export function conditionComparisons(condition: unknown): { comparison: Json; path: JsonPath }[] {
    if (!isObject(condition)) {
        return [];
    }
    if (Array.isArray(condition.allMatch)) {
        return condition.allMatch.map((comparison, index) => ({
            comparison: isObject(comparison) ? comparison : {},
            path: ["allMatch", index],
        }));
    }
    return [{ comparison: condition, path: [] }];
}

/** The rows of a condition: itself, or each comparison of its `allMatch`. */
export function conditionRows(condition: unknown): ConditionRow[] {
    return conditionComparisons(condition).map(({ comparison }) => {
        const operator =
            CONDITION_OPERATORS.find((candidate) => candidate in comparison) ?? "equals";
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

/** The text a row's value will show once written: `a,` is a list of `a`, `1.` the number 1. */
export function normalizedRowValue(row: ConditionRow, type: string | undefined): string {
    const [comparison] = conditionRows(conditionOf([row], () => type));
    return comparison.value;
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
    const number = type === "Number" ? readNumberText(value) : undefined;
    return number?.kind === "number" ? number.value : value;
}
