import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import {
    HISTORY_WINDOW,
    HISTORY_WINDOW_READ_DEPTH,
    historyWindow,
    withBranchAsOneChange,
} from "../../history/domain/commitHistory";
import type { CommitHistory } from "../../history/port/CommitHistory";
import { changeCouplingInTree, CODE_MAAT_THRESHOLDS } from "../domain/changeCoupling";
import { CHANGE_COUPLING_GROUPS, changeCouplingFindings } from "../domain/changeCouplingFindings";
import type { SourceStructure } from "../port/SourceStructure";

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
        version: 3,
        categories: { scope: "holistic", cadence: "triggered", result: "dynamic" },
        measures: `Pairs of files that changed together in the ${HISTORY_WINDOW} first-parent commits up to the merge base (one squash-merged PR each) and the branch's change in front of them, without an import between them. The branch counts as the one PR its squash will land as: the working tree against the merge base, uncommitted edits included, untracked files not. A pair is listed with at least ${minSharedChanges} shared changes and a degree (shared changes ÷ the mean of both files' revisions × 100) of at least ${minDegreePercent} %, so each file has at least ${minSharedChanges} revisions. Not counted: chore(deps), chore(main), chore(format) and style commits, and commits with more than ${maxChangesetSize} read files, the branch's change included, as its squash would not count; renames are followed through every commit. Read: non-spec TypeScript and every .json file under a workspace's src/, Kotlin under src/main/, .mjs scripts outside build configs, none of them in a test folder, and a manifest that contributes to its host. Not read: barrels, and generated files, the tracked files git check-attr marks linguist-generated (bare or =true), such as the translation overlays in libs/bpmn-i18n-extras/src/languages/ that the root .gitattributes marks; git reads nested .gitattributes files too, and the local .git/info/attributes and core.attributesFile, which CI does not have. A spec fails when a linguist-generated pattern of a tracked .gitattributes matches no tracked file. An import through an alias or a barrel links to the file that declares the name.`,
        reliesOn: {
            skill: "tdd",
            rule: "a rule has one home; things that change for the same reason at the same time belong together (Common Closure Principle)",
        },
        misses: [
            "Drifted copies: a copy that changed without the other has low co-change. Recall on 9 known copies was 1 of 9 in the trial of 2026-10-31.",
            "Copies in a frequently changed file: its revisions dilute the degree (the auth types in libs/shared/src/lib/modeler.ts).",
            "Copies in build configs (*.config.*), which are not read.",
            "A copy between two declarations of one file: it measures whole files.",
        ],
        reportsWrongly: [
            "Pairs around composition roots, which couple by design; they are marked, not dropped.",
            "Kotlin pairs: Kotlin files carry no import edges, so a Kotlin pair is never linked.",
            "Pairs of a generated file that .gitattributes does not mark linguist-generated, with its generator or its siblings: it is read like any other file. Unmarked, the 13 translation overlays of libs/bpmn-i18n-extras turn 53 findings into 130 at c001a82f. A tree from before the marks, such as the base of the PR that adds them, reads them.",
            "Pairs of a checked-in JSON snapshot with the code it is taken from: the bridge's protocol.json is the snapshot of its descriptor that protocol.spec.ts deep-equals, so descriptor.ts and types.ts change with it by construction.",
            "A pair explained by a shared import can still hide a copy (VsCodeStatusBar.ts ↔ BpmnLintConfigService.ts, the structural cause of issue 1799); it is listed under explained, not dropped.",
            "The branch's change counts even when its squash would not: it carries no PR title, so a chore(deps), chore(main), chore(format) or style PR counts as a change.",
            `A pair the branch did not touch can enter or leave when the branch deletes, adds or renames a file, or makes a barrel of one: a past commit then holds a different number of read files and can cross the ${maxChangesetSize}-file limit.`,
        ],
        evidence: [
            {
                kind: "published",
                reference:
                    "Gall, Hajek, Jazayeri, Detection of Logical Coupling Based on Product Release History, ICSM 1998",
            },
            {
                kind: "published",
                reference:
                    "Zimmermann, Weißgerber, Diehl, Zeller, Mining Version Histories to Guide Software Changes, ICSE 2004 / IEEE TSE 2005",
            },
            {
                kind: "published",
                reference:
                    "Moonen, Di Alesio, Binkley, Rolfsnes, Practical Guidelines for Change Recommendation using Association Rule Mining, ASE 2016",
            },
            {
                kind: "published",
                reference:
                    "D'Ambros, Lanza, Robbes, On the Relationship Between Change Coupling and Software Defects, WCRE 2009",
            },
            {
                kind: "published",
                reference:
                    "Tornhill, code-maat (https://github.com/adamtornhill/code-maat), default thresholds min-revs 5, min-shared-revs 5, min-coupling 30 %, max-changeset-size 30",
            },
            {
                kind: "trial",
                commit: "c53e97f0",
                outcome:
                    "924 first-parent commits, code-maat thresholds, imports resolved by symbol: 127 coupled pairs, 63 linked, 36 explained, 28 hidden; BpmnLintConfigService.ts ↔ LintConfigService.ts listed, the only one of 9 known copies",
            },
            {
                kind: "trial",
                commit: "773f8014",
                outcome:
                    "71 hidden pairs before the explained, barrel and config filters; each co-changes at least 3.8 times as often as two independent files would (lift), hypergeometric p below 0.001",
            },
            {
                kind: "trial",
                commit: "7d0ba862",
                outcome:
                    "recount with this function: 129 coupled pairs, 64 linked, 32 explained, 33 hidden; the lint-config copy listed, no port and adapter linked through hostPorts.ts hidden; 6 shared changes or a degree of 35 % lose the copy, counting changeset size over all files loses it too",
            },
            {
                kind: "trial",
                commit: "fe75e584",
                outcome:
                    "version 2, rows new/resolved before → after. Each PR head (pull/<n>/head) against its baseRefOid: PR 2047 at 3d1b19b3 against 452b6440 (38 commits, 3 merges) 10/15 → 0/0; PRs 2170 2/3 → 0/0, 2172 3/2 → 0/0, 2173 2/3 → 0/0, 2174 2/3 → 0/0, 2177 2/3 → 0/0, 2178 0/1 → 0/1, 2179 0/0 → 0/0, 2180 3/2 → 3/2, 2181 0/5 → 0/0, 2184 1/6 → 0/0, 2188 1/2 → 0/0, 2190 2/6 → 0/0; over 28 PRs 46/79 → 3/8, of them on files the branch did not touch 92 → 1. GitHub's test merge of 27 PRs: 10/8 → 3/8, on untouched files 8 → 1; PRs 2255, 2256 and 2257 lose BridgeScriptEditor.ts ↔ apps/vscode-plugin/src/main.ts, PRs 2332 and 2333 ModelerSettingsConfigurable.kt ↔ apps/vscode-plugin/package.json. The one row left: PR 2180 deletes and re-adds a bootstrap.ts, so a past commit falls from 31 to 30 read files and counts. Dropping the oldest base commit, for a window of 924, brings back 7 new rows on untouched files in 6 PRs. The 28 merge-base trees and 28 stored snapshots (every 20th of 558, 8c726cbd to fe75e584) keep their findings",
            },
            {
                kind: "trial",
                commit: "c001a82f",
                outcome:
                    "version 3 against version 2: 50 to 53 findings. Reading every .json file under src/ instead of *.schema.json and *.cases.json adds the bridge's protocol.json and the two theme files of libs/standalone-extension. 6 pairs come in, all across-languages with protocol.json: descriptor.ts (17 PRs, 87 %) and types.ts (15, 71 %), the snapshot's sources; CoreProcess.kt (9, 56 %), HostUiRouter.kt (5, 37 %) and EditorSessionRouter.kt (5, 30 %), the RPC protocol's Kotlin half, which no spec pins (issue 2223); and the composition root editorSessionFeature.ts (5, 32 %). The themes add none. 3 pairs leave: ModelerSettingsConfigurable.kt and ModelerSettingsStore.kt ↔ VsCodeSettings.ts (53 % and 63 %) and CoreProcess.kt ↔ RpcResults.kt (48 %), each at 5 shared changes; PR 2172 (75786e96) also changes protocol.json, now crosses the 30-file limit and takes one shared change from each. Declaring the 13 overlay files linguist-generated instead of skipping every folder named languages skips the same files; without the declaration the tree has 130 findings. 0.61 to 0.65 s per tree warm, version 2 0.56 to 0.57 s in the same runs (one git check-attr over the tracked files)",
            },
        ],
        groups: CHANGE_COUPLING_GROUPS,
        findFindings: ({ repoRoot, changeBase }) => {
            const window = historyWindow(
                history.firstParentCommits(repoRoot, changeBase, HISTORY_WINDOW_READ_DEPTH),
            );
            if (window.kind === "tooShort") {
                throw new InsufficientHistory(window.reason);
            }
            const commits = withBranchAsOneChange(
                window.commits,
                history.changesSince(repoRoot, changeBase),
            );
            return changeCouplingFindings(changeCouplingInTree(sources.read(repoRoot), commits));
        },
    });
}
