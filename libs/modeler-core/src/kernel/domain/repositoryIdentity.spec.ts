import { describe, expect, it } from "vitest";

import {
    backPointerPathOf,
    CodeOrigin,
    dotGitCandidatesOf,
    dotGitReadingOf,
    FileEntryKind,
    LinkedWorktreeClaim,
    linkedWorktreeFilesOf,
    linkedWorktreeOriginOf,
} from "./repositoryIdentity";

const NO_REPOSITORY: CodeOrigin = { kind: "noRepository" };

describe("dotGitCandidatesOf", () => {
    it.each([
        {
            behaviour: "looks in the folder first, then in each folder above it",
            folder: "/work/repo/plugins/trace",
            candidates: [
                "/work/repo/plugins/trace",
                "/work/repo/plugins",
                "/work/repo",
                "/work",
                "/",
            ],
        },
        {
            behaviour: "stops at a Windows drive root",
            folder: "C:/work/repo",
            candidates: ["C:/work/repo", "C:/work", "C:"],
        },
        {
            behaviour: "stops at a UNC share root",
            folder: "//server/share/repo",
            candidates: ["//server/share/repo", "//server/share"],
        },
    ])("$behaviour", ({ folder, candidates }) => {
        expect(dotGitCandidatesOf(folder)).toEqual(
            candidates.map((worktreeRoot) => ({
                worktreeRoot,
                dotGit: worktreeRoot === "/" ? "/.git" : `${worktreeRoot}/.git`,
            })),
        );
    });
});

describe("dotGitReadingOf", () => {
    const candidate = { worktreeRoot: "/work/task", dotGit: "/work/task/.git" };

    it.each<{
        behaviour: string;
        kind: FileEntryKind;
        text?: string;
        reading: ReturnType<typeof dotGitReadingOf>;
    }>([
        {
            behaviour: "takes a .git folder as the repository's common directory",
            kind: "directory",
            reading: {
                kind: "repository",
                commonDir: "/work/task/.git",
                worktreeRoot: "/work/task",
            },
        },
        {
            behaviour: "reads a .git file as a claim to be a linked worktree",
            kind: "file",
            text: "gitdir: /work/repo/.git/worktrees/task\n",
            reading: {
                kind: "linkedWorktreeClaim",
                worktreeRoot: "/work/task",
                dotGit: "/work/task/.git",
                adminDir: "/work/repo/.git/worktrees/task",
            },
        },
        {
            behaviour: "resolves a relative gitdir against the worktree",
            kind: "file",
            text: "gitdir: ../repo/.git/worktrees/task",
            reading: {
                kind: "linkedWorktreeClaim",
                worktreeRoot: "/work/task",
                dotGit: "/work/task/.git",
                adminDir: "/work/repo/.git/worktrees/task",
            },
        },
        {
            behaviour: "keeps a Windows drive path as written",
            kind: "file",
            text: "gitdir: C:/work/repo/.git/worktrees/task\r\n",
            reading: {
                kind: "linkedWorktreeClaim",
                worktreeRoot: "/work/task",
                dotGit: "/work/task/.git",
                adminDir: "C:/work/repo/.git/worktrees/task",
            },
        },
        {
            behaviour: "reads only the first line of a .git file",
            kind: "file",
            text: "gitdir: /work/repo/.git/worktrees/task\nworktree: /elsewhere\n",
            reading: {
                kind: "linkedWorktreeClaim",
                worktreeRoot: "/work/task",
                dotGit: "/work/task/.git",
                adminDir: "/work/repo/.git/worktrees/task",
            },
        },
        {
            behaviour: "keeps a trailing space as part of the path, as git does",
            kind: "file",
            text: "gitdir: /work/repo/.git/worktrees/task \n",
            reading: {
                kind: "linkedWorktreeClaim",
                worktreeRoot: "/work/task",
                dotGit: "/work/task/.git",
                adminDir: "/work/repo/.git/worktrees/task ",
            },
        },
        {
            behaviour: "refuses a .git file without a gitdir line",
            kind: "file",
            text: "/work/repo/.git/worktrees/task",
            reading: NO_REPOSITORY,
        },
        {
            behaviour: "refuses a .git file with an empty gitdir",
            kind: "file",
            text: "gitdir: \n",
            reading: NO_REPOSITORY,
        },
        {
            behaviour: "refuses a .git file it could not read",
            kind: "file",
            reading: NO_REPOSITORY,
        },
        {
            behaviour: "refuses a linked .git, which could name any repository",
            kind: "symbolicLink",
            reading: NO_REPOSITORY,
        },
        {
            behaviour: "refuses a linked .git even when its target reads like a gitdir line",
            kind: "symbolicLink",
            text: "gitdir: /work/repo/.git/worktrees/task\n",
            reading: NO_REPOSITORY,
        },
        {
            behaviour: "refuses a .git that is neither folder nor file",
            kind: "other",
            reading: NO_REPOSITORY,
        },
    ])("$behaviour", ({ kind, text, reading }) => {
        expect(dotGitReadingOf(candidate, kind, text)).toEqual(reading);
    });
});

describe("linkedWorktreeFilesOf", () => {
    it("names the files git keeps for a linked worktree in its admin folder", () => {
        expect(linkedWorktreeFilesOf("/work/repo/.git/worktrees/task")).toEqual({
            commondir: "/work/repo/.git/worktrees/task/commondir",
            gitdir: "/work/repo/.git/worktrees/task/gitdir",
        });
    });
});

describe("backPointerPathOf", () => {
    it.each([
        {
            behaviour: "takes an absolute back-pointer as written",
            text: "/work/task/.git\n",
            path: "/work/task/.git",
        },
        {
            behaviour: "resolves a relative back-pointer against the admin folder",
            text: "../../../../task/.git",
            path: "/work/task/.git",
        },
    ])("$behaviour", ({ text, path }) => {
        expect(backPointerPathOf("/work/repo/.git/worktrees/task", text)).toBe(path);
    });
});

describe("linkedWorktreeOriginOf", () => {
    const claim: LinkedWorktreeClaim = {
        kind: "linkedWorktreeClaim",
        worktreeRoot: "/work/task",
        dotGit: "/work/task/.git",
        adminDir: "/work/repo/.git/worktrees/task",
    };
    const verified = {
        claim,
        adminDirRealPath: "/work/repo/.git/worktrees/task",
        commondirText: "../..\n",
        backPointerRealPath: "/work/task/.git",
    };
    const repository: CodeOrigin = {
        kind: "repository",
        commonDir: "/work/repo/.git",
        worktreeRoot: "/work/task",
    };
    // VS Code lowercases the drive letter; git writes it as it was given.
    const windowsClaim: LinkedWorktreeClaim = {
        kind: "linkedWorktreeClaim",
        worktreeRoot: "c:/work/task",
        dotGit: "c:/work/task/.git",
        adminDir: "C:/work/repo/.git/worktrees/task",
    };
    const windowsRepository: CodeOrigin = {
        kind: "repository",
        commonDir: "C:/work/repo/.git",
        worktreeRoot: "c:/work/task",
    };

    it.each([
        {
            behaviour: "takes the repository of a worktree its admin folder names back",
            facts: verified,
            origin: repository,
        },
        {
            behaviour: "accepts an absolute commondir that names the same folder",
            facts: { ...verified, commondirText: "/work/repo/.git" },
            origin: repository,
        },
        {
            behaviour: "takes the realpath of an admin folder reached through a link",
            facts: {
                ...verified,
                claim: { ...claim, adminDir: "/links/task-admin" },
            },
            origin: repository,
        },
        {
            behaviour: "refuses an admin folder that does not exist",
            facts: { ...verified, adminDirRealPath: undefined },
            origin: NO_REPOSITORY,
        },
        {
            behaviour: "refuses an admin folder without a commondir file",
            facts: { ...verified, commondirText: undefined },
            origin: NO_REPOSITORY,
        },
        {
            behaviour: "refuses an admin folder at the filesystem root",
            facts: { ...verified, adminDirRealPath: "/" },
            origin: NO_REPOSITORY,
        },
        {
            behaviour: "refuses an admin folder outside a worktrees folder, such as a submodule's",
            facts: {
                ...verified,
                adminDirRealPath: "/work/repo/.git/modules/task",
            },
            origin: NO_REPOSITORY,
        },
        {
            behaviour: "refuses a separate git folder, which has no commondir",
            facts: {
                ...verified,
                adminDirRealPath: "/elsewhere/task.git",
                commondirText: undefined,
            },
            origin: NO_REPOSITORY,
        },
        {
            behaviour: "refuses a commondir that names another folder",
            facts: { ...verified, commondirText: "../../../other/.git" },
            origin: NO_REPOSITORY,
        },
        {
            behaviour: "refuses an admin folder that names another worktree back",
            facts: { ...verified, backPointerRealPath: "/work/other-task/.git" },
            origin: NO_REPOSITORY,
        },
        {
            behaviour: "confirms a back-pointer that spells the drive letter in another case",
            facts: {
                claim: windowsClaim,
                adminDirRealPath: "C:/work/repo/.git/worktrees/task",
                commondirText: "../..\n",
                backPointerRealPath: "C:/work/task/.git",
            },
            origin: windowsRepository,
        },
        {
            behaviour:
                "confirms an absolute commondir that spells the drive letter in another case",
            facts: {
                claim: windowsClaim,
                adminDirRealPath: "C:/work/repo/.git/worktrees/task",
                commondirText: "c:/work/repo/.git\n",
                backPointerRealPath: "c:/work/task/.git",
            },
            origin: windowsRepository,
        },
        {
            behaviour: "refuses a back-pointer that differs from the claim in more than the drive",
            facts: {
                claim: windowsClaim,
                adminDirRealPath: "C:/work/repo/.git/worktrees/task",
                commondirText: "../..\n",
                backPointerRealPath: "C:/work/Task/.git",
            },
            origin: NO_REPOSITORY,
        },
        {
            behaviour: "refuses an admin folder whose back-pointer names nothing",
            facts: { ...verified, backPointerRealPath: undefined },
            origin: NO_REPOSITORY,
        },
    ])("$behaviour", ({ facts, origin }) => {
        expect(linkedWorktreeOriginOf(facts)).toEqual(origin);
    });
});
