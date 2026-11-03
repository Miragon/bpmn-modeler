import type { Finding } from "./finding";

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
}

type NonEmptyList<T> = readonly [T, ...T[]];

export interface FindingGroup {
    readonly id: string;
    readonly title: string;
    readonly collapsed?: boolean;
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

function groupsProblem(groups: unknown): boolean {
    if (groups === undefined) {
        return false;
    }
    if (!Array.isArray(groups) || groups.length === 0) {
        return true;
    }
    const ids = groups.map(({ id }: FindingGroup) => id);
    return (
        new Set(ids).size !== ids.length ||
        !groups.every(({ id, title }: FindingGroup) => isNonBlankText(id) && isNonBlankText(title))
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
        ...(groupsProblem(definition.groups) ? ["groups are empty, blank or repeat an id"] : []),
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
