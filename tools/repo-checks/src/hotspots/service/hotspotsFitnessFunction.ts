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
import type { SourceMeasures } from "../../sourceFiles/port/SourceMeasures";
import { HOTSPOT_LIMIT, hotspotFindings, rankHotspots } from "../domain/hotspots";
import { HOTSPOTS_EVIDENCE } from "./hotspotsEvidence";

export interface HotspotsPorts {
    readonly history: CommitHistory;
    readonly sources: SourceMeasures;
}

export function createHotspotsFitnessFunction({
    history,
    sources,
}: HotspotsPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "hotspots",
        version: 3,
        categories: { scope: "holistic", cadence: "triggered", result: "dynamic" },
        measures: `The ${HOTSPOT_LIMIT} files with the highest score = revisions × code lines among the files size-and-complexity measures, ranked descending; ties go by revisions, then code lines, then path. Barrels are not ranked: files with no statement other than imports and re-exports, the test that keeps them out of change-coupling. Revisions: the commits among the ${HISTORY_WINDOW} first-parent commits up to the merge base (one squash-merged PR each) that changed the file, renames followed, and one more when the branch changed it: the branch counts as the one revision its squash will land as, the working tree against the merge base, uncommitted edits included. chore(deps), chore(main), chore(format) and style commits are not counted. Unlike change-coupling's revisions, a commit with many files counts: code-maat cuts changeset size for coupling only. The product is this function's, not Tornhill's script's: maat-scripts' merge_comp_freqs.py sorts by revisions only, and his hotspot view draws code lines as circle area and revisions as fill opacity; the score multiplies the two. No trend of its own: the per-file trend is size-and-complexity's, joined by path.`,
        reliesOn: {
            skill: "architecture",
            rule: "a service orchestrates; a rule lives in domain/, named after the rule",
        },
        misses: [
            "A rule in a small file, or in one that rarely changes.",
            "Kotlin, JavaScript and .mjs scripts: only TypeScript is read.",
        ],
        reportsWrongly: [
            "Hotspots are heuristics: config-like files change often and hold no rules.",
            "Type-only protocol files (libs/shared/src/lib/modeler.ts) rank high and hold no rules.",
            "A file that re-exports through declarations of its own, such as packages/bpmn-modeler/src/index.ts (`export const DiffViewer = DiffViewerImpl`), is no barrel to the test and is ranked.",
            `Files that enter or leave the top ${HOTSPOT_LIMIT} because a file the branch touched moved past them, up or down, or was deleted. Every file that enters pushes the last one out, which shows as resolved, and every file that leaves pulls the next one in, which shows as new.`,
            "The branch's change counts even when its squash would not: it carries no PR title, so a chore(deps), chore(main), chore(format) or style PR adds a revision.",
        ],
        evidence: HOTSPOTS_EVIDENCE,
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
            return hotspotFindings(rankHotspots(commits, sources.read(repoRoot)));
        },
    });
}
