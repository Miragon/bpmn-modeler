import { describe, expect, it } from "vitest";

import { HISTORY_WINDOW } from "../../history/domain/commitHistory";
import {
    REPLAY_CANDIDATES,
    REPLAY_LOOK_AHEAD,
    REPLAY_READ_DEPTH,
    replayMissedPartners,
} from "./missedPartnerReplay";
import { MISSED_PARTNER_THRESHOLDS } from "./missedPartners";

const A = "libs/core/src/a.ts";
const B = "libs/core/src/b.ts";
const FILLER = "libs/core/src/filler.ts";
const DOCS = "docs/page.md";
const MEASURED = new Set([A, B, FILLER]);

// Index 0 is the newest commit; replayed commits start after the look-ahead.
const REPLAYED = REPLAY_LOOK_AHEAD + 1;
const PAIR_HISTORY_START = 300;

interface Overrides {
    readonly [index: number]: { readonly subject?: string; readonly paths: readonly string[] };
}

function changesets(overrides: Overrides, fillerPaths: readonly string[] = [FILLER]) {
    return Array.from({ length: REPLAY_READ_DEPTH }, (_, index) => ({
        commit: `c${index}`,
        subject: overrides[index]?.subject ?? "feat: change",
        paths: overrides[index]?.paths ?? fillerPaths,
    }));
}

// B changed in 6 of 7 changes to A, all of them older than every replayed commit.
const A_WITH_B: Overrides = Object.fromEntries([
    ...Array.from({ length: 6 }, (_, offset) => [PAIR_HISTORY_START + offset, { paths: [A, B] }]),
    [PAIR_HISTORY_START + 6, { paths: [A] }],
]);

function outcomeOf(
    replay: ReturnType<typeof replayMissedPartners>,
    minConfidencePercent: number,
    minLift: number,
) {
    return replay.outcomes.find(
        ({ candidate }) =>
            candidate.minConfidencePercent === minConfidencePercent &&
            candidate.minLift === minLift,
    );
}

describe("the missed partner replay", () => {
    it.each([
        {
            case: "a hit when the partner changes 10 commits later",
            partnerAt: REPLAYED - 10,
            hits: 1,
        },
        { case: "no hit when it changes 11 commits later", partnerAt: REPLAYED - 11, hits: 0 },
    ])("counts $case", ({ partnerAt, hits }) => {
        const replay = replayMissedPartners(
            changesets({ ...A_WITH_B, [REPLAYED]: { paths: [A] }, [partnerAt]: { paths: [B] } }),
            MEASURED,
        );

        expect(outcomeOf(replay, 30, 4)).toMatchObject({ warnings: 1, hits, precision: hits });
    });

    it("averages over the warnings the share of 10-commit windows in the history in which the partner changed", () => {
        const replay = replayMissedPartners(
            changesets({ ...A_WITH_B, [REPLAYED]: { paths: [A] } }),
            MEASURED,
        );
        // B sits at 6 adjacent history positions, so 6 + 9 of the 915 windows hold it.
        const windows = HISTORY_WINDOW - REPLAY_LOOK_AHEAD + 1;

        expect(outcomeOf(replay, 30, 4)).toMatchObject({
            warnings: 1,
            hits: 0,
            precision: 0,
            chanceRate: 15 / windows,
            margin: -15 / windows,
        });
    });

    it("replays 200 commits and skips a mechanical one", () => {
        const replay = replayMissedPartners(
            changesets({
                ...A_WITH_B,
                [REPLAYED]: { subject: "chore(deps): bump", paths: [A] },
            }),
            MEASURED,
        );

        expect(replay).toMatchObject({ head: "c0", replayedCommits: 199, lookAhead: 10 });
        expect(outcomeOf(replay, 30, 1)).toMatchObject({
            warnings: 0,
            precision: undefined,
            chanceRate: undefined,
            margin: undefined,
        });
    });

    it("applies each candidate's lift floor", () => {
        // 14 filler commits leave 21 counted: lift 6 × 21 ÷ (7 × 6) = 3.
        const fillers = Object.fromEntries(
            Array.from({ length: 14 }, (_, offset) => [400 + offset, { paths: [FILLER] }]),
        );
        const replay = replayMissedPartners(
            changesets({ ...A_WITH_B, ...fillers, [REPLAYED]: { paths: [A] } }, [DOCS]),
            MEASURED,
        );

        expect(outcomeOf(replay, 30, 2)?.warnings).toBe(1);
        expect(outcomeOf(replay, 30, 4)?.warnings).toBe(0);
    });

    it("offers every confidence threshold with every lift floor and marks the chosen one", () => {
        const replay = replayMissedPartners(changesets({}), MEASURED);

        expect(replay.outcomes).toHaveLength(16);
        expect(REPLAY_CANDIDATES).toContainEqual({
            minConfidencePercent: MISSED_PARTNER_THRESHOLDS.minConfidencePercent,
            minLift: MISSED_PARTNER_THRESHOLDS.minLift,
        });
        expect(replay.outcomes.filter(({ chosen }) => chosen)).toHaveLength(1);
    });

    it("fails when the history is shorter than the replay needs", () => {
        expect(() => replayMissedPartners(changesets({}).slice(1), MEASURED)).toThrow(
            `${REPLAY_READ_DEPTH - 1} first-parent commits reach back from here; the replay needs ${REPLAY_READ_DEPTH}`,
        );
    });
});
