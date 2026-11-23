import type { EvidenceList } from "../../fitness/domain/fitnessFunction";
import { REPLAY_LOOK_AHEAD, REPLAYED_COMMITS } from "../domain/missedPartnerReplay";

export const MISSED_PARTNER_EVIDENCE = [
    {
        kind: "published",
        reference:
            "Zimmermann, Weißgerber, Diehl, Zeller, Mining Version Histories to Guide Software Changes (ROSE), ICSE 2004 / IEEE TSE 2005",
    },
    {
        kind: "published",
        reference:
            "Moonen, Di Alesio, Binkley, Rolfsnes, Practical Guidelines for Change Recommendation using Association Rule Mining, ASE 2016",
    },
    {
        kind: "trial",
        commit: "773f8014",
        outcome: `throwaway replay of ${REPLAYED_COMMITS} commits, confidence at least 30 %: 714 warnings; 381 named a partner with at least 20 revisions and hit 35 % against 34 % by chance; a lift of at least 4 left 576 and widened the margin over chance from 5 to 13 points, added value of at least 0.3 to 8`,
    },
    {
        kind: "trial",
        commit: "f9560b0a",
        outcome: `fitness missed-partner replay, 194 of ${REPLAYED_COMMITS} commits not mechanical, a hit when the partner changed within the next ${REPLAY_LOOK_AHEAD}: 60 % confidence and lift 4 give 155 warnings, precision 31.6 % against 19.8 % by chance (11.8 points); without a lift floor 60 % gives 157 warnings, 31.2 % against 20.2 % (11.0 points), the 2 the floor drops all misses; 30 % without a lift floor 814 warnings, 25.3 % against 25.6 %; 30 % with lift 4 631 warnings, 7.0 points; 70 % and 80 % with lift 4 keep the margin (11.5, 11.7) at 94 and 46 warnings; lift 8 at 60 % drops 24 warnings that hit as often (8 of 24) as the rest`,
    },
    {
        kind: "trial",
        commit: "c001a82f",
        outcome: `version 2, which reads every .json file under src/ and skips declared generated files, against version 1 in fitness missed-partner replay, 192 of ${REPLAYED_COMMITS} commits not mechanical: at the chosen thresholds 103 to 107 warnings, 27 to 28 hits, precision 26.2 % both, chance 20.1 % to 20.8 %, margin 6.1 to 5.4 points; lift 8 85 to 89 warnings, margin 8.6 to 8.8. No change on main, so 0 warnings in either version and a return in 0.01 s; a branch run, the PR's tree against c001a82f, 0.38 to 0.50 s warm, version 1 0.37 to 0.39 s in the same session`,
    },
    {
        kind: "trial",
        commit: "bb4be688",
        outcome:
            "version 3 against version 2 in the full report, which no comment shows: the comment versions of trial 2398 on PRs 2382, 2518, 2521, 2527, 2528 and 2530, each head against the base its comment named, default branch origin/main. New warnings on the 24 stacked heads 28 → 2: PR 2518 1 → 0 on each of 4 heads (diffPaneRouter.ts → diffPaneCommands.ts, in 6 of 9 changes), PR 2382 1 → 0 at 73c0da1e (viewState.ts → catalogFilter.ts), PR 2527 3 → 0 on each of 5 (mergeMode.ts → mergeTexts.ts, MergeDecisionService.ts → BpmnDiffService.ts and → diffPaneRouter.ts), PRs 2528 and 2521 1 → 0 on each of 5 and 3 (mergePaneMessages.ts → MergeDecisionService.ts); PR 2530 at 1ece3da8 0 → 2: mergeTexts.ts → mergePaneMessages.ts, which its last version against main warns too, and mergeTexts.ts → mergeMode.ts, changed by PRs 2528 and 2529, one change on that stack. The 8 runs against main keep their warnings",
    },
] as const satisfies EvidenceList;
