import { describe, expect, it } from "vitest";

import { InsufficientHistory } from "../../fitness/domain/fitnessFunction";
import { measure } from "../../fitness/service/measurement";
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

// The pair changed together in 6 of 7 changes to LintConfig.ts, between fillers.
function history(length = HISTORY_WINDOW + 1): CommitRecord[] {
    return Array.from({ length }, (_, index): CommitRecord => {
        let paths = [FILLER];
        if (index < 6) {
            paths = [LINT_CONFIG, CORE_LINT_CONFIG];
        } else if (index === 6) {
            paths = [LINT_CONFIG];
        }
        return {
            commit: `c${index}`,
            subject: "feat: change",
            changes: paths.map((path) => ({ kind: "modified", path })),
        };
    });
}

const LINT_CONFIG_CHANGED: FileChange[] = [{ kind: "modified", path: LINT_CONFIG }];
const CONTEXT = { repoRoot: "/repo", commit: "head", changeBase: "base" };

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
            { repoRoot: "/repo", commit: "base", changeBase: "base" },
        );

        expect(measurement).toEqual({ findings: [] });
        expect(commits.requests).toEqual([]);
        expect(sources.reads).toEqual([]);
    });

    it("ends its series where the history is shorter than the window and its parent", () => {
        const fitnessFunction = createMissedPartnerFitnessFunction({
            history: new InMemoryCommitHistory(history(HISTORY_WINDOW), LINT_CONFIG_CHANGED),
            sources: new InMemorySourceStructure(),
        });

        expect(() => fitnessFunction.findFindings(CONTEXT)).toThrow(InsufficientHistory);
    });
});
