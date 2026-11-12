import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { allowanceKeyOf, LOCAL_HOST } from "../domain/allowance";
import { toWorkspacePath } from "../domain/workspacePath";
import { RepositoryFilesPort } from "../port/repositoryFilesPort";
import { AllowanceLocator } from "./AllowanceLocator";
import { RepositoryLocator } from "./RepositoryLocator";

function orUndefined<T>(read: () => T): T | undefined {
    try {
        return read();
    } catch {
        return undefined;
    }
}

const diskFiles: RepositoryFilesPort = {
    realPath: (path) => orUndefined(() => toWorkspacePath(realpathSync(path))),
    entryKindOf: (path) =>
        orUndefined(() => {
            const stats = lstatSync(path);
            if (stats.isSymbolicLink()) return "symbolicLink";
            if (stats.isDirectory()) return "directory";
            return stats.isFile() ? "file" : "other";
        }),
    readTextFile: (path) => orUndefined(() => readFileSync(path, "utf8")),
};

// The user's own config, such as commit signing, must not reach these repositories.
const HERMETIC_GIT_ENV = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Spec",
    GIT_AUTHOR_EMAIL: "spec@example.invalid",
    GIT_COMMITTER_NAME: "Spec",
    GIT_COMMITTER_EMAIL: "spec@example.invalid",
};

function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
        env: HERMETIC_GIT_ENV,
    });
}

function initRepository(path: string): void {
    mkdirSync(path);
    git(path, "init", "--quiet");
    git(path, "commit", "--quiet", "--allow-empty", "-m", "init");
}

// `git worktree add --relative-paths` came with git 2.48.
const supportsRelativeWorktreePaths = (() => {
    const [major, minor] = (git(tmpdir(), "--version").match(/(\d+)\.(\d+)/) ?? [])
        .slice(1)
        .map(Number);
    return major > 2 || (major === 2 && minor >= 48);
})();

describe("RepositoryLocator on worktrees git itself wrote", () => {
    let root: string;
    let repo: string;
    let locator: RepositoryLocator;

    beforeEach(() => {
        root = toWorkspacePath(realpathSync(mkdtempSync(join(tmpdir(), "repository-locator-"))));
        repo = `${root}/repo`;
        initRepository(repo);
        locator = new RepositoryLocator(diskFiles);
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("takes the main worktree and a linked worktree to one repository", () => {
        git(repo, "worktree", "add", "--quiet", "--detach", "../task");
        mkdirSync(`${repo}/plugins/trace`, { recursive: true });
        mkdirSync(`${root}/task/plugins/trace`, { recursive: true });

        expect(locator.originOf(`${repo}/plugins/trace`)).toEqual({
            kind: "repository",
            commonDir: `${repo}/.git`,
            worktreeRoot: repo,
        });
        expect(locator.originOf(`${root}/task/plugins/trace`)).toEqual({
            kind: "repository",
            commonDir: `${repo}/.git`,
            worktreeRoot: `${root}/task`,
        });
    });

    it("gives a folder in the main and in a linked worktree one allowance key", () => {
        git(repo, "worktree", "add", "--quiet", "--detach", "../task");
        mkdirSync(`${repo}/plugins/trace`, { recursive: true });
        mkdirSync(`${root}/task/plugins/trace`, { recursive: true });
        const allowances = new AllowanceLocator(diskFiles, LOCAL_HOST);

        const main = allowances.allowanceAt("plugin", `${repo}/plugins/trace`);
        const task = allowances.allowanceAt("plugin", `${root}/task/plugins/trace`);

        expect(main.origin).toEqual({ kind: "repository", path: `${repo}/.git` });
        expect(allowanceKeyOf(task)).toBe(allowanceKeyOf(main));
    });

    it.skipIf(!supportsRelativeWorktreePaths)(
        "takes a linked worktree written with relative paths to its repository",
        () => {
            git(repo, "worktree", "add", "--quiet", "--detach", "--relative-paths", "../task");

            expect(locator.originOf(`${root}/task`)).toMatchObject({
                commonDir: `${repo}/.git`,
            });
        },
    );

    it("finds no repository for a submodule's checkout", () => {
        const library = `${root}/library`;
        initRepository(library);
        git(
            repo,
            "-c",
            "protocol.file.allow=always",
            "submodule",
            "add",
            "--quiet",
            library,
            "vendor/library",
        );

        expect(locator.originOf(`${repo}/vendor/library`)).toEqual({ kind: "noRepository" });
    });
});
