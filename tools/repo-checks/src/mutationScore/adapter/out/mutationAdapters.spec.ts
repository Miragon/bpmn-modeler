import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../../fitness/__fixtures__/tempGitRepository";
import { type MutationRun, serializeMutationRun } from "../../domain/mutationRun";
import { GitMutationRuns } from "./gitMutationRuns";
import { MutationRunDirectory } from "./mutationRunDirectory";
import { StrykerReportFile } from "./strykerReportFile";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
});

afterEach(() => {
    repository.remove();
});

function run(runId: string, commit: string): MutationRun {
    return {
        schemaVersion: 1,
        runId,
        commit,
        contexts: { "libs/modeler-core/src/kernel/domain": { detected: 1, undetected: 0 } },
    };
}

describe("the stored mutation runs", () => {
    it("reads every run on the data branch and the whole first-parent chain", () => {
        const first = repository.commit("a.ts", "1");
        const second = repository.commit("a.ts", "2");
        repository.publishDataBranch("refs/remotes/origin/fitness-history", {
            "mutation/41.json": serializeMutationRun(run("41", first)),
            "mutation/42.json": serializeMutationRun(run("42", second)),
            "snapshots/x.json": "{}",
        });
        const runs = new GitMutationRuns();

        expect(runs.storedRuns(repository.root)).toEqual([run("41", first), run("42", second)]);
        expect(runs.firstParentChain(repository.root, second)).toEqual([second, first]);
    });

    it("reads none when the branch was never fetched", () => {
        repository.commit("a.ts", "1");

        expect(new GitMutationRuns().storedRuns(repository.root)).toEqual([]);
    });
});

describe("the mutation run directory", () => {
    it("writes a run where the data branch keeps it", () => {
        new MutationRunDirectory(repository.root).write(run("7", "abc"));

        expect(readFileSync(join(repository.root, "mutation/7.json"), "utf8")).toBe(
            serializeMutationRun(run("7", "abc")),
        );
    });
});

describe("the Stryker report file", () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "fitness-spec-stryker-"));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("reads a report, nothing for a missing one, and fails on one that is no JSON", () => {
        writeFileSync(join(dir, "mutation.json"), '{"files":{}}');
        writeFileSync(join(dir, "broken.json"), "{");
        const reports = new StrykerReportFile();

        expect(reports.read(join(dir, "mutation.json"))).toEqual({ files: {} });
        expect(reports.read(join(dir, "missing.json"))).toBeUndefined();
        expect(() => reports.read(join(dir, "broken.json"))).toThrow("is no JSON");
    });
});
