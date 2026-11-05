import { compareText, type Finding } from "../../fitness/domain/finding";
import { groupedDigits } from "../../fitness/domain/numberText";
import type { MutationRun } from "./mutationRun";
import { hasScore, type MutationTally, percent, totalOf } from "./mutationTally";

const RUNS_IN_MESSAGE = 8;
const SHORT_COMMIT_LENGTH = 8;

const DOMAIN_FOLDER = /\/src\/(.+)\/domain$/;

// Run ids are GitHub's increasing integers; comparing their digits as numbers keeps 10 after 9.
function compareRunIds(left: string, right: string): number {
    return left.length - right.length || compareText(left, right);
}

/** The runs on the chain, oldest commit first; runs on one commit by run id. */
export function mutationScoreSeries(
    chainNewestFirst: readonly string[],
    runs: readonly MutationRun[],
): MutationRun[] {
    const age = new Map(chainNewestFirst.map((commit, index) => [commit, index]));
    return runs
        .filter(({ commit }) => age.has(commit))
        .sort(
            (left, right) =>
                (age.get(right.commit) as number) - (age.get(left.commit) as number) ||
                compareRunIds(left.runId, right.runId),
        );
}

function runPoint(tally: MutationTally | undefined, commit: string): string {
    const shortCommit = commit.slice(0, SHORT_COMMIT_LENGTH);
    return tally !== undefined && hasScore(tally)
        ? `${percent(tally)} (${shortCommit})`
        : `no score (${shortCommit})`;
}

function scoreMessage(
    name: string,
    latest: MutationTally,
    series: readonly MutationRun[],
    tallyOf: (run: MutationRun) => MutationTally | undefined,
): string {
    const headline = hasScore(latest)
        ? `${name} ${percent(latest)} (${groupedDigits(latest.detected)} detected, ${groupedDigits(latest.undetected)} undetected)`
        : `${name}: no mutants, no score`;
    const runs = series
        .slice(-RUNS_IN_MESSAGE)
        .map((run) => runPoint(tallyOf(run), run.commit))
        .join(" → ");
    return `${headline}; runs: ${runs}`;
}

function workspaceOf(folder: string): string {
    return folder.replace(DOMAIN_FOLDER, "");
}

function contextName(folder: string): string {
    return DOMAIN_FOLDER.exec(folder)?.[1] ?? folder;
}

/** One finding per domain folder of the latest run and one total per workspace. */
export function mutationScoreFindings(seriesOldestFirst: readonly MutationRun[]): Finding[] {
    const latest = seriesOldestFirst.at(-1);
    if (latest === undefined) {
        return [];
    }
    const folders = Object.keys(latest.contexts).sort(compareText);
    const workspaces = [...new Set(folders.map(workspaceOf))];
    const totalIn = (run: MutationRun, workspace: string): MutationTally =>
        totalOf(
            Object.entries(run.contexts)
                .filter(([folder]) => workspaceOf(folder) === workspace)
                .map(([, tally]) => tally),
        );
    return [
        ...workspaces.map((workspace) => ({
            key: workspace,
            path: workspace,
            line: 1,
            message: scoreMessage("total", totalIn(latest, workspace), seriesOldestFirst, (run) =>
                totalIn(run, workspace),
            ),
        })),
        ...folders.map((folder) => ({
            key: folder,
            path: folder,
            line: 1,
            message: scoreMessage(
                contextName(folder),
                latest.contexts[folder],
                seriesOldestFirst,
                (run) => (Object.hasOwn(run.contexts, folder) ? run.contexts[folder] : undefined),
            ),
        })),
    ];
}

export type MutationScoreOutcome =
    | { readonly kind: "noRun"; readonly reason: string }
    | { readonly kind: "measured"; readonly findings: readonly Finding[] };

/** The series ends where no stored run reaches back: runs are not recomputed from git. */
export function mutationScoreOnChain(
    chainNewestFirst: readonly string[],
    runs: readonly MutationRun[],
): MutationScoreOutcome {
    const series = mutationScoreSeries(chainNewestFirst, runs);
    return series.length === 0
        ? {
              kind: "noRun",
              reason: `none of the ${runs.length} stored mutation runs measured a commit on this first-parent chain`,
          }
        : { kind: "measured", findings: mutationScoreFindings(series) };
}
