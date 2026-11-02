import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../__fixtures__/tempGitRepository";
import { emptySnapshot, serializeSnapshot, withEntry } from "../../domain/snapshot";
import { GitRepository } from "./gitRepository";
import { GitSnapshotBranch } from "./gitSnapshotBranch";
import { GitWorktreeCheckout } from "./gitWorktreeCheckout";
import { SnapshotDirectory } from "./snapshotDirectory";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
});

afterEach(() => {
    repository.remove();
});

describe("the git history", () => {
    it("finds the merge base of HEAD with origin/main", () => {
        const base = repository.commit("a.ts", "1");
        repository.git("update-ref", "refs/remotes/origin/main", base);
        repository.git("checkout", "--quiet", "-b", "feature");
        const head = repository.commit("a.ts", "2");
        const history = new GitRepository(repository.root);

        expect(history.headCommit()).toBe(head);
        expect(history.mergeBase("origin/main")).toBe(base);
    });

    it("fails when origin/main is missing", () => {
        repository.commit("a.ts", "1");

        expect(() => new GitRepository(repository.root).mergeBase("origin/main")).toThrow(
            "origin/main does not exist; fetch it first",
        );
    });

    it("fails when HEAD and origin/main share no commit", () => {
        repository.commit("a.ts", "1");
        repository.git("checkout", "--quiet", "--orphan", "unrelated");
        const unrelated = repository.commit("b.ts", "1");
        repository.git("update-ref", "refs/remotes/origin/main", unrelated);
        repository.git("checkout", "--quiet", "main");

        expect(() => new GitRepository(repository.root).mergeBase("origin/main")).toThrow(
            "HEAD and origin/main share no commit",
        );
    });

    it("names a shallow clone as the reason for a missing merge base", () => {
        const base = repository.commit("a.ts", "1");
        repository.commit("a.ts", "2");
        repository.git("checkout", "--quiet", "-b", "feature", base);
        repository.commit("b.ts", "1");
        const clone = new TempGitRepository();
        clone.git("fetch", "--quiet", "--depth=1", `file://${repository.root}`, "feature:feature", "main:refs/remotes/origin/main");
        clone.git("checkout", "--quiet", "feature");

        try {
            expect(() => new GitRepository(clone.root).mergeBase("origin/main")).toThrow(
                "share no commit in this shallow clone; run git fetch --unshallow",
            );
        } finally {
            clone.remove();
        }
    });

    it("lists first-parent commits newest first", () => {
        const first = repository.commit("a.ts", "1");
        repository.git("checkout", "--quiet", "-b", "side");
        repository.commit("b.ts", "1");
        repository.git("checkout", "--quiet", "main");
        const second = repository.commit("a.ts", "2");
        repository.git("merge", "--quiet", "--no-ff", "-m", "merge", "side");
        const merge = repository.git("rev-parse", "HEAD");

        const history = new GitRepository(repository.root);

        expect(history.firstParentCommits("HEAD", 10)).toEqual([merge, second, first]);
        expect(history.firstParentCommits("HEAD", 2)).toEqual([merge, second]);
    });

    it("sees uncommitted and untracked changes", () => {
        repository.commit("a.ts", "1");
        const history = new GitRepository(repository.root);
        expect(history.hasUncommittedChanges()).toBe(false);

        repository.write("new.ts", "1");

        expect(history.hasUncommittedChanges()).toBe(true);
    });
});

describe("the snapshot branch", () => {
    it("reads a stored snapshot and nothing for a commit it lacks", () => {
        const commit = repository.commit("a.ts", "1");
        const snapshot = withEntry(emptySnapshot(commit), "coupling", { version: 1, findings: [] });
        repository.publishDataBranch("refs/remotes/origin/fitness-history", {
            [`snapshots/${commit}.json`]: serializeSnapshot(snapshot),
        });
        const branch = new GitSnapshotBranch(repository.root);

        expect(branch.read(commit)).toEqual(snapshot);
        expect(branch.read("0".repeat(40))).toBeUndefined();
    });

    it("reads nothing when the branch was never fetched", () => {
        const commit = repository.commit("a.ts", "1");

        expect(new GitSnapshotBranch(repository.root).read(commit)).toBeUndefined();
    });

    it("fails on a corrupt snapshot", () => {
        const commit = repository.commit("a.ts", "1");
        repository.publishDataBranch("refs/remotes/origin/fitness-history", {
            [`snapshots/${commit}.json`]: "{",
        });

        expect(() => new GitSnapshotBranch(repository.root).read(commit)).toThrow(
            `snapshot ${commit} is no JSON`,
        );
    });
});

describe("the worktree checkout", () => {
    it("shows the tree of the commit and removes it afterwards", () => {
        const old = repository.commit("a.ts", "old");
        repository.commit("a.ts", "new");
        let checkoutRoot = "";

        const content = new GitWorktreeCheckout(repository.root).withTreeAt(old, (root) => {
            checkoutRoot = root;
            return readFileSync(join(root, "a.ts"), "utf8");
        });

        expect(content).toBe("old");
        expect(existsSync(checkoutRoot)).toBe(false);
        expect(repository.git("worktree", "list").split("\n")).toHaveLength(1);
    });

    it("removes the worktree when the measurement throws", () => {
        const commit = repository.commit("a.ts", "1");
        let checkoutRoot = "";

        expect(() =>
            new GitWorktreeCheckout(repository.root).withTreeAt(commit, (root) => {
                checkoutRoot = root;
                throw new Error("broken function");
            }),
        ).toThrow("broken function");
        expect(existsSync(checkoutRoot)).toBe(false);
        expect(repository.git("worktree", "list").split("\n")).toHaveLength(1);
    });

    it("reports a failed add as the error and leaves no directory behind", () => {
        repository.commit("a.ts", "1");
        const before = new Set(readdirSync(tmpdir()));

        expect(() =>
            new GitWorktreeCheckout(repository.root).withTreeAt("0".repeat(40), () => ""),
        ).toThrow("invalid reference");

        const leaked = readdirSync(tmpdir()).filter(
            (entry) =>
                entry.startsWith("fitness-") &&
                !entry.startsWith("fitness-spec-") &&
                !before.has(entry),
        );
        expect(leaked).toEqual([]);
    });
});

describe("the snapshot directory", () => {
    it("writes each snapshot where the branch keeps it", () => {
        const snapshot = emptySnapshot("abc");

        new SnapshotDirectory(repository.root).write(snapshot);

        expect(readdirSync(join(repository.root, "snapshots"))).toEqual(["abc.json"]);
        expect(readFileSync(join(repository.root, "snapshots/abc.json"), "utf8")).toBe(
            serializeSnapshot(snapshot),
        );
    });
});
