import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeGitFake"));

import { describeConflictVersionsContract } from "@miragon/bpmn-modeler-core/testing";

import {
    conflictInGit,
    gitListenerCount,
    gitRefreshes,
    gitStarts,
    keepGitStarting,
    openRepositoryLater,
    removeGit,
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
