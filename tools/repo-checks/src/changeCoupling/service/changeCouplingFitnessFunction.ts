import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import { HISTORY_WINDOW, MECHANICAL_COMMIT_KINDS } from "../../history/domain/commitHistory";
import type { CommitHistory } from "../../history/port/CommitHistory";
import { branchHistoryWindow } from "../../history/service/historyWindows";
import {
    changeCouplingInTree,
    CODE_MAAT_THRESHOLDS,
    MIN_EXPLAINING_SHARE_PERCENT,
} from "../domain/changeCoupling";
import { CHANGE_COUPLING_GROUPS, changeCouplingFindings } from "../domain/changeCouplingFindings";
import type { SourceStructure } from "../port/SourceStructure";
import { CHANGE_COUPLING_EVIDENCE } from "./changeCouplingEvidence";

export interface ChangeCouplingPorts {
    readonly history: CommitHistory;
    readonly sources: SourceStructure;
}

export function createChangeCouplingFitnessFunction({
    history,
    sources,
}: ChangeCouplingPorts): FitnessFunction {
    const { minSharedChanges, minDegreePercent, maxChangesetSize } = CODE_MAAT_THRESHOLDS;
    return defineFitnessFunction({
        id: "change-coupling",
        version: 4,
        categories: { scope: "holistic", cadence: "triggered", result: "dynamic" },
        measures: `Pairs of files that changed together in the ${HISTORY_WINDOW} first-parent commits up to the merge base (one squash-merged PR each) and the branch's change in front of them, without an import between them. The branch counts as the one PR its squash will land as: the working tree against the merge base, uncommitted edits included, untracked files not. On a stacked PR, whose merge base is on its base branch, the window ends where that base branch meets the default branch, and the base branch counts as the one PR its squash will land as, in front of the window and behind the branch. A pair is listed with at least ${minSharedChanges} shared changes and a degree (shared changes ÷ the mean of both files' revisions × 100) of at least ${minDegreePercent} %, so each file has at least ${minSharedChanges} revisions. A pair whose two files import a third that changed in at least ${MIN_EXPLAINING_SHARE_PERCENT} % of their shared changes is listed as explained by that import. Not counted: ${MECHANICAL_COMMIT_KINDS} commits, and commits with more than ${maxChangesetSize} read files, the branch's change included, as its squash would not count; renames are followed through every commit. Read: non-spec TypeScript and every .json file under a workspace's src/, Kotlin under src/main/, .mjs scripts outside build configs, none of them in a test folder, and a manifest that contributes to its host. Not read: barrels, and generated files, the tracked files git check-attr marks linguist-generated (bare or =true), such as the translation overlays in libs/bpmn-i18n-extras/src/languages/ that the root .gitattributes marks; git reads nested .gitattributes files too, and the local .git/info/attributes and core.attributesFile, which CI does not have. A spec fails when a linguist-generated pattern of a tracked .gitattributes matches no tracked file. An import through an alias or a barrel links to the file that declares the name.`,
        reliesOn: {
            skill: "tdd",
            rule: "a rule has one home; things that change for the same reason at the same time belong together (Common Closure Principle)",
        },
        misses: [
            "Drifted copies: a copy that changed without the other has low co-change. Recall on 9 known copies was 1 of 9 in the trial of 2026-10-31.",
            "Copies in a frequently changed file: its revisions dilute the degree (the auth types in libs/shared/src/lib/modeler.ts).",
            "Copies in build configs (*.config.* outside a workspace's src/, and .mjs ones anywhere), which are not read.",
            "A copy between two declarations of one file: it measures whole files.",
            "A pair whose shared changes come from a stack of several PRs below the branch: the stack counts as one change where main gets one squash each, so the pair can be missing on the stacked PR and enter after the retarget.",
        ],
        reportsWrongly: [
            "Pairs around composition roots, which couple by design; they are marked, not dropped.",
            "Kotlin pairs: Kotlin files carry no import edges, so a Kotlin pair is never linked.",
            "Pairs of a generated file that .gitattributes does not mark linguist-generated, with its generator or its siblings: it is read like any other file. Unmarked, the 13 translation overlays of libs/bpmn-i18n-extras turn 53 findings into 130 at c001a82f. A tree from before the marks, such as the base of the PR that adds them, reads them.",
            "Pairs of a checked-in JSON snapshot with the code it is taken from: the bridge's protocol.json is the snapshot of its descriptor that protocol.spec.ts deep-equals, so the feature protocol/domain/*Protocol.ts modules that descriptor.ts aggregates change with it by construction.",
            "A pair explained by a shared import can still hide a copy (VsCodeStatusBar.ts ↔ BpmnLintConfigService.ts, the structural cause of issue 1799); it is listed under explained, not dropped.",
            `The branch's change, and a stacked PR's base branch, count even when their squash would not: they carry no PR title, so a ${MECHANICAL_COMMIT_KINDS} PR counts as a change.`,
            "Two files that different PRs of a stack below the branch changed: the stack counts as one change, so they share a change that main holds as two squashes.",
            "A --default-branch ref that lags a newer --base, such as a stale local origin/main: the window then ends where the merge base meets that older ref, the default branch's newer squashes count as one base-branch change, and the window reaches as many commits further back, so a pair can enter or change its count. A stack of several PRs below the branch reaches back the same way, by its number of PRs.",
            `A pair the branch did not touch can enter or leave when the branch deletes, adds or renames a file, or makes a barrel of one: a past commit then holds a different number of read files and can cross the ${maxChangesetSize}-file limit.`,
            `A pair the branch's own change makes new disappears once that change grows past ${maxChangesetSize} read files, as its squash would not count: that looks like a fix, and the pair shows as new again on the next PR that changes both files.`,
            "Files of one feature that change together because the feature grows over consecutive PRs, with no value or rule in common: the co-change follows the feature's pace, not a copy.",
            "A pair whose import, or whose mirrored type, the branch removes or moves: the pair is no longer linked at HEAD and shows as new, though the branch copied nothing.",
            "A pair that a spec links with a type pin such as toEqualTypeOf: specs are not read, so two pinned mirror declarations, or a file typed by one side and the file that declares the other, show as hidden.",
            "A file that reaches the other's rule through a chain of typed calls and holds no copy of it: only an import of the other file, or of the file that declares the imported name, links a pair.",
            `Two files that share an import whose file is new: a shared import explains a pair only when it changed in at least ${MIN_EXPLAINING_SHARE_PERCENT} % of the pair's shared changes, so a module both files began to use recently leaves the pair hidden.`,
        ],
        evidence: CHANGE_COUPLING_EVIDENCE,
        groups: CHANGE_COUPLING_GROUPS,
        // Most new rows on pull requests were false and few were fixed; the review reads them all.
        changesView: "full-report-only",
        findFindings: (context) => {
            const window = branchHistoryWindow(history, context);
            if (window.kind === "tooShort") {
                throw new InsufficientHistory(window.reason);
            }
            return changeCouplingFindings(
                changeCouplingInTree(sources.read(context.repoRoot), window.commits),
            );
        },
    });
}
