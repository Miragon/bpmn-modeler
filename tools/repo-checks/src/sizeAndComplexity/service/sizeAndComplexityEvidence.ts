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
    {
        kind: "trial",
        commit: "5aac5ed8",
        outcome:
            "The grown-files list of the PR comment in the trial of issue 2398, version 1. Its window, PRs 2399 to 2528 in merge order (84 PRs): 513 grown rows on 63 PRs. By growth in code lines since the merge base, rows (of them without a complexity rise): complexity only 9 (0), 1 to 5 lines 267 (248), 6 to 10 lines 79 (64), 11 to 20 lines 69 (54), more than 20 lines 89 (61). Fixed in the PR with a written link 4, three of them by 20 lines or more; the fourth, diffFeature.ts in PR 2485, grew by 5 against its stack base and its trend rose in every step (16 → 23 → 55 → 78 → 99). Fixed with nothing written 6, of 1 to 7 lines; named and not fixed 5. Listing a grown row from 11 code lines, a complexity rise (or none at the base) or a rise of its code lines in each of the trend's last two steps leaves 123 of the 513 out of the comment (24 %), three rising steps 170 (33 %). After the window, PRs up to 2741 (529 grown rows on 78 PRs): the rule leaves out 111 (21 %); 25 rows were fixed in their PR with a written link, at least 20 of them named by a review's trend measures, and the rule leaves 4 of the 25 out of the comment, three rising steps 8; the reviews read the full report and lose none. Rejected: no threshold, the letter of the trial's rule, as five rows under 6 lines without a complexity rise were fixed in their PR, four of them (1 to 4 lines) with nothing written; 6 lines, which leaves out 95 rows and the same two of those four (ModelerEditorController.ts in PR 2418 and MergeDecisionService.ts in PR 2525, +1 each); 21 lines, which fails the letter on BpmnLintConfigService.ts in PR 2347, cited by a review finding at +47 (302 → 349) and left at +20 by the PR's extraction. Growth comes from the rerun of each squash commit, or the comment for a row gone at merge, and the rises from each comment's trend text; the rule as implemented, replayed on those rows, gives the 123, 4 and 111 above. 132 of the 513 rows were on files without a function, so version 2, which no longer measures a module that runs no code, would show fewer",
    },
] as const satisfies EvidenceList;
