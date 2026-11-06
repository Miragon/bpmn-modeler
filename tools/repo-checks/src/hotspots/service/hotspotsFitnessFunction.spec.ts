import { describe, expect, it } from "vitest";

import { measure } from "../../fitness/service/measurement";
import { InMemoryCommitHistory } from "../../history/__fixtures__/inMemoryCommitHistory";
import { type CommitRecord, HISTORY_WINDOW } from "../../history/domain/commitHistory";
import { InMemorySourceMeasures } from "../../sourceFiles/__fixtures__/inMemorySourceMeasures";
import { createHotspotsFitnessFunction } from "./hotspotsFitnessFunction";

const OFTEN = "libs/core/src/service/Often.ts";

function history(length: number): CommitRecord[] {
    return Array.from({ length }, (_, index) => ({
        commit: `c${index}`,
        subject: "feat: change",
        changes: index < 3 ? [{ kind: "modified", path: OFTEN }] : [],
    }));
}

const SOURCES = new InMemorySourceMeasures([{ path: OFTEN, codeLines: 40, functions: [] }]);

describe("the hotspots fitness function", () => {
    it("ranks the files over the window read at the measured commit", () => {
        const commits = new InMemoryCommitHistory(history(HISTORY_WINDOW + 1));

        const measured = measure(
            createHotspotsFitnessFunction({ history: commits, sources: SOURCES }),
            {
                repoRoot: "/repo",
                commit: "head",
                changeBase: "head",
            },
        );

        expect(measured).toEqual({
            findings: [
                {
                    key: OFTEN,
                    path: OFTEN,
                    paths: [OFTEN],
                    line: 1,
                    message: "3 revisions × 40 code lines = 120; no function",
                    rank: 1,
                },
            ],
        });
        expect(commits.requests).toEqual([
            { repoRoot: "/repo", commit: "head", depth: HISTORY_WINDOW + 1 },
        ]);
    });

    it("is not measurable where fewer commits reach back than the window and its parent", () => {
        const fitnessFunction = createHotspotsFitnessFunction({
            history: new InMemoryCommitHistory(history(HISTORY_WINDOW)),
            sources: SOURCES,
        });

        expect(
            measure(fitnessFunction, { repoRoot: "/repo", commit: "head", changeBase: "head" }),
        ).toEqual({
            unmeasurable: `${HISTORY_WINDOW} first-parent commits reach back from here; the window needs ${HISTORY_WINDOW} and the parent of the oldest`,
        });
    });
});
