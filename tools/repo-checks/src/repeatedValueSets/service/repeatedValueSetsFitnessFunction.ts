import { defineFitnessFunction, type FitnessFunction } from "../../fitness/domain/fitnessFunction";
import { repeatedValueSetFindings } from "../domain/repeatedValueSets";
import type { ValueSetSources } from "../port/ValueSetSources";

export interface RepeatedValueSetsPorts {
    readonly sources: ValueSetSources;
}

export function createRepeatedValueSetsFitnessFunction({
    sources,
}: RepeatedValueSetsPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "repeated-value-sets",
        version: 1,
        categories: { scope: "atomic", cadence: "triggered", result: "static" },
        measures:
            "Sets of allowed string values written in two or more files: an array literal of string literals only, a union type of string literal types only, and a maximal || chain of === comparisons of one subject with string literals. A set has at least 2 distinct values; the order and repeats of its values do not matter. One finding per occurrence, naming every other occurrence of the set: a copy a branch adds is new, and so is the home of a set that was in one file only at the base. Read: every tracked .ts, .tsx, .mts, .cts, .js, .jsx, .mjs and .cjs file, without specs, tests, declaration files and build configs (*.config.*). No folder is excluded and no home is declared.",
        reliesOn: {
            skill: "architecture",
            rule: "a value set has one home; every other use imports it or is pinned to it by a spec or a compile-time assertion",
        },
        misses: [
            "Partial and extended copies: 9 of the 12 modeler languages (issue 1983), IGNORED_WATCH_DIRS as EXCLUDED_DIRS plus three folders.",
            "Copies that live in logic, such as the allMatch parsing of the element template builder.",
            "Sets with another member: `| undefined`, a spread, an enum, object keys, switch cases, and !== or && chains.",
            "Kotlin and JSON, such as the enum arrays of a package.json or a JSON schema.",
        ],
        reportsWrongly: [
            "Sets equal by coincidence: the bpmn-js popup menu ids, the log levels of two test fakes, the npm dependency field names, git arguments, typeof chains and name|value unions.",
            "A copy pinned to its home by a spec or a type-level equality assertion stays listed: the pin is not read.",
            "A set in a renamed file shows as new, because the key names the file.",
        ],
        evidence: [
            {
                kind: "published",
                reference:
                    "Juergens, Deissenboeck, Hummel, Wagner, Do Code Clones Matter?, ICSE 2009: inconsistent changes to clones are frequent, and many of the unintended ones are faults",
            },
            {
                kind: "trial",
                commit: "3d1b19b3",
                outcome:
                    "PR 2047: lists 3 of the 5 rule sets its review named as duplicated, identical copies inside one branch before any drift: the FEEL types (transforms.ts:16, TemplateBuilder.tsx:1028), the placeholder types (transforms.ts:17, TemplateBuilder.tsx:825, :1064) and the condition operators (conditions.ts:1, :11, entries.tsx:145); misses the allMatch parsing and the known-key lists",
            },
            {
                kind: "trial",
                commit: "265f3472",
                outcome:
                    "41 sets in home folders, three of them repeated, all known; exact set equality misses the partial copies",
            },
            {
                kind: "trial",
                commit: "bed5599f",
                outcome:
                    "first run: 606 sets in 853 files, 38 of them in two or more files (14 with 3 or more values), 112 findings; the auth types, the theme modes and the bpmn-js popup ids among them, about 0.4 s per tree",
            },
        ],
        findFindings: ({ repoRoot }) => repeatedValueSetFindings(sources.read(repoRoot)),
    });
}
