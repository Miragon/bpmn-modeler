import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../../fitness/__fixtures__/tempGitRepository";
import { GitCommitHistory } from "./gitCommitHistory";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
});

afterEach(() => {
    repository.remove();
});

describe("the git commit history", () => {
    it("reads each first-parent commit's subject and changes, newest first", () => {
        repository.write("src/a.ts", "export const a = 1;\n".repeat(20));
        repository.write("src/b.ts", "b");
        repository.git("add", "--all");
        repository.git("commit", "--quiet", "-m", "feat: add a and b");
        const first = repository.git("rev-parse", "HEAD");
        repository.git("mv", "src/a.ts", "src/renamed a.ts");
        repository.git("rm", "--quiet", "src/b.ts");
        repository.write("src/c.ts", "c");
        repository.git("add", "--all");
        repository.git("commit", "--quiet", "-m", "refactor: move a, drop b");
        const second = repository.git("rev-parse", "HEAD");
        repository.git("commit", "--quiet", "--allow-empty", "-m", "chore: nothing");
        const third = repository.git("rev-parse", "HEAD");

        expect(new GitCommitHistory().firstParentCommits(repository.root, third, 10)).toEqual([
            { commit: third, subject: "chore: nothing", changes: [] },
            {
                commit: second,
                subject: "refactor: move a, drop b",
                changes: [
                    { kind: "deleted", path: "src/b.ts" },
                    { kind: "added", path: "src/c.ts" },
                    { kind: "renamed", previousPath: "src/a.ts", path: "src/renamed a.ts" },
                ],
            },
            {
                commit: first,
                subject: "feat: add a and b",
                changes: [
                    { kind: "added", path: "src/a.ts" },
                    { kind: "added", path: "src/b.ts" },
                ],
            },
        ]);
    });

    it("reads a merge commit as its change against the first parent", () => {
        repository.commit("a.ts", "1");
        repository.git("checkout", "--quiet", "-b", "side");
        repository.commit("b.ts", "1");
        repository.git("checkout", "--quiet", "main");
        repository.commit("a.ts", "2");
        repository.git("merge", "--quiet", "--no-ff", "-m", "merge side", "side");
        const merge = repository.git("rev-parse", "HEAD");

        const [mergeRecord, ...older] = new GitCommitHistory().firstParentCommits(
            repository.root,
            merge,
            10,
        );

        expect(mergeRecord.changes).toEqual([{ kind: "added", path: "b.ts" }]);
        expect(older.map(({ subject }) => subject)).toEqual(["change a.ts", "change a.ts"]);
    });

    it("detects renames whatever the user's rename limit", () => {
        for (let index = 0; index < 3; index++) {
            repository.write(`src/file${index}.ts`, `export const value${index} = ${index};\n`.repeat(10));
        }
        repository.git("add", "--all");
        repository.git("commit", "--quiet", "-m", "add");
        repository.git("mv", "src", "lib");
        repository.git("commit", "--quiet", "-m", "move");
        repository.git("config", "diff.renameLimit", "1");
        repository.git("config", "diff.renames", "false");

        const [move] = new GitCommitHistory().firstParentCommits(repository.root, "HEAD", 1);

        expect(move.changes.map(({ kind }) => kind)).toEqual(["renamed", "renamed", "renamed"]);
    });

    it("returns the whole history when it is shorter than asked in a full clone", () => {
        repository.commit("a.ts", "1");

        expect(new GitCommitHistory().firstParentCommits(repository.root, "HEAD", 5)).toHaveLength(1);
    });

    it("fails loudly in a shallow clone that holds too few commits", () => {
        repository.commit("a.ts", "1");
        repository.commit("a.ts", "2");
        repository.commit("a.ts", "3");
        const clone = new TempGitRepository();
        try {
            clone.git("fetch", "--quiet", "--depth=2", `file://${repository.root}`, "main:shallow");
            clone.git("checkout", "--quiet", "shallow");

            expect(() => new GitCommitHistory().firstParentCommits(clone.root, "HEAD", 3)).toThrow(
                "this shallow clone holds 2 of the 3 first-parent commits needed; run git fetch --unshallow",
            );
        } finally {
            clone.remove();
        }
    });
});
