import { defineFitnessFunction, type FitnessFunction } from "../../fitness/domain/fitnessFunction";
import type { SourceMeasures } from "../../sourceFiles/port/SourceMeasures";
import {
    SIZE_AND_COMPLEXITY_GROUPS,
    SIZE_AND_COMPLEXITY_VALUES,
    sizeAndComplexityFindings,
} from "../domain/sizeAndComplexityFindings";
import { SIZE_AND_COMPLEXITY_EVIDENCE } from "./sizeAndComplexityEvidence";

export interface SizeAndComplexityPorts {
    readonly sources: SourceMeasures;
}

export function createSizeAndComplexityFitnessFunction({
    sources,
}: SizeAndComplexityPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "size-and-complexity",
        version: 2,
        categories: { scope: "atomic", cadence: "triggered", result: "dynamic" },
        measures:
            "Per tracked TypeScript file (.ts, .tsx, .mts, .cts) of every workspace, without specs, declaration files and test folders: its code lines (cloc's definition: lines with at least one token that is not a comment) and the highest cyclomatic complexity of a function in it, as ESLint's complexity rule (classic variant) counts it. Functions, methods, constructors, accessors, class field initializers and static blocks start at 1 and add 1 per if, ?:, &&, ||, ??, logical assignment, loop, catch, case with a test, default value and ?.; a nested function counts on its own, top-level code and types not at all. Not measured: a module that runs no code, whose every top-level statement is an import, an export list, a type or a const whose value computes nothing (a literal, a name, a property read, or an array, object or template of those), such as a table of constants, a type-only file or a barrel. The trend follows both values over the stored snapshots.",
        reliesOn: {
            skill: "architecture",
            rule: "a service orchestrates; a rule lives in domain/, named after the rule",
        },
        misses: [
            "A rule in a small file, or one split over several files.",
            "Kotlin, JavaScript and .mjs scripts: only TypeScript is read.",
            "A PR that leaves code lines and complexity unchanged adds no trend point, so the trend shows when a file changed size, not how often it changed.",
            "A rule written as data in a module that runs no code, such as a table that maps one value to another: the module is not measured, so its growth shows nowhere.",
            "A rule written in types, such as a conditional or mapped type, in a type-only file: the module is not measured, so its growth shows nowhere.",
        ],
        reportsWrongly: [
            "Size is a weak sign that a file holds rules: a long table of values beside one function, or built by a call, is large and holds none.",
            "Message classes that only hold their fields (libs/shared/src/lib/modeler.ts, 919 code lines at 2e447ab7) are large and hold no rules.",
            "Complexity counts branches, not their depth: a flat dispatch over many cases scores as high as nested conditions.",
        ],
        evidence: SIZE_AND_COMPLEXITY_EVIDENCE,
        groups: SIZE_AND_COMPLEXITY_GROUPS,
        values: SIZE_AND_COMPLEXITY_VALUES,
        changesView: "grown-values",
        findFindings: ({ repoRoot }) => sizeAndComplexityFindings(sources.read(repoRoot)),
    });
}
