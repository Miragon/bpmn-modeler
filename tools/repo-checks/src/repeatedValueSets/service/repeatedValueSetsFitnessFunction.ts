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
            'An extension list written with its dots never equals the same extensions in a pattern, which are read without them: `[".ts", ".tsx"]` in sourceTree.ts would not match an alternation (ts|tsx).',
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
                    "573 sets in 822 files, 36 of them in two or more files (13 with 3 or more values), 106 findings; the auth types, the theme modes and the bpmn-js popup ids among them, about 0.5 s per tree. A scratch pin of AuthTypePayload to TargetAuthType through the @miragon/bpmn-modeler-shared barrel cleared the auth types' 2 findings; resolving it added about 0.5 s",
            },
            {
                kind: "trial",
                commit: "4c11ae32",
                outcome:
                    'PR 2304: the marketplace listing order ["allProjects", "project"] (marketplaceRegistrations.ts:65) and its home ["project", "allProjects"] (projectScopes.ts:5) each name the other as in another order, with the type pin. The first fix reversed the home, tying the fetch order to the add prompt\'s; the final one, fd01b993, keeps the literal with satisfies and an expectTypeOf pin and gives no finding',
            },
            {
                kind: "trial",
                commit: "fe75e584",
                outcome:
                    "v1 to v2: 759 to 745 sets read, 22 to 20 sets in two or more files, 66 to 61 findings; nothing new. The 14 sets no longer read sit in 5 files of test folders; the 5 rows gone are the editor kinds and theme modes of an e2e page object (orcaEditorPage.ts, PR 2210) and their product copies. 2 rows name another order, both a typeof chain",
            },
            {
                kind: "trial",
                commit: "2e447ab7",
                outcome:
                    "v2 to v3: 917 to 949 sets read, 32 of them from 366 regular expression literals and 2 of those expanded from an optional class; 44 to 60 findings, nothing gone. The 16 new rows are 5 sets, each a real copy: (spec|test) in 7 spec patterns of tools/ and .github/scripts, which PR 2671 merges; ([mc]?ts|tsx) of hostText.ts beside (ts|tsx|mts|cts) of sourceFiles.ts; ([mc]?[jt]s|[jt]sx) of repeatedValueSets.ts beside the eight extensions of check-vitest-targets.mjs; the bpmn-js entry prefixes (append|create) of plainEntryCatalog.ts and popupMenuAnnotations.ts; and the SPIN calls (S|JSON) of localDeclarations.ts and twice processVariables.ts. Without the expansion the two extension sets, 4 rows, are missed. At 66d145d0, after PR 2671: 916 to 943 sets, 44 to 54 findings; the hostText.ts copy is gone and (spec|test) is left in testFiles.ts, check-vitest-targets.mjs and the wider unread-file pattern of repeatedValueSets.ts. Reading the alternations of its 362 regular expression literals took under 1 ms against about 0.3 s of parsing the same files",
            },
        ],
        findFindings: ({ repoRoot }) => repeatedValueSetFindings(sources.read(repoRoot)),
    });
}
