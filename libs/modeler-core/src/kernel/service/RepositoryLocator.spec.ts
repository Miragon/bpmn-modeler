import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryInstalledPackages } from "../../testing/InMemoryInstalledPackages";
import { CodeOrigin } from "../domain/repositoryIdentity";
import { RepositoryLocator } from "./RepositoryLocator";

const NO_REPOSITORY: CodeOrigin = { kind: "noRepository" };
const PLUGIN = ".camunda/plugins/trace";

describe("RepositoryLocator", () => {
    let files: InMemoryInstalledPackages;
    let locator: RepositoryLocator;

    beforeEach(() => {
        files = new InMemoryInstalledPackages(() => "unused");
        locator = new RepositoryLocator(files);
        files.createDirectory("/work/repo/.git/objects");
        files.createDirectory(`/work/repo/${PLUGIN}`);
    });

    /** Lays out a linked worktree as `git worktree add` does, absolute or relative. */
    function addWorktree(name: string, paths: "absolute" | "relative" = "absolute"): string {
        const worktree = `/work/${name}`;
        const adminDir = `/work/repo/.git/worktrees/${name}`;
        files.writeFile(
            `${worktree}/.git`,
            `gitdir: ${paths === "absolute" ? adminDir : `../repo/.git/worktrees/${name}`}\n`,
        );
        files.writeFile(`${adminDir}/commondir`, "../..\n");
        files.writeFile(
            `${adminDir}/gitdir`,
            `${paths === "absolute" ? `${worktree}/.git` : `../../../../${name}/.git`}\n`,
        );
        files.createDirectory(`${worktree}/${PLUGIN}`);
        return worktree;
    }

    it("takes code in the main worktree to its repository", () => {
        expect(locator.originOf(`/work/repo/${PLUGIN}`)).toEqual({
            kind: "repository",
            commonDir: "/work/repo/.git",
            worktreeRoot: "/work/repo",
        });
    });

    it.each(["absolute", "relative"] as const)(
        "takes code in a linked worktree written with %s paths to the same repository",
        (paths) => {
            const task = addWorktree("task", paths);

            expect(locator.originOf(`${task}/${PLUGIN}`)).toEqual({
                kind: "repository",
                commonDir: "/work/repo/.git",
                worktreeRoot: task,
            });
        },
    );

    it("follows a .git file that names its admin folder through a link", () => {
        const task = addWorktree("task");
        files.createSymbolicLink("/links/repo-git", "/work/repo/.git");
        files.writeFile(`${task}/.git`, "gitdir: /links/repo-git/worktrees/task\n");

        expect(locator.originOf(`${task}/${PLUGIN}`)).toMatchObject({
            commonDir: "/work/repo/.git",
        });
    });

    it("refuses a .git file that names another worktree's admin folder", () => {
        addWorktree("task");
        files.writeFile("/downloads/evil/.git", "gitdir: /work/repo/.git/worktrees/task\n");
        files.createDirectory(`/downloads/evil/${PLUGIN}`);

        expect(locator.originOf(`/downloads/evil/${PLUGIN}`)).toEqual(NO_REPOSITORY);
    });

    it("refuses a .git file that names an admin folder of its own making", () => {
        files.writeFile("/downloads/evil/.git", "gitdir: /downloads/fake/worktrees/evil\n");
        files.writeFile("/downloads/fake/worktrees/evil/commondir", "/work/repo/.git\n");
        files.writeFile("/downloads/fake/worktrees/evil/gitdir", "/downloads/evil/.git\n");
        files.createDirectory(`/downloads/evil/${PLUGIN}`);

        expect(locator.originOf(`/downloads/evil/${PLUGIN}`)).toEqual(NO_REPOSITORY);
    });

    it("refuses a linked .git, which could name any repository", () => {
        files.createDirectory(`/downloads/evil/${PLUGIN}`);
        files.createSymbolicLink("/downloads/evil/.git", "/work/repo/.git");

        expect(locator.originOf(`/downloads/evil/${PLUGIN}`)).toEqual(NO_REPOSITORY);
    });

    it("does not look past a nearest .git that proves nothing, such as a submodule's", () => {
        files.writeFile("/work/repo/vendor/rules/.git", "gitdir: ../../.git/modules/rules\n");
        files.createDirectory("/work/repo/.git/modules/rules");
        files.createDirectory("/work/repo/vendor/rules/node_modules/bpmnlint-plugin-acme");

        expect(
            locator.originOf("/work/repo/vendor/rules/node_modules/bpmnlint-plugin-acme"),
        ).toEqual(NO_REPOSITORY);
    });

    it("finds no repository where no folder above holds a .git", () => {
        files.createDirectory(`/downloads/rules/${PLUGIN}`);

        expect(locator.originOf(`/downloads/rules/${PLUGIN}`)).toEqual(NO_REPOSITORY);
    });
});
