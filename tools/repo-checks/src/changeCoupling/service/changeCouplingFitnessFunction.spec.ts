import { describe, expect, it } from "vitest";

import { InsufficientHistory } from "../../fitness/domain/fitnessFunction";
import { measure } from "../../fitness/service/measurement";
import type { CommitRecord } from "../../history/domain/commitHistory";
import type { CommitHistory } from "../../history/port/CommitHistory";
import { CHANGE_COUPLING_WINDOW } from "../domain/changeCoupling";
import type { SourceLayout } from "../domain/sourceLayout";
import type { SourceStructure } from "../port/SourceStructure";
import { createChangeCouplingFitnessFunction } from "./changeCouplingFitnessFunction";

const PORT = "libs/core/src/port/hostPorts.ts";
const STATUS_BAR = "apps/host/src/adapter/out/StatusBar.ts";
const LINT_CONFIG = "apps/host/src/adapter/out/LintConfig.ts";
const CORE_LINT_CONFIG = "libs/core/src/lint/LintConfigService.ts";

class InMemoryCommitHistory implements CommitHistory {
    readonly requests: { repoRoot: string; commit: string; depth: number }[] = [];

    constructor(private readonly records: readonly CommitRecord[]) {}

    firstParentCommits(repoRoot: string, commit: string, depth: number): readonly CommitRecord[] {
        this.requests.push({ repoRoot, commit, depth });
        return this.records.slice(0, depth);
    }
}

class InMemorySourceStructure implements SourceStructure {
    constructor(private readonly layout: SourceLayout) {}

    read(): SourceLayout {
        return this.layout;
    }
}

const LAYOUT: SourceLayout = {
    files: [PORT, STATUS_BAR, LINT_CONFIG, CORE_LINT_CONFIG],
    barrels: [],
    links: [
        { from: STATUS_BAR, to: PORT },
        { from: LINT_CONFIG, to: PORT },
    ],
    workspaces: [
        { dir: "apps/host", compositionFiles: [], namedPaths: [], contributesToHost: false },
        { dir: "libs/core", compositionFiles: [], namedPaths: [], contributesToHost: false },
    ],
};

function history(
    changedTogether: readonly (readonly string[])[],
    length = CHANGE_COUPLING_WINDOW + 1,
) {
    return Array.from({ length }, (_, index): CommitRecord => ({
        commit: `c${index}`,
        subject: "feat: change",
        changes: (changedTogether[index] ?? []).map((path) => ({ kind: "modified", path })),
    }));
}

const CONTEXT = { repoRoot: "/repo", commit: "head" };

describe("the change coupling fitness function", () => {
    it("reads the window and one commit more at the measured commit", () => {
        const commits = new InMemoryCommitHistory(history([]));
        const fitnessFunction = createChangeCouplingFitnessFunction({
            history: commits,
            sources: new InMemorySourceStructure(LAYOUT),
        });

        fitnessFunction.findFindings(CONTEXT);

        expect(commits.requests).toEqual([
            { repoRoot: "/repo", commit: "head", depth: CHANGE_COUPLING_WINDOW + 1 },
        ]);
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
            history: new InMemoryCommitHistory(history([], CHANGE_COUPLING_WINDOW)),
            sources: new InMemorySourceStructure(LAYOUT),
        });

        expect(() => fitnessFunction.findFindings(CONTEXT)).toThrow(InsufficientHistory);
        expect(measure(fitnessFunction, CONTEXT)).toEqual({
            unmeasurable: `${CHANGE_COUPLING_WINDOW} first-parent commits reach back from here; the window needs ${CHANGE_COUPLING_WINDOW} and the parent of the oldest`,
        });
    });
});
