import { describe, expect, it } from "vitest";

import { InsufficientHistory } from "../../fitness/domain/fitnessFunction";
import { measure } from "../../fitness/service/measurement";
import { InMemoryCommitGraph } from "../../history/__fixtures__/inMemoryCommitGraph";
import { InMemoryCommitHistory } from "../../history/__fixtures__/inMemoryCommitHistory";
import {
    type CommitRecord,
    type FileChange,
    HISTORY_WINDOW,
} from "../../history/domain/commitHistory";
import type { SourceLayout } from "../domain/sourceLayout";
import type { SourceStructure } from "../port/SourceStructure";
import { createMissedPartnerFitnessFunction } from "./missedPartnerFitnessFunction";

const LINT_CONFIG = "apps/host/src/adapter/out/LintConfig.ts";
const CORE_LINT_CONFIG = "libs/core/src/lint/LintConfigService.ts";
const FILLER = "libs/core/src/filler.ts";

class InMemorySourceStructure implements SourceStructure {
    readonly reads: string[] = [];

    read(repoRoot: string): SourceLayout {
        this.reads.push(repoRoot);
        return {
            files: [LINT_CONFIG, CORE_LINT_CONFIG, FILLER],
            barrels: [],
            generatedFiles: [],
            links: [],
            workspaces: [
                {
                    dir: "apps/host",
                    compositionFiles: [],
                    namedPaths: [],
                    contributesToHost: false,
                },
                {
                    dir: "libs/core",
                    compositionFiles: [],
                    namedPaths: [],
                    contributesToHost: false,
                },
            ],
        };
    }
}

const modified = (...paths: string[]): FileChange[] =>
    paths.map((path) => ({ kind: "modified", path }));

function historyStartingWith(
    newestPaths: readonly (readonly string[])[],
    length = HISTORY_WINDOW + 1,
): CommitRecord[] {
    return Array.from({ length }, (_, index) => ({
        commit: `c${index}`,
        subject: "feat: change",
        changes: modified(...(newestPaths[index] ?? [FILLER])),
    }));
}

// The pair changed together in 6 of 7 changes to LintConfig.ts, between fillers.
function history(length = HISTORY_WINDOW + 1): CommitRecord[] {
    return historyStartingWith(
        [...Array(6).fill([LINT_CONFIG, CORE_LINT_CONFIG]), [LINT_CONFIG]],
        length,
    );
}

const LINT_CONFIG_CHANGED = modified(LINT_CONFIG);
const CONTEXT = {
    repoRoot: "/repo",
    commit: "head",
    changeBase: "base",
    defaultBranchBase: "base",
};

describe("the missed partner fitness function", () => {
    it("reads the change and the window at the change base", () => {
        const commits = new InMemoryCommitHistory(history(), LINT_CONFIG_CHANGED);
        const sources = new InMemorySourceStructure();

        const measurement = measure(
            createMissedPartnerFitnessFunction({ history: commits, sources }),
            CONTEXT,
        );

        expect(commits.changeRequests).toEqual([{ repoRoot: "/repo", commit: "base" }]);
        expect(commits.requests).toEqual([
            { repoRoot: "/repo", commit: "base", depth: HISTORY_WINDOW + 1 },
        ]);
        expect(sources.reads).toEqual(["/repo"]);
        expect(measurement).toEqual({
            findings: [
                expect.objectContaining({
                    key: `${LINT_CONFIG} → ${CORE_LINT_CONFIG}`,
                    path: LINT_CONFIG,
                    rank: 1,
                }),
            ],
        });
    });

    it("reads no history for a measurement without a change", () => {
        const commits = new InMemoryCommitHistory(history(), []);
        const sources = new InMemorySourceStructure();

        const measurement = measure(
            createMissedPartnerFitnessFunction({ history: commits, sources }),
            { repoRoot: "/repo", commit: "base", changeBase: "base", defaultBranchBase: "base" },
        );

        expect(measurement).toEqual({ findings: [] });
        expect(commits.requests).toEqual([]);
        expect(sources.reads).toEqual([]);
    });

    it("mines a stacked PR's base branch as the one change its squash adds, so no warning comes that the retarget drops", () => {
        // On main the pair shares 4 of 8 changes to LintConfig.ts; the base branch's 3 commits change both.
        const mainUpToFork = historyStartingWith([
            ...Array(4).fill([LINT_CONFIG, CORE_LINT_CONFIG]),
            ...Array(4).fill([LINT_CONFIG]),
        ]);
        const baseBranch = [1, 2, 3].map((index) => ({
            commit: `baseBranch${index}`,
            subject: "feat: change",
            changes: modified(LINT_CONFIG, CORE_LINT_CONFIG),
        }));
        const graph = new InMemoryCommitGraph(
            {
                fork: mainUpToFork,
                stackBase: [...baseBranch, ...mainUpToFork],
                baseSquash: [
                    {
                        commit: "baseSquash",
                        subject: "feat: change",
                        changes: modified(LINT_CONFIG, CORE_LINT_CONFIG),
                    },
                    ...mainUpToFork,
                ],
            },
            { stackBase: LINT_CONFIG_CHANGED, baseSquash: LINT_CONFIG_CHANGED },
            { "fork..stackBase": modified(LINT_CONFIG, CORE_LINT_CONFIG) },
        );
        const findingsAt = (changeBase: string, defaultBranchBase: string) =>
            measure(
                createMissedPartnerFitnessFunction({
                    history: graph,
                    sources: new InMemorySourceStructure(),
                }),
                { repoRoot: "/repo", commit: "head", changeBase, defaultBranchBase },
            );

        const onStack = findingsAt("stackBase", "fork");

        expect(onStack).toEqual({ findings: [] });
        expect(onStack).toEqual(findingsAt("baseSquash", "baseSquash"));
    });

    it("ends its series where the history is shorter than the window and its parent", () => {
        const fitnessFunction = createMissedPartnerFitnessFunction({
            history: new InMemoryCommitHistory(history(HISTORY_WINDOW), LINT_CONFIG_CHANGED),
            sources: new InMemorySourceStructure(),
        });

        expect(() => fitnessFunction.findFindings(CONTEXT)).toThrow(InsufficientHistory);
    });
});
