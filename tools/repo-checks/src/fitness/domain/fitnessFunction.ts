import type { DeclaredFindingFields, Finding } from "./finding";

export interface FitnessCategories {
    readonly scope: "atomic" | "holistic";
    readonly cadence: "triggered";
    readonly result: "static" | "dynamic";
}

export type Evidence =
    | { readonly kind: "published"; readonly reference: string }
    | { readonly kind: "trial"; readonly commit: string; readonly outcome: string };

export interface MeasurementContext {
    /** The tree to measure: the working tree for HEAD, a temporary checkout otherwise. */
    readonly repoRoot: string;
    readonly commit: string;
    /** The merge base for HEAD; the commit itself for the base and a snapshot, which measure no change. */
    readonly changeBase: string;
}

type NonEmptyList<T> = readonly [T, ...T[]];

export interface FindingGroup {
    readonly id: string;
    readonly title: string;
    readonly collapsed?: boolean;
}

/** A number a finding carries, such as its code lines; the report follows it over the stored snapshots. */
export interface FindingValue {
    readonly id: string;
    readonly title: string;
}

export interface FitnessFunction {
    readonly id: string;
    /** Bumped on every change to what the function finds; another version's snapshot is not compared. */
    readonly version: number;
    readonly categories: FitnessCategories;
    readonly measures: string;
    readonly reliesOn: { readonly skill: string; readonly rule: string };
    readonly misses: NonEmptyList<string>;
    readonly reportsWrongly: NonEmptyList<string>;
    readonly evidence: NonEmptyList<Evidence>;
    /** The report prints one table per group, in this order. */
    readonly groups?: NonEmptyList<FindingGroup>;
    readonly values?: NonEmptyList<FindingValue>;
    /** Throws `InsufficientHistory` when git cannot recompute it at this commit. */
    findFindings(context: MeasurementContext): readonly Finding[];
}

/** Ends a function's series at this commit: older commits are not measured. */
export class InsufficientHistory extends Error {
    override readonly name = "InsufficientHistory";
}

// With a `const` type parameter a "" literal survives inference, so it can be rejected here.
type RejectEmptyText<T> = T extends ""
    ? never
    : T extends (...args: never[]) => unknown
      ? T
      : T extends object
        ? { readonly [K in keyof T]: RejectEmptyText<T[K]> }
        : T;

const FITNESS_FUNCTION_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function isNonBlankText(value: unknown): boolean {
    return typeof value === "string" && value.trim() !== "";
}

function nonEmptyTextListProblem(field: string, value: unknown): string[] {
    if (!Array.isArray(value) || value.length === 0) {
        return [`${field} lists nothing`];
    }
    return value.every(isNonBlankText) ? [] : [`${field} holds an empty entry`];
}

function evidenceProblem(evidence: unknown): boolean {
    const { kind, reference, commit, outcome } = (evidence ?? {}) as Record<string, unknown>;
    if (kind === "published") {
        return !isNonBlankText(reference);
    }
    return kind !== "trial" || !isNonBlankText(commit) || !isNonBlankText(outcome);
}

function declaredListProblem(declared: unknown): boolean {
    if (declared === undefined) {
        return false;
    }
    if (!Array.isArray(declared) || declared.length === 0) {
        return true;
    }
    const ids = declared.map(({ id }: FindingGroup | FindingValue) => id);
    return (
        new Set(ids).size !== ids.length ||
        !declared.every(
            ({ id, title }: FindingGroup | FindingValue) =>
                isNonBlankText(id) && isNonBlankText(title),
        )
    );
}

function contractProblems(definition: FitnessFunction): string[] {
    const { categories, reliesOn, evidence } = definition;
    return [
        ...(FITNESS_FUNCTION_ID.test(String(definition.id)) ? [] : ["id is not kebab-case"]),
        ...(Number.isInteger(definition.version) && definition.version > 0
            ? []
            : ["version is not a positive integer"]),
        ...(["atomic", "holistic"].includes(categories?.scope) &&
        categories?.cadence === "triggered" &&
        ["static", "dynamic"].includes(categories?.result)
            ? []
            : ["categories are incomplete"]),
        ...(isNonBlankText(definition.measures) ? [] : ["measures is empty"]),
        ...(isNonBlankText(reliesOn?.skill) && isNonBlankText(reliesOn?.rule)
            ? []
            : ["reliesOn names no skill and rule"]),
        ...nonEmptyTextListProblem("misses", definition.misses),
        ...nonEmptyTextListProblem("reportsWrongly", definition.reportsWrongly),
        ...(Array.isArray(evidence) && evidence.length > 0 && !evidence.some(evidenceProblem)
            ? []
            : ["evidence is empty or incomplete"]),
        ...(declaredListProblem(definition.groups)
            ? ["groups are empty, blank or repeat an id"]
            : []),
        ...(declaredListProblem(definition.values)
            ? ["values are empty, blank or repeat an id"]
            : []),
        ...(typeof definition.findFindings === "function" ? [] : ["findFindings is missing"]),
    ];
}

export function defineFitnessFunction<const T extends FitnessFunction>(
    definition: T & RejectEmptyText<T>,
): FitnessFunction {
    const problems = contractProblems(definition);
    if (problems.length > 0) {
        throw new Error(`fitness function ${String(definition.id)}: ${problems.join(", ")}`);
    }
    return definition;
}

export function declaresValues(fitnessFunction: FitnessFunction): boolean {
    return fitnessFunction.values !== undefined;
}

export function declaredFindingFields(fitnessFunction: FitnessFunction): DeclaredFindingFields {
    return {
        groups: fitnessFunction.groups?.map(({ id }) => id) ?? [],
        values: fitnessFunction.values?.map(({ id }) => id) ?? [],
    };
}
