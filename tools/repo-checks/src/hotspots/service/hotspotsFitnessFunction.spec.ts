import { describe, expect, it } from "vitest";

import { measure } from "../../fitness/service/measurement";
import { InMemoryCommitGraph } from "../../history/__fixtures__/inMemoryCommitGraph";
import { InMemoryCommitHistory } from "../../history/__fixtures__/inMemoryCommitHistory";
import {
    type CommitRecord,
    type FileChange,
    HISTORY_WINDOW,
} from "../../history/domain/commitHistory";
import { InMemorySourceMeasures } from "../../sourceFiles/__fixtures__/inMemorySourceMeasures";
import { createHotspotsFitnessFunction } from "./hotspotsFitnessFunction";

const OFTEN = "libs/core/src/service/Often.ts";
const OTHER = "libs/core/src/service/Other.ts";

function history(length: number): CommitRecord[] {
    return Array.from({ length }, (_, index) => ({
        commit: `c${index}`,
        subject: "feat: change",
        changes: index < 3 ? [{ kind: "modified", path: OFTEN }] : [],
    }));
}

const SOURCES = new InMemorySourceMeasures([
    { path: OFTEN, codeLines: 40, functions: [], barrel: false },
    { path: OTHER, codeLines: 10, functions: [], barrel: false },
]);

const modified = (...paths: string[]): FileChange[] =>
    paths.map((path) => ({ kind: "modified", path }));

function record(commit: string, ...paths: string[]): CommitRecord {
    return { commit, subject: "feat: change", changes: modified(...paths) };
}

function findingsOf(graph: InMemoryCommitGraph, context: { commit: string; changeBase: string }) {
    return measure(createHotspotsFitnessFunction({ history: graph, sources: SOURCES }), {
        repoRoot: "/repo",
        ...context,
    });
}

const MAIN_UP_TO_BASE = history(HISTORY_WINDOW + 1);

describe("the hotspots fitness function", () => {
    it("ranks the files over the window read at the change base", () => {
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

    it("reads the window at the change base", () => {
        const commits = new InMemoryCommitHistory(history(HISTORY_WINDOW + 1));

        createHotspotsFitnessFunction({ history: commits, sources: SOURCES }).findFindings({
            repoRoot: "/repo",
            commit: "head",
            changeBase: "base",
        });

        expect(commits.requests).toEqual([
            { repoRoot: "/repo", commit: "base", depth: HISTORY_WINDOW + 1 },
        ]);
        expect(commits.changeRequests).toEqual([{ repoRoot: "/repo", commit: "base" }]);
    });

    it("counts a branch with several commits as the one revision its squash adds", () => {
        const graph = new InMemoryCommitGraph(
            {
                base: MAIN_UP_TO_BASE,
                head: [1, 2, 3, 4, 5]
                    .map((index) => record(`branch${index}`, OFTEN))
                    .concat(MAIN_UP_TO_BASE),
                squash: [record("squash", OFTEN), ...MAIN_UP_TO_BASE],
            },
            { base: modified(OFTEN) },
        );

        const atHead = findingsOf(graph, { commit: "head", changeBase: "base" });

        expect(atHead).toEqual(findingsOf(graph, { commit: "squash", changeBase: "squash" }));
        expect(atHead).toEqual({
            findings: [
                expect.objectContaining({
                    key: OFTEN,
                    message: expect.stringMatching(/^4 revisions/),
                }),
            ],
        });
    });

    it("counts a branch that merged main as its own revision after main's PRs, as its squash lands", () => {
        const mainPullRequests = [record("main2", OTHER), record("main1", OTHER)];
        const graph = new InMemoryCommitGraph(
            {
                head: [
                    record("branch2", OFTEN),
                    record("mergeMain", OTHER),
                    record("branch1", OFTEN),
                    ...MAIN_UP_TO_BASE,
                ],
                mainTip: [...mainPullRequests, ...MAIN_UP_TO_BASE],
                squash: [record("squash", OFTEN), ...mainPullRequests, ...MAIN_UP_TO_BASE],
            },
            { mainTip: modified(OFTEN) },
        );

        const atHead = findingsOf(graph, { commit: "head", changeBase: "mainTip" });

        expect(atHead).toEqual(findingsOf(graph, { commit: "squash", changeBase: "squash" }));
        expect(atHead).toEqual({
            findings: [
                expect.objectContaining({
                    key: OFTEN,
                    message: expect.stringMatching(/^4 revisions/),
                }),
                expect.objectContaining({
                    key: OTHER,
                    message: expect.stringMatching(/^2 revisions/),
                }),
            ],
        });
    });

    it("keeps every commit of the base's window, so a file the branch did not touch keeps its revisions", () => {
        const mainUpToBase = MAIN_UP_TO_BASE.map((commit, index) =>
            index === HISTORY_WINDOW - 1 ? record(commit.commit, OTHER) : commit,
        );
        const graph = new InMemoryCommitGraph(
            { base: mainUpToBase, testMerge: [record("testMerge", "README.md"), ...mainUpToBase] },
            { base: modified("README.md") },
        );

        const atBase = findingsOf(graph, { commit: "base", changeBase: "base" });

        expect(atBase).toEqual({
            findings: [
                expect.objectContaining({ key: OFTEN }),
                expect.objectContaining({ key: OTHER }),
            ],
        });
        expect(findingsOf(graph, { commit: "testMerge", changeBase: "base" })).toEqual(atBase);
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
