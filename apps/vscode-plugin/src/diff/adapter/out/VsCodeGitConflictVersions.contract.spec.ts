import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeGitFake"));

import { describeConflictVersionsContract } from "@miragon/bpmn-modeler-core/testing";

import {
    closeRepository,
    conflictInGit,
    disableGit,
    enableGit,
    gitListenerCount,
    gitRefreshes,
    gitStarts,
    keepGitStarting,
    linkWorktree,
    openRepositoryLater,
    removeGit,
    reopenRepository,
    repositoryListenerCount,
    resetVscodeGit,
    resolveInGit,
} from "../../../__fixtures__/vscodeGitFake";
import { VsCodeGitConflictVersions } from "./VsCodeGitConflictVersions";

const SHORT_WAITS = { initializedMs: 30, repositoryMs: 50 };

beforeEach(() => resetVscodeGit());

describeConflictVersionsContract("VsCodeGitConflictVersions", () => ({
    source: new VsCodeGitConflictVersions(SHORT_WAITS),
    conflict: conflictInGit,
    resolve: resolveInGit,
    gitNotices: gitRefreshes,
    openLater: openRepositoryLater,
    gitMissing: removeGit,
    gitStaysUninitialized: keepGitStarting,
    gitListenerCount,
}));

describe("VsCodeGitConflictVersions", () => {
    const ORDER = "file:///work/repo/order.bpmn";

    it("reads a conflict once Git finished starting within the wait", async () => {
        keepGitStarting();
        conflictInGit("file:///work/repo", {
            fileUri: ORDER,
            stages: { current: "<current/>", incoming: "<incoming/>" },
        });
        const source = new VsCodeGitConflictVersions({ initializedMs: 1_000, repositoryMs: 50 });

        const reading = source.readConflict(ORDER);
        setTimeout(gitStarts, 5);

        expect(await reading).toMatchObject({ gitAvailable: true, inMergeChanges: true });
        expect(gitListenerCount()).toBe(0);
    });

    it("starts watching once Git finished starting, however long that takes", async () => {
        keepGitStarting();
        conflictInGit("file:///work/repo", {
            fileUri: ORDER,
            stages: { current: "<current/>", incoming: "<incoming/>" },
        });
        await gitRefreshes();
        const heard: (readonly string[])[] = [];
        new VsCodeGitConflictVersions(SHORT_WAITS).watchMergeChanges((uris) => heard.push(uris));
        await new Promise((resolve) => setTimeout(resolve, 60));

        gitStarts();

        await vi.waitFor(() => expect(heard).toStrictEqual([[ORDER]]));
    });

    it("starts watching once Git gets enabled, as after a settings change", async () => {
        disableGit();
        conflictInGit("file:///work/repo", {
            fileUri: ORDER,
            stages: { current: "<current/>", incoming: "<incoming/>" },
        });
        await gitRefreshes();
        const heard: (readonly string[])[] = [];
        const watch = new VsCodeGitConflictVersions(SHORT_WAITS).watchMergeChanges((uris) =>
            heard.push(uris),
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(heard).toStrictEqual([]);

        enableGit();

        await vi.waitFor(() => expect(heard).toStrictEqual([[ORDER]]));
        watch.dispose();
        expect(gitListenerCount()).toBe(0);
    });

    it("lets go of a disabled Git once the watch is disposed", async () => {
        disableGit();
        const watch = new VsCodeGitConflictVersions(SHORT_WAITS).watchMergeChanges(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 20));

        watch.dispose();

        expect(gitListenerCount()).toBe(0);
    });

    it.each([
        ["an absolute gitdir and rebase-merge", "/work/main/.git/worktrees/repo", "rebase-merge"],
        ["a relative gitdir and rebase-apply", "../main/.git/worktrees/repo", "rebase-apply"],
    ] as const)("finds a running rebase in a linked worktree with %s", async (_case, gitDir, folder) => {
        const refs = { head: { hash: "1111111", subject: "s" }, rebaseHead: { hash: "2222222", subject: "s" } };
        conflictInGit("file:///work/repo", {
            fileUri: ORDER,
            stages: { current: "<current/>", incoming: "<incoming/>" },
            refs: { ...refs, rebaseInProgress: true },
        });
        linkWorktree("file:///work/repo", gitDir, folder);

        const facts = await new VsCodeGitConflictVersions(SHORT_WAITS).readConflict(ORDER);

        expect(facts.refs).toStrictEqual({ ...refs, rebaseInProgress: true });
    });

    it("lets go of a closed repository and listens once to a reopened one", async () => {
        conflictInGit("file:///work/repo", {
            fileUri: ORDER,
            stages: { current: "<current/>", incoming: "<incoming/>" },
        });
        await gitRefreshes();
        const heard: (readonly string[])[] = [];
        new VsCodeGitConflictVersions(SHORT_WAITS).watchMergeChanges((uris) => heard.push(uris));
        await vi.waitFor(() => expect(heard).toHaveLength(1));

        closeRepository("file:///work/repo");
        expect(repositoryListenerCount("file:///work/repo")).toBe(0);
        reopenRepository("file:///work/repo");
        closeRepository("file:///work/repo");
        reopenRepository("file:///work/repo");

        expect(repositoryListenerCount("file:///work/repo")).toBe(1);
    });

    it("tells a watcher nothing new while Merge Changes stay the same", async () => {
        conflictInGit("file:///work/repo", {
            fileUri: ORDER,
            stages: { current: "<current/>", incoming: "<incoming/>" },
        });
        await gitRefreshes();
        const heard: (readonly string[])[] = [];
        new VsCodeGitConflictVersions(SHORT_WAITS).watchMergeChanges((uris) => heard.push(uris));
        await vi.waitFor(() => expect(heard).toHaveLength(1));

        await gitRefreshes();

        expect(heard).toStrictEqual([[ORDER]]);
    });
});
