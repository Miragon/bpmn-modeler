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
import { createChangeCouplingFitnessFunction } from "./changeCouplingFitnessFunction";

const PORT = "libs/core/src/port/hostPorts.ts";
const STATUS_BAR = "apps/host/src/adapter/out/StatusBar.ts";
const LINT_CONFIG = "apps/host/src/adapter/out/LintConfig.ts";
const CORE_LINT_CONFIG = "libs/core/src/lint/LintConfigService.ts";

class InMemorySourceStructure implements SourceStructure {
    constructor(private readonly layout: SourceLayout) {}

    read(): SourceLayout {
        return this.layout;
    }
}

const LAYOUT: SourceLayout = {
    files: [PORT, STATUS_BAR, LINT_CONFIG, CORE_LINT_CONFIG],
    barrels: [],
    generatedFiles: [],
    links: [
        { from: STATUS_BAR, to: PORT },
        { from: LINT_CONFIG, to: PORT },
    ],
    workspaces: [
        { dir: "apps/host", compositionFiles: [], namedPaths: [], contributesToHost: false },
        { dir: "libs/core", compositionFiles: [], namedPaths: [], contributesToHost: false },
    ],
};

function history(changedTogether: readonly (readonly string[])[], length = HISTORY_WINDOW + 1) {
    return Array.from({ length }, (_, index): CommitRecord => ({
        commit: `c${index}`,
        subject: "feat: change",
        changes: (changedTogether[index] ?? []).map((path) => ({ kind: "modified", path })),
    }));
}

const CONTEXT = { repoRoot: "/repo", commit: "head", changeBase: "head" };

const modified = (...paths: string[]): FileChange[] =>
    paths.map((path) => ({ kind: "modified", path }));

function record(commit: string, ...paths: string[]): CommitRecord {
    return { commit, subject: "feat: change", changes: modified(...paths) };
}

// The pair changed together in the 4 newest PRs up to the merge base, one short of being listed.
const MAIN_UP_TO_BASE = history(Array(4).fill([LINT_CONFIG, CORE_LINT_CONFIG]));

function findingsOf(graph: InMemoryCommitGraph, context: { commit: string; changeBase: string }) {
    return measure(
        createChangeCouplingFitnessFunction({
            history: graph,
            sources: new InMemorySourceStructure(LAYOUT),
        }),
        { repoRoot: "/repo", ...context },
    );
}

describe("the change coupling fitness function", () => {
    it("reads the window and one commit more at the change base", () => {
        const commits = new InMemoryCommitHistory(history([]));
        const fitnessFunction = createChangeCouplingFitnessFunction({
            history: commits,
            sources: new InMemorySourceStructure(LAYOUT),
        });

        fitnessFunction.findFindings({ repoRoot: "/repo", commit: "head", changeBase: "base" });

        expect(commits.requests).toEqual([
            { repoRoot: "/repo", commit: "base", depth: HISTORY_WINDOW + 1 },
        ]);
        expect(commits.changeRequests).toEqual([{ repoRoot: "/repo", commit: "base" }]);
    });

    it("counts a branch with several commits as the one change its squash adds", () => {
        const branchCommits = [1, 2, 3].map((index) =>
            record(`branch${index}`, LINT_CONFIG, CORE_LINT_CONFIG),
        );
        const graph = new InMemoryCommitGraph(
            {
                base: MAIN_UP_TO_BASE,
                head: [...branchCommits, ...MAIN_UP_TO_BASE],
                squash: [record("squash", LINT_CONFIG, CORE_LINT_CONFIG), ...MAIN_UP_TO_BASE],
            },
            { base: modified(LINT_CONFIG, CORE_LINT_CONFIG) },
        );

        const atHead = findingsOf(graph, { commit: "head", changeBase: "base" });

        expect(atHead).toEqual(findingsOf(graph, { commit: "squash", changeBase: "squash" }));
        expect(atHead).toEqual({
            findings: [
                expect.objectContaining({
                    key: `${LINT_CONFIG} ↔ ${CORE_LINT_CONFIG}`,
                    message: expect.stringContaining("in 5 PRs (5 and 5 revisions)"),
                }),
            ],
        });
    });

    it("counts a branch that merged main as its own change after main's PRs, as its squash lands", () => {
        const mainPullRequests = [
            record("main2", LINT_CONFIG, CORE_LINT_CONFIG),
            record("main1", LINT_CONFIG, CORE_LINT_CONFIG),
        ];
        const graph = new InMemoryCommitGraph(
            {
                head: [
                    record("branch2", LINT_CONFIG),
                    record("mergeMain", LINT_CONFIG, CORE_LINT_CONFIG),
                    record("branch1", LINT_CONFIG, CORE_LINT_CONFIG),
                    ...MAIN_UP_TO_BASE,
                ],
                mainTip: [...mainPullRequests, ...MAIN_UP_TO_BASE],
                squash: [
                    record("squash", LINT_CONFIG, CORE_LINT_CONFIG),
                    ...mainPullRequests,
                    ...MAIN_UP_TO_BASE,
                ],
            },
            { mainTip: modified(LINT_CONFIG, CORE_LINT_CONFIG) },
        );

        const atHead = findingsOf(graph, { commit: "head", changeBase: "mainTip" });

        expect(atHead).toEqual(findingsOf(graph, { commit: "squash", changeBase: "squash" }));
        expect(atHead).toEqual({
            findings: [
                expect.objectContaining({
                    message: expect.stringContaining("in 7 PRs (7 and 7 revisions)"),
                }),
            ],
        });
    });

    it("keeps every commit of the base's window, so a pair the branch did not touch stays as it was", () => {
        const changedTogether: string[][] = Array(4).fill([LINT_CONFIG, CORE_LINT_CONFIG]);
        // The oldest commit of the window holds the fifth shared change.
        changedTogether[HISTORY_WINDOW - 1] = [LINT_CONFIG, CORE_LINT_CONFIG];
        const mainUpToBase = history(changedTogether);
        const graph = new InMemoryCommitGraph(
            {
                base: mainUpToBase,
                testMerge: [record("testMerge", STATUS_BAR), ...mainUpToBase],
            },
            { base: modified(STATUS_BAR) },
        );

        const atBase = findingsOf(graph, { commit: "base", changeBase: "base" });

        expect(atBase).toEqual({
            findings: [expect.objectContaining({ key: `${LINT_CONFIG} ↔ ${CORE_LINT_CONFIG}` })],
        });
        expect(findingsOf(graph, { commit: "testMerge", changeBase: "base" })).toEqual(atBase);
    });

    it("does not count a branch with more read files than a counted commit may hold, as it would not count its squash", () => {
        const manyFiles = Array.from(
            { length: 31 },
            (_, index) => `libs/core/src/many/file${index}.ts`,
        );
        const graph = new InMemoryCommitGraph(
            { base: MAIN_UP_TO_BASE },
            { base: modified(LINT_CONFIG, CORE_LINT_CONFIG, ...manyFiles) },
        );
        const fitnessFunction = createChangeCouplingFitnessFunction({
            history: graph,
            sources: new InMemorySourceStructure({
                ...LAYOUT,
                files: [...LAYOUT.files, ...manyFiles],
            }),
        });

        expect(
            measure(fitnessFunction, { repoRoot: "/repo", commit: "head", changeBase: "base" }),
        ).toEqual({ findings: [] });
    });

    it("lists a hidden pair, and two adapters of one port that changed with it only as explained", () => {
        const fitnessFunction = createChangeCouplingFitnessFunction({
            history: new InMemoryCommitHistory(
                history([
                    ...Array(5).fill([LINT_CONFIG, CORE_LINT_CONFIG]),
                    ...Array(5).fill([STATUS_BAR, LINT_CONFIG, PORT]),
                ]),
            ),
            sources: new InMemorySourceStructure(LAYOUT),
        });

        const measurement = measure(fitnessFunction, CONTEXT);

        expect(measurement).toEqual({
            findings: [
                expect.objectContaining({
                    key: `${LINT_CONFIG} ↔ ${STATUS_BAR}`,
                    group: "explained",
                }),
                expect.objectContaining({
                    key: `${LINT_CONFIG} ↔ ${CORE_LINT_CONFIG}`,
                    group: "across-workspaces",
                }),
            ],
        });
    });

    it("ends its series where the history is shorter than the window and its parent", () => {
        const fitnessFunction = createChangeCouplingFitnessFunction({
            history: new InMemoryCommitHistory(history([], HISTORY_WINDOW)),
            sources: new InMemorySourceStructure(LAYOUT),
        });

        expect(() => fitnessFunction.findFindings(CONTEXT)).toThrow(InsufficientHistory);
        expect(measure(fitnessFunction, CONTEXT)).toEqual({
            unmeasurable: `${HISTORY_WINDOW} first-parent commits reach back from here; the window needs ${HISTORY_WINDOW} and the parent of the oldest`,
        });
    });
});
