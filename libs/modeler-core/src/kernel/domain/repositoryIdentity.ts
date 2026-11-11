import { isRootedPath } from "./rootContainment";
import {
    joinWorkspacePath,
    lastWorkspacePathSegment,
    parentWorkspacePath,
    toWorkspacePath,
    withLowerCaseDrive,
} from "./workspacePath";

export type FileEntryKind = "file" | "directory" | "symbolicLink" | "other";

/**
 * The repository that holds code: its common directory, which every worktree
 * of one clone shares, and the worktree the code sits in. Code in no
 * repository it can prove has none.
 */
export type CodeOrigin =
    | { readonly kind: "repository"; readonly commonDir: string; readonly worktreeRoot: string }
    | { readonly kind: "noRepository" };

export interface DotGitCandidate {
    readonly worktreeRoot: string;
    readonly dotGit: string;
}

/** A `.git` file names an admin folder; it is a linked worktree only once that folder confirms it. */
export interface LinkedWorktreeClaim {
    readonly kind: "linkedWorktreeClaim";
    readonly worktreeRoot: string;
    readonly dotGit: string;
    readonly adminDir: string;
}

export type DotGitReading = CodeOrigin | LinkedWorktreeClaim;

/** What the admin folder a claim names says about it; any path is `undefined` when it names nothing. */
export interface LinkedWorktreeFacts {
    readonly claim: LinkedWorktreeClaim;
    readonly adminDirRealPath: string | undefined;
    readonly commondirText: string | undefined;
    /** The realpath of the `.git` file the admin folder's `gitdir` names. */
    readonly backPointerRealPath: string | undefined;
}

const DOT_GIT = ".git";
const GITDIR_LINE_PREFIX = "gitdir: ";
const WORKTREES_FOLDER = "worktrees";
const NO_REPOSITORY: CodeOrigin = { kind: "noRepository" };

/**
 * Where a `.git` entry may hold `folder`, nearest first. Only the nearest
 * existing one counts, as for git itself: one that proves nothing must not
 * hand the code to a repository further up.
 */
export function dotGitCandidatesOf(folder: string): DotGitCandidate[] {
    const candidates: DotGitCandidate[] = [];
    for (
        let worktreeRoot: string | undefined = folder;
        worktreeRoot !== undefined;
        worktreeRoot = parentWorkspacePath(worktreeRoot)
    ) {
        candidates.push({ worktreeRoot, dotGit: joinWorkspacePath(worktreeRoot, DOT_GIT) });
    }
    return candidates;
}

/**
 * A `.git` folder is a repository's common directory. A `.git` file only
 * claims a linked worktree. A link could name any repository, so it, like
 * anything else, proves none.
 */
export function dotGitReadingOf(
    candidate: DotGitCandidate,
    kind: FileEntryKind,
    text: string | undefined,
): DotGitReading {
    if (kind === "directory") {
        return {
            kind: "repository",
            commonDir: candidate.dotGit,
            worktreeRoot: candidate.worktreeRoot,
        };
    }
    const gitdir = kind === "file" && text !== undefined ? gitdirOf(text) : undefined;
    return gitdir === undefined
        ? NO_REPOSITORY
        : {
              kind: "linkedWorktreeClaim",
              worktreeRoot: candidate.worktreeRoot,
              dotGit: candidate.dotGit,
              adminDir: gitPathOf(candidate.worktreeRoot, gitdir),
          };
}

export function linkedWorktreeFilesOf(adminDir: string): { commondir: string; gitdir: string } {
    return {
        commondir: joinWorkspacePath(adminDir, "commondir"),
        gitdir: joinWorkspacePath(adminDir, "gitdir"),
    };
}

export function backPointerPathOf(adminDir: string, gitdirText: string): string {
    return gitPathOf(adminDir, gitdirText.trim());
}

/**
 * A claim holds only when the admin folder sits directly in its repository's
 * `worktrees` folder and names this `.git` file back. The first stops a `.git`
 * file that names an admin folder of its own making, the second one that names
 * another worktree's. A submodule or a separate git folder fails both.
 */
export function linkedWorktreeOriginOf(facts: LinkedWorktreeFacts): CodeOrigin {
    const { claim, adminDirRealPath, commondirText, backPointerRealPath } = facts;
    if (adminDirRealPath === undefined || commondirText === undefined) {
        return NO_REPOSITORY;
    }
    const commonDir = commonDirHolding(adminDirRealPath);
    const isConfirmed =
        commonDir !== undefined &&
        isSamePath(gitPathOf(adminDirRealPath, commondirText.trim()), commonDir) &&
        backPointerRealPath !== undefined &&
        isSamePath(backPointerRealPath, claim.dotGit);
    return isConfirmed
        ? { kind: "repository", commonDir, worktreeRoot: claim.worktreeRoot }
        : NO_REPOSITORY;
}

/** Git writes its paths with the drive as given; the claim comes from the host's spelling. */
function isSamePath(path: string, other: string): boolean {
    return withLowerCaseDrive(path) === withLowerCaseDrive(other);
}

/** The folder above `<commonDir>/worktrees/<name>`; `undefined` for an admin folder anywhere else. */
function commonDirHolding(adminDir: string): string | undefined {
    const worktreesFolder = parentWorkspacePath(adminDir);
    return worktreesFolder !== undefined &&
        lastWorkspacePathSegment(worktreesFolder) === WORKTREES_FOLDER
        ? parentWorkspacePath(worktreesFolder)
        : undefined;
}

/** As git reads it: only the line ending goes, so a trailing space is part of the path. */
function gitdirOf(dotGitText: string): string | undefined {
    const firstLine = dotGitText.split(/\r?\n/)[0];
    if (!firstLine.startsWith(GITDIR_LINE_PREFIX)) {
        return undefined;
    }
    const gitdir = firstLine.slice(GITDIR_LINE_PREFIX.length);
    return gitdir === "" ? undefined : gitdir;
}

/** Git writes a path either absolute or relative to the file that holds it. */
function gitPathOf(base: string, path: string): string {
    return isRootedPath(path) ? toWorkspacePath(path) : joinWorkspacePath(base, path);
}
