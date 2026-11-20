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
        version: 2,
        categories: { scope: "atomic", cadence: "triggered", result: "dynamic" },
        measures: `Files the branch changed (the working tree against the merge base, renames followed) without a partner they usually change with. A rule file → partner is mined from the ${HISTORY_WINDOW} first-parent commits up to the merge base and warns when the partner did not change: at least ${minSharedChanges} shared changes, confidence (shared ÷ the file's revisions) of at least ${minConfidencePercent} % and lift (confidence ÷ the partner's share of counted changesets) of at least ${minLift}. Counted and read as change-coupling: no chore(deps), chore(main), chore(format) or style commits, none with more than ${maxChangesetSize} read files, none without a read file; generated files, the tracked files git check-attr marks linguist-generated, such as the translation overlays the root .gitattributes marks, are never read. The base and every snapshot measure no change and hold no warning, so each warning is new.`,
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
        ],
        reportsWrongly: [
            "Frequently changed partners: in the trial on 773f8014, 381 of 714 warnings named a partner with at least 20 revisions and hit 35 % against 34 % by chance. The chosen thresholds still warn at a chance rate of 19.8 % in the replay.",
            "Co-change is a habit, not a rule: a partner that usually changed along may have no reason to change this time.",
            `The replay counts a hit when the partner changed within ${REPLAY_LOOK_AHEAD} commits; drift is rarely fixed that fast, so its precision is a rough guide.`,
        ],
        evidence: MISSED_PARTNER_EVIDENCE,
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
