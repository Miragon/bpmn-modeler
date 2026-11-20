import type { EvidenceList } from "../../fitness/domain/fitnessFunction";

export const SIZE_AND_COMPLEXITY_EVIDENCE = [
    {
        kind: "published",
        reference: "McCabe, A Complexity Measure, IEEE Transactions on Software Engineering, 1976",
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
    {
        kind: "trial",
        commit: "2e447ab7",
        outcome:
            "Version 2 against version 1: 1,542 to 1,351 findings, 191 dropped, none added, every other file's values the same. Dropped: 49 modules of constants (1,972 code lines: the bridge's protocol tables, the webviews' command lists, deployment-webview's formTemplate.ts at 185 and packages/bpmn-modeler/src/index.ts at 108, which renames imports as constants), 108 type-only files (2,056, 63 ports among them; the largest the bridge's protocol types.ts at 344), 19 barrels (822, libs/modeler-core/src/index.ts at 285) and 15 modules whose default export computes nothing (7,023: the 12 translation overlays of libs/bpmn-i18n-extras at 527 to 608, two bpmn-js module definitions of libs/properties-panel and one declared JSON case list). With the evidence of 8 fitness functions moved into a module of its own beside each definition, those definitions shrink by 16 to 55 code lines (changeCouplingFitnessFunction.ts 121 to 66, hostTextFitnessFunction.ts 73 to 49) and the evidence modules are not measured. Telling a module that runs no code takes 4 to 32 ms over the 1,542 parsed trees, reading the tree 1.6 to 6.2 s in the same runs",
    },
] as const satisfies EvidenceList;
