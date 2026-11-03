import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import type { CommitHistory } from "../../history/port/CommitHistory";
import {
    CHANGE_COUPLING_WINDOW,
    changeCouplingInTree,
    CODE_MAAT_THRESHOLDS,
} from "../domain/changeCoupling";
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
        version: 1,
        categories: { scope: "holistic", cadence: "triggered", result: "dynamic" },
        measures: `Pairs of files that changed together in the ${CHANGE_COUPLING_WINDOW} most recent first-parent commits (one squash-merged PR each) without an import between them. A pair is listed with at least ${minSharedChanges} shared changes and a degree (shared changes ÷ the mean of both files' revisions × 100) of at least ${minDegreePercent} %, so each file has at least ${minSharedChanges} revisions. Not counted: chore(deps), chore(main), chore(format) and style commits, and commits with more than ${maxChangesetSize} read files; renames are followed through every commit. Read: non-spec TypeScript under a workspace's src/, Kotlin under src/main/, .mjs scripts outside build configs and test folders, *.schema.json, *.cases.json and a manifest that contributes to its host. Barrels are not read; an import through an alias or a barrel links to the file that declares the name.`,
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
            "A pair explained by a shared import can still hide a copy (VsCodeStatusBar.ts ↔ BpmnLintConfigService.ts, the structural cause of issue 1799); it is listed under explained, not dropped.",
            "Pairs that enter or leave the delta because the window slid, not because the branch touched them.",
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
        ],
        groups: CHANGE_COUPLING_GROUPS,
        findFindings: ({ repoRoot, commit }) => {
            // The commit after the window proves its oldest commit has a parent to diff against.
            const commits = history.firstParentCommits(
                repoRoot,
                commit,
                CHANGE_COUPLING_WINDOW + 1,
            );
            if (commits.length <= CHANGE_COUPLING_WINDOW) {
                throw new InsufficientHistory(
                    `${commits.length} first-parent commits reach back from here; the window needs ${CHANGE_COUPLING_WINDOW} and the parent of the oldest`,
                );
            }
            return changeCouplingFindings(
                changeCouplingInTree(
                    sources.read(repoRoot),
                    commits.slice(0, CHANGE_COUPLING_WINDOW),
                ),
            );
        },
    });
}
