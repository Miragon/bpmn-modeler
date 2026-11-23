import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import { HISTORY_WINDOW, MECHANICAL_COMMIT_KINDS } from "../../history/domain/commitHistory";
import type { CommitHistory } from "../../history/port/CommitHistory";
import { branchHistoryWindow } from "../../history/service/historyWindows";
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
        version: 5,
        categories: { scope: "holistic", cadence: "triggered", result: "dynamic" },
        measures: `The ${HOTSPOT_LIMIT} files with the highest score = revisions × code lines among the files size-and-complexity measures, ranked descending; ties go by revisions, then code lines, then path. A module that runs no code (a table of constants, a type-only file or a barrel) is not ranked, by size-and-complexity's test (see its measures). Revisions: the commits among the ${HISTORY_WINDOW} first-parent commits up to the merge base (one squash-merged PR each) that changed the file, renames followed, and one more when the branch changed it: the branch counts as the one revision its squash will land as, the working tree against the merge base, uncommitted edits included. On a stacked PR, whose merge base is on its base branch, the window ends where that base branch meets the default branch, and the base branch counts as the one revision its squash will land as. Not counted: ${MECHANICAL_COMMIT_KINDS} commits. Unlike change-coupling's revisions, a commit with many files counts: code-maat cuts changeset size for coupling only. The product is this function's, not Tornhill's script's: maat-scripts' merge_comp_freqs.py sorts by revisions only, and his hotspot view draws code lines as circle area and revisions as fill opacity; the score multiplies the two. No trend of its own: the per-file trend is size-and-complexity's, joined by path.`,
        reliesOn: {
            skill: "architecture",
            rule: "a service orchestrates; a rule lives in domain/, named after the rule",
        },
        misses: [
            "A rule in a small file, or in one that rarely changes.",
            "Kotlin, JavaScript and .mjs scripts: only TypeScript is read.",
            "A rule written as data or in types in a module that runs no code, such as a table that maps one value to another or a conditional type: the module is not ranked however often it changes.",
            "Revisions from a stack of several PRs below the branch: the stack counts as one revision where main gets one squash each, so a file can rank lower on the stacked PR, and another hold its place, until the retarget.",
        ],
        reportsWrongly: [
            "Hotspots are heuristics: a config file built by a call, such as a vitest.config.ts that calls defineConfig(…), runs code and is ranked when it changes often, though it holds no rules.",
            "Message classes that only hold their fields run code, their constructors, and rank high though they hold no rules (libs/shared/src/lib/modeler.ts, 1st at d55b8732).",
            "Types or a table of values beside a helper function, or a table built by a call, run code and rank by their whole size (libs/shared/src/lib/protocolMessageMap.ts, 298 code lines and two functions of complexity 1 and 2 at d55b8732; libs/bpmn-i18n-extras/src/sourceOnlyKeys.ts, `new Set([…])`).",
            `Files that enter or leave the top ${HOTSPOT_LIMIT} because a file the branch touched moved past them, up or down, or was deleted. Every file that enters pushes the last one out, which shows as resolved, and every file that leaves pulls the next one in, which shows as new.`,
            `The branch's change, and a stacked PR's base branch, count even when their squash would not: they carry no PR title, so a ${MECHANICAL_COMMIT_KINDS} PR adds a revision.`,
            "A --default-branch ref that lags a newer --base, such as a stale local origin/main: the window then ends where the merge base meets that older ref, the default branch's newer squashes count as one base-branch change, and the window reaches as many commits further back, so a file's revisions and rank change. A stack of several PRs below the branch reaches back the same way, by its number of PRs.",
        ],
        evidence: HOTSPOTS_EVIDENCE,
        findFindings: (context) => {
            const window = branchHistoryWindow(history, context);
            if (window.kind === "tooShort") {
                throw new InsufficientHistory(window.reason);
            }
            return hotspotFindings(rankHotspots(window.commits, sources.read(context.repoRoot)));
        },
    });
}
