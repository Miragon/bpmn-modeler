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
        version: 2,
        categories: { scope: "holistic", cadence: "triggered", result: "dynamic" },
        measures: `The ${HOTSPOT_LIMIT} files with the highest score = revisions × code lines among the files size-and-complexity measures, ranked descending; ties go by revisions, then code lines, then path. Barrels are not ranked: files with no statement other than imports and re-exports, the test that keeps them out of change-coupling. Revisions: the commits among the ${HISTORY_WINDOW} most recent first-parent commits (one squash-merged PR each) that changed the file, renames followed; chore(deps), chore(main), chore(format) and style commits are not counted. Unlike change-coupling's revisions, a commit with many files counts: code-maat cuts changeset size for coupling only. The product is this function's, not Tornhill's script's: maat-scripts' merge_comp_freqs.py sorts by revisions only, and his hotspot view draws code lines as circle area and revisions as fill opacity; the score multiplies the two. No trend of its own: the per-file trend is size-and-complexity's, joined by path.`,
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
            "Each commit on a branch counts as one revision until it is squash-merged, so a branch with many commits raises its files' revisions.",
            `Files that enter or leave the top ${HOTSPOT_LIMIT} for a reason other than their own change: the window slid, or a file the branch touched moved past them, up or down, or was deleted. Every file that enters pushes the last one out, which shows as resolved, and every file that leaves pulls the next one in, which shows as new.`,
        ],
        evidence: [
            {
                kind: "published",
                reference: "Tornhill, Your Code as a Crime Scene, 2015, 2nd edition 2024: hotspots",
            },
            {
                kind: "published",
                reference:
                    "Tornhill, maat-scripts (https://github.com/adamtornhill/maat-scripts): merge_comp_freqs.py sorts by revisions; crime-scene-hotspots.html draws circle area = code lines, fill opacity = revisions ÷ max revisions",
            },
            {
                kind: "trial",
                commit: "e8c92425",
                outcome:
                    "924 commits, 825 files: the top 20 holds 5 of the 8 libs/modeler-core services over 300 lines that issue 2057 names (10th to 18th; version 1 ranked the barrel libs/modeler-core/src/index.ts 9th and them 11th to 19th); ranking by revisions alone holds none of them and puts three barrels, a vitest.config.ts and a 60-line main.ts in its top 20; first is libs/shared/src/lib/modeler.ts, a type-only protocol file",
            },
            {
                kind: "trial",
                commit: "eb4fe899",
                outcome:
                    "The 428 stored snapshots with version 1 findings, 0966e35f (2026-09-30) to eb4fe899 (2026-11-06): version 1 recomputed on each tree matched its stored top 20. Version 2 drops libs/modeler-core/src/index.ts, the only barrel in any top 20 (15 to 23 barrels per tree), from 197 of them, where it ranked 8th to 20th; every file below it moves up one place, and the next file enters 20th: DeploymentService.ts 59 times, ArtifactService.ts 38, BpmnLintConfigService.ts 32, AppendMenuOverlay.tsx 24, six others 44. Nothing else changes",
            },
        ],
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
