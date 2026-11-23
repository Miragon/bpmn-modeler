import type { EvidenceList } from "../../fitness/domain/fitnessFunction";

export const REPEATED_VALUE_SETS_EVIDENCE = [
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
] as const satisfies EvidenceList;
