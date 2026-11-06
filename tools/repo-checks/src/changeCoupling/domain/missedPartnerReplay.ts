import {
    type Changeset,
    changesetsAtTodaysPaths,
    type CommitRecord,
    HISTORY_WINDOW,
    HISTORY_WINDOW_READ_DEPTH,
    isMechanicalCommit,
} from "../../history/domain/commitHistory";
import {
    MISSED_PARTNER_THRESHOLDS,
    type MissedPartner,
    meetsThresholds,
    missedPartners,
} from "./missedPartners";
import { measuredFiles, type SourceLayout } from "./sourceLayout";

/** A partner changed within this many later commits counts as a hit. */
export const REPLAY_LOOK_AHEAD = 10;
export const REPLAYED_COMMITS = 200;
/** Each replayed commit needs its look-ahead after it and a full history window before it. */
export const REPLAY_READ_DEPTH = REPLAY_LOOK_AHEAD + REPLAYED_COMMITS + HISTORY_WINDOW_READ_DEPTH;

export interface ReplayCandidate {
    readonly minConfidencePercent: number;
    readonly minLift: number;
}

export const REPLAY_CANDIDATES: readonly ReplayCandidate[] = [30, 40, 50, 60].flatMap(
    (minConfidencePercent) => [1, 2, 4, 8].map((minLift) => ({ minConfidencePercent, minLift })),
);

/** Precision, chance rate and margin are shares between 0 and 1, undefined without warnings. */
export interface CandidateOutcome {
    readonly candidate: ReplayCandidate;
    readonly chosen: boolean;
    readonly warnings: number;
    readonly hits: number;
    readonly precision: number | undefined;
    readonly chanceRate: number | undefined;
    readonly margin: number | undefined;
}

export interface MissedPartnerReplay {
    /** The newest commit read; the replay runs over the commits before its look-ahead. */
    readonly head: string;
    readonly replayedCommits: number;
    readonly lookAhead: number;
    readonly outcomes: readonly CandidateOutcome[];
}

interface ReplayedWarning {
    readonly pair: MissedPartner;
    readonly hit: boolean;
    readonly chanceRate: number;
}

type ReplayChangeset = Pick<Changeset, "commit" | "subject" | "paths">;

const LOOSEST_THRESHOLDS = {
    ...MISSED_PARTNER_THRESHOLDS,
    minConfidencePercent: Math.min(...REPLAY_CANDIDATES.map((c) => c.minConfidencePercent)),
    minLift: Math.min(...REPLAY_CANDIDATES.map((c) => c.minLift)),
};

export function checkReplayDepth(commitCount: number): void {
    if (commitCount < REPLAY_READ_DEPTH) {
        throw new Error(
            `${commitCount} first-parent commits reach back from here; the replay needs ${REPLAY_READ_DEPTH}`,
        );
    }
}

export function replayMissedPartnersInTree(
    layout: SourceLayout,
    commitsNewestFirst: readonly CommitRecord[],
): MissedPartnerReplay {
    return replayMissedPartners(
        changesetsAtTodaysPaths(commitsNewestFirst, layout.files),
        measuredFiles(layout),
    );
}

/** Changesets at today's paths, newest first; a partner "changed" in any first-parent commit, mechanical ones included. */
export function replayMissedPartners(
    changesetsNewestFirst: readonly ReplayChangeset[],
    measuredFiles: ReadonlySet<string>,
): MissedPartnerReplay {
    checkReplayDepth(changesetsNewestFirst.length);
    let replayedCommits = 0;
    const warnings: ReplayedWarning[] = [];
    for (let index = REPLAY_LOOK_AHEAD; index < REPLAY_LOOK_AHEAD + REPLAYED_COMMITS; index++) {
        const replayed = changesetsNewestFirst[index];
        if (isMechanicalCommit(replayed.subject)) {
            continue;
        }
        replayedCommits += 1;
        const lookAhead = changesetsNewestFirst.slice(index - REPLAY_LOOK_AHEAD, index);
        const history = changesetsNewestFirst.slice(index + 1, index + 1 + HISTORY_WINDOW);
        for (const pair of missedPartners({
            change: replayed.paths,
            history,
            measuredFiles,
            thresholds: LOOSEST_THRESHOLDS,
        })) {
            warnings.push({
                pair,
                hit: lookAhead.some(({ paths }) => paths.includes(pair.partner)),
                chanceRate: shareOfLookAheadWindowsChanging(pair.partner, history),
            });
        }
    }
    return {
        head: changesetsNewestFirst[0].commit,
        replayedCommits,
        lookAhead: REPLAY_LOOK_AHEAD,
        outcomes: REPLAY_CANDIDATES.map((candidate) =>
            candidateOutcome(
                candidate,
                warnings.filter(({ pair }) =>
                    meetsThresholds(pair, { ...MISSED_PARTNER_THRESHOLDS, ...candidate }),
                ),
            ),
        ),
    };
}

function shareOfLookAheadWindowsChanging(
    path: string,
    history: readonly ReplayChangeset[],
): number {
    const windowCount = history.length - REPLAY_LOOK_AHEAD + 1;
    const coveredStarts = new Set<number>();
    history.forEach(({ paths }, position) => {
        if (!paths.includes(path)) {
            return;
        }
        const firstStart = Math.max(0, position - REPLAY_LOOK_AHEAD + 1);
        const lastStart = Math.min(position, windowCount - 1);
        for (let start = firstStart; start <= lastStart; start++) {
            coveredStarts.add(start);
        }
    });
    return coveredStarts.size / windowCount;
}

function candidateOutcome(
    candidate: ReplayCandidate,
    warnings: readonly ReplayedWarning[],
): CandidateOutcome {
    const chosen =
        candidate.minConfidencePercent === MISSED_PARTNER_THRESHOLDS.minConfidencePercent &&
        candidate.minLift === MISSED_PARTNER_THRESHOLDS.minLift;
    const hits = warnings.filter(({ hit }) => hit).length;
    if (warnings.length === 0) {
        return {
            candidate,
            chosen,
            warnings: 0,
            hits,
            precision: undefined,
            chanceRate: undefined,
            margin: undefined,
        };
    }
    const precision = hits / warnings.length;
    const chanceRate =
        warnings.reduce((sum, warning) => sum + warning.chanceRate, 0) / warnings.length;
    return {
        candidate,
        chosen,
        warnings: warnings.length,
        hits,
        precision,
        chanceRate,
        margin: precision - chanceRate,
    };
}
