import { defineFitnessFunction, type FitnessFunction } from "../../fitness/domain/fitnessFunction";
import { repeatedValueSetFindings } from "../domain/repeatedValueSets";
import type { ValueSetSources } from "../port/ValueSetSources";
import { REPEATED_VALUE_SETS_EVIDENCE } from "./repeatedValueSetsEvidence";

export interface RepeatedValueSetsPorts {
    readonly sources: ValueSetSources;
}

export function createRepeatedValueSetsFitnessFunction({
    sources,
}: RepeatedValueSetsPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "repeated-value-sets",
        version: 3,
        categories: { scope: "atomic", cadence: "triggered", result: "static" },
        measures:
            "Sets of allowed string values written in two or more files: an array literal of string literals only, a union type of string literal types only, a maximal || chain of === comparisons of one subject with string literals, and an alternation of words in a regular expression literal, the pattern's own or a group's. A word is word characters and hyphens, each of them or a class of word characters optionally followed by ?, and is expanded to every value it spells; an alternation with an alternative that can spell nothing, or that spells more than 64 values, is not read. A set has at least 2 distinct values; the order and repeats of its values do not matter. Files that a type equality assertion, expectTypeOf<Copy>().toEqualTypeOf<Home>() or its value form, pins to each other count as one place for every set they share. One finding per occurrence, naming every other occurrence of the set: a copy a branch adds is new, and so is the home of a set that was in one file only at the base. A finding also names the occurrences whose values, in the order of their first appearance, differ in order from its own, and the remedy for such a copy: pin it to the home's type. A set read from a regular expression is compared for no order, since no type pin can hold a pattern. Read: every tracked .ts, .tsx, .mts, .cts, .js, .jsx, .mjs and .cjs file, without specs and tests (*.spec.*, *.test.*), test folders (__fixtures__, __tests__, test, tests), declaration files and build configs (*.config.*); a pin is read from any tracked script file and resolved through barrels and the tsconfig.base.json paths. No home is declared.",
        reliesOn: {
            skill: "architecture",
            rule: "a value set has one home; every other use imports it, a TypeScript copy that cannot is pinned to it by expectTypeOf<Copy>().toEqualTypeOf<Home>(), and a copy outside TypeScript by a spec",
        },
        misses: [
            "Partial and extended copies: 9 of the 12 modeler languages (issue 1983), and at add816a2 IGNORED_WATCH_DIRS as EXCLUDED_DIRS plus six folders.",
            "Copies that live in logic, such as the allMatch parsing of the element template builder, and before PR 2341's fix the Form's default version in emptyForm.ts, taken from the BPMN registry while formEngine.ts defined the Form versions.",
            "Sets with another member: `| undefined`, a spread, an enum, object keys, switch cases, and !== or && chains.",
            'Key unions of two Pick<T, K> types of one T that share keys without being equal, such as `"badges" | "picksNotDrawn"` in the pick readers of mergeOutcomeMemory.ts and mergeElementPick.ts before PR 2621: two readers of one fact.',
            "Equal value maps: an object whose values repeat another object's, such as the pending-state texts of three domain files in PR 2274; object values are no set.",
            "Nested sets: a tuple of tuples, such as COUNT_KINDS of the DMN diff legend in PR 2359, whose kinds are a column, not one array of strings.",
            "A copy whose other occurrence is in a spec or a test folder, which are not read: SOURCE_ONLY in overlayNeeded.spec.ts and tools/build-overlay.mjs (PR 2359) gave no finding.",
            'Sets spelled inside one string, such as the braces of the glob `**/*.{bpmn,dmn}` in DeployFilesService.ts, which repeat the deployable extensions `[".bpmn", ".dmn"]` of DeployActiveDiagramService.ts.',
            "In a regular expression: a group holding a group, such as ((?:get|set)Variable(?:Local)?), of which only (get|set) is read; an optional or a class outside an alternation, such as the extensions of \\.[cm]?[jt]sx?$; an alternative with an escape, a wildcard, a range or another quantifier; and a pattern written in a string for new RegExp.",
            'An extension list written with its dots never equals the same extensions in a pattern, which are read without them: `[".ts", ".tsx"]` would not match an alternation (ts|tsx).',
            "Kotlin and JSON, such as the enum arrays of a package.json or a JSON schema.",
            "A copy of a set whose home is a dependency, outside the tracked files, such as the 12 locales of @miragon/bpmn-modeler-i18n: one tracked copy is the set's only occurrence.",
        ],
        reportsWrongly: [
            "A copy that drifts from its home, a value added to or removed from one copy only, shows as resolved, not new: each tree is measured alone, so the report reads the drift as a fix. A resolved set is a fix only where its copies are gone, import their home or are pinned to it.",
            "Sets equal by coincidence: didi `$inject` lists, the npm dependency field names, git arguments and child-process stdio values such as ignore|pipe (PR 2358), typeof chains and name|value unions.",
            "The order of a union or an || chain means nothing, yet it is compared as written: at fe75e584 the only rows naming another order are the typeof chains of the element template builder's json.ts and transforms.ts.",
            "A copy pinned by a runtime spec, such as expect(copy).toEqual(home), stays listed: only the type equality assertion is read.",
            "A pin links two files, not two declarations: it also clears any other set the two files share.",
            "A set moved to another file shows as new and its old place as resolved, because the key names the file.",
        ],
        evidence: REPEATED_VALUE_SETS_EVIDENCE,
        findFindings: ({ repoRoot }) => repeatedValueSetFindings(sources.read(repoRoot)),
    });
}
