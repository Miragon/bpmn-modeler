import { defineFitnessFunction, type FitnessFunction } from "../../fitness/domain/fitnessFunction";
import type { SourceMeasures } from "../../sourceFiles/port/SourceMeasures";
import {
    SIZE_AND_COMPLEXITY_GROUPS,
    SIZE_AND_COMPLEXITY_VALUES,
    sizeAndComplexityFindings,
} from "../domain/sizeAndComplexityFindings";

export interface SizeAndComplexityPorts {
    readonly sources: SourceMeasures;
}

export function createSizeAndComplexityFitnessFunction({
    sources,
}: SizeAndComplexityPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "size-and-complexity",
        version: 1,
        categories: { scope: "atomic", cadence: "triggered", result: "dynamic" },
        measures:
            "Per tracked TypeScript file (.ts, .tsx, .mts, .cts) of every workspace, without specs, declaration files and test folders: its code lines (cloc's definition: lines with at least one token that is not a comment) and the highest cyclomatic complexity of a function in it, as ESLint's complexity rule (classic variant) counts it. Functions, methods, constructors, accessors, class field initializers and static blocks start at 1 and add 1 per if, ?:, &&, ||, ??, logical assignment, loop, catch, case with a test, default value and ?.; a nested function counts on its own, top-level code and types not at all. The trend follows both values over the stored snapshots.",
        reliesOn: {
            skill: "architecture",
            rule: "a service orchestrates; a rule lives in domain/, named after the rule",
        },
        misses: [
            "A rule in a small file, or one split over several files.",
            "Kotlin, JavaScript and .mjs scripts: only TypeScript is read.",
            "A PR that leaves code lines and complexity unchanged adds no trend point, so the trend shows when a file changed size, not how often it changed.",
        ],
        reportsWrongly: [
            "Size is a weak sign that a file holds rules: a long table of values is large and holds none.",
            "Type-only protocol files (libs/shared/src/lib/modeler.ts) are large and hold no rules.",
            "Complexity counts branches, not their depth: a flat dispatch over many cases scores as high as nested conditions.",
        ],
        evidence: [
            {
                kind: "published",
                reference:
                    "McCabe, A Complexity Measure, IEEE Transactions on Software Engineering, 1976",
            },
            {
                kind: "published",
                reference:
                    "ESLint 10.13 complexity rule, classic variant (https://eslint.org/docs/latest/rules/complexity)",
            },
            {
                kind: "published",
                reference: "cloc, code lines (https://github.com/AlDanial/cloc)",
            },
            {
                kind: "trial",
                commit: "bb6ae7ae",
                outcome:
                    "throwaway ESLint run over the 59 non-spec service files of libs/modeler-core: 8 files over 300 lines, 7 functions over complexity 10; BpmnLintConfigService.ts at 635 lines before issue 1799, 348 after",
            },
            {
                kind: "trial",
                commit: "e8c92425",
                outcome:
                    "ESLint 10.13 with complexity 0 over the 827 measured files it lints: 6,627 functions, none differs in complexity or line; 74 over complexity 10, 8 of them in libs/modeler-core services (verifyActive 23, flushIntoDocument 22, run 18, requestFlush 15, handleReply 13, read 13, carryOut 12, setElementTemplates 11)",
            },
        ],
        groups: SIZE_AND_COMPLEXITY_GROUPS,
        values: SIZE_AND_COMPLEXITY_VALUES,
        changesView: "grown-values",
        findFindings: ({ repoRoot }) => sizeAndComplexityFindings(sources.read(repoRoot)),
    });
}
