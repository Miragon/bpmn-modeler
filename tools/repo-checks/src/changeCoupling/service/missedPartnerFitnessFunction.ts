import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import { HISTORY_WINDOW, MECHANICAL_COMMIT_KINDS } from "../../history/domain/commitHistory";
import type { CommitHistory } from "../../history/port/CommitHistory";
import { baseHistoryWindow } from "../../history/service/historyWindows";
import { missedPartnerFindings } from "../domain/missedPartnerFindings";
import { REPLAY_LOOK_AHEAD } from "../domain/missedPartnerReplay";
import { MISSED_PARTNER_THRESHOLDS, missedPartnersOfChange } from "../domain/missedPartners";
import type { SourceStructure } from "../port/SourceStructure";
import { MISSED_PARTNER_EVIDENCE } from "./missedPartnerEvidence";

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
        version: 3,
        categories: { scope: "atomic", cadence: "triggered", result: "dynamic" },
        measures: `Files the branch changed (the working tree against the merge base, renames followed) without a partner they usually change with. A rule file → partner is mined from the ${HISTORY_WINDOW} first-parent commits up to the merge base and warns when the partner did not change. On a stacked PR, whose merge base is on its base branch, those commits end where that base branch meets the default branch, and the base branch is mined in front of them as the one change its squash will land as. A warning needs at least ${minSharedChanges} shared changes, confidence (shared ÷ the file's revisions) of at least ${minConfidencePercent} % and lift (confidence ÷ the partner's share of counted changesets) of at least ${minLift}. Counted and read as change-coupling: no ${MECHANICAL_COMMIT_KINDS} commits, none with more than ${maxChangesetSize} read files, none without a read file; generated files, the tracked files git check-attr marks linguist-generated, such as the translation overlays the root .gitattributes marks, are never read. The base and every snapshot measure no change and hold no warning, so each warning is new.`,
        reliesOn: {
            skill: "tdd",
            rule: "files that changed together in the past are likely to need a change together again (Zimmermann et al.)",
        },
        misses: [
            `A partner with fewer than ${minSharedChanges} shared changes, so a copy that is new has no history to warn from.`,
            `A partner below ${minConfidencePercent} % confidence or a lift of ${minLift}, such as one that changed in 18 of 20 changes.`,
            "The known lint-config copy: LintConfigService.ts changed in 5 of 15 changes to BpmnLintConfigService.ts (33 %, lift 9.7 at f9560b0a).",
            "Files change-coupling does not read: specs, barrels, build configs, test folders and files .gitattributes marks linguist-generated.",
            "Untracked files: git diff lists tracked changes only.",
            "Shared changes from a stack of several PRs below the branch: the stack is mined as one change where main gets one squash each, so a partner can fall short on the stacked PR and warn after the retarget.",
        ],
        reportsWrongly: [
            `A stacked PR's base branch is mined even when its squash would not count: it carries no PR title, so a ${MECHANICAL_COMMIT_KINDS} PR below the branch counts as a change.`,
            "A file and a partner that different PRs of a stack below the branch changed: the stack is mined as one change, so they count as changed together until main holds one squash each (PR 2530 at 1ece3da8: mergeTexts.ts → mergeMode.ts, from PRs 2528 and 2529).",
            "A --default-branch ref that lags a newer --base, such as a stale local origin/main: the window then ends where the merge base meets that older ref, the default branch's newer squashes count as one base-branch change, and the window reaches as many commits further back, so a partner can reach the thresholds and warn. A stack of several PRs below the branch reaches back the same way, by its number of PRs.",
            "Frequently changed partners: in the trial on 773f8014, 381 of 714 warnings named a partner with at least 20 revisions and hit 35 % against 34 % by chance. The chosen thresholds still warn at a chance rate of 19.8 % in the replay.",
            "Co-change is a habit, not a rule: a partner that usually changed along may have no reason to change this time.",
            `The replay counts a hit when the partner changed within ${REPLAY_LOOK_AHEAD} commits; drift is rarely fixed that fast, so its precision is a rough guide.`,
        ],
        evidence: MISSED_PARTNER_EVIDENCE,
        // The review reads its warnings and judges them; on a pull request most were false.
        changesView: "full-report-only",
        findFindings: (context) => {
            const change = history.changesSince(context.repoRoot, context.changeBase);
            if (change.length === 0) {
                return [];
            }
            const window = baseHistoryWindow(history, context);
            if (window.kind === "tooShort") {
                throw new InsufficientHistory(window.reason);
            }
            return missedPartnerFindings(
                missedPartnersOfChange(sources.read(context.repoRoot), change, window.commits),
            );
        },
    });
}
