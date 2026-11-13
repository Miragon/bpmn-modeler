import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import {
    HISTORY_WINDOW,
    HISTORY_WINDOW_READ_DEPTH,
    historyWindow,
} from "../../history/domain/commitHistory";
import type { CommitHistory } from "../../history/port/CommitHistory";
import { missedPartnerFindings } from "../domain/missedPartnerFindings";
import { REPLAY_LOOK_AHEAD, REPLAYED_COMMITS } from "../domain/missedPartnerReplay";
import { MISSED_PARTNER_THRESHOLDS, missedPartnersOfChange } from "../domain/missedPartners";
import type { SourceStructure } from "../port/SourceStructure";

export interface MissedPartnerPorts {
    readonly history: CommitHistory;
    readonly sources: SourceStructure;
}

export function createMissedPartnerFitnessFunction({
    history,
    sources,
}: MissedPartnerPorts): FitnessFunction {
    const { minSharedChanges, minConfidencePercent, minLift, maxChangesetSize } =
        MISSED_PARTNER_THRESHOLDS;
    return defineFitnessFunction({
        id: "missed-partner",
        version: 1,
        categories: { scope: "atomic", cadence: "triggered", result: "dynamic" },
        measures: `Files the branch changed (the working tree against the merge base, renames followed) without a partner they usually change with. A rule file → partner is mined from the ${HISTORY_WINDOW} first-parent commits up to the merge base and warns when the partner did not change: at least ${minSharedChanges} shared changes, confidence (shared ÷ the file's revisions) of at least ${minConfidencePercent} % and lift (confidence ÷ the partner's share of counted changesets) of at least ${minLift}. Counted and read as change-coupling: no chore(deps), chore(main), chore(format) or style commits, none with more than ${maxChangesetSize} read files, none without a read file. The base and every snapshot measure no change and hold no warning, so each warning is new.`,
        reliesOn: {
            skill: "tdd",
            rule: "files that changed together in the past are likely to need a change together again (Zimmermann et al.)",
        },
        misses: [
            `A partner with fewer than ${minSharedChanges} shared changes, so a copy that is new has no history to warn from.`,
            `A partner below ${minConfidencePercent} % confidence or a lift of ${minLift}, such as one that changed in 18 of 20 changes.`,
            "The known lint-config copy: LintConfigService.ts changed in 5 of 15 changes to BpmnLintConfigService.ts (33 %, lift 9.7 at f9560b0a).",
            "Files change-coupling does not read: specs, barrels, build configs, test folders.",
            "Untracked files: git diff lists tracked changes only.",
        ],
        reportsWrongly: [
            "Frequently changed partners: in the trial on 773f8014, 381 of 714 warnings named a partner with at least 20 revisions and hit 35 % against 34 % by chance. The chosen thresholds still warn at a chance rate of 19.8 % in the replay.",
            "Co-change is a habit, not a rule: a partner that usually changed along may have no reason to change this time.",
            `The replay counts a hit when the partner changed within ${REPLAY_LOOK_AHEAD} commits; drift is rarely fixed that fast, so its precision is a rough guide.`,
        ],
        evidence: [
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
        ],
        // The review reads its warnings and judges them; on a pull request most were false.
        changesView: "full-report-only",
        findFindings: ({ repoRoot, changeBase }) => {
            const change = history.changesSince(repoRoot, changeBase);
            if (change.length === 0) {
                return [];
            }
            const window = historyWindow(
                history.firstParentCommits(repoRoot, changeBase, HISTORY_WINDOW_READ_DEPTH),
            );
            if (window.kind === "tooShort") {
                throw new InsufficientHistory(window.reason);
            }
            return missedPartnerFindings(
                missedPartnersOfChange(sources.read(repoRoot), change, window.commits),
            );
        },
    });
}
