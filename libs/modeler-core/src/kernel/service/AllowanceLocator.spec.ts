import { beforeEach, describe, expect, it } from "vitest";

import { GitLayoutFiles, writeLinkedWorktree, writeRepository } from "../../testing/gitLayout";
import { InMemoryInstalledPackages } from "../../testing/InMemoryInstalledPackages";
import { allowanceKeyOf, LOCAL_HOST } from "../domain/allowance";
import { RepositoryFilesPort } from "../port/repositoryFilesPort";
import { AllowanceLocator } from "./AllowanceLocator";

const PLUGIN = ".camunda/plugins/trace";

describe("AllowanceLocator", () => {
    let files: InMemoryInstalledPackages;
    let allowances: AllowanceLocator;

    beforeEach(() => {
        files = new InMemoryInstalledPackages();
        allowances = new AllowanceLocator(files, LOCAL_HOST);
        writeRepository(files, "/work/repo");
        files.createDirectory(`/work/repo/${PLUGIN}`);
    });

    it("gives the same place in the main and a linked worktree one key", () => {
        writeLinkedWorktree(files, "/work/repo", "/work/task");
        files.createDirectory(`/work/task/${PLUGIN}`);

        const main = allowances.allowanceAt("plugin", `/work/repo/${PLUGIN}`);
        const task = allowances.allowanceAt("plugin", `/work/task/${PLUGIN}`);

        expect(main).toEqual({
            kind: "plugin",
            host: LOCAL_HOST,
            origin: { kind: "repository", path: "/work/repo/.git" },
            addOn: PLUGIN,
        });
        expect(allowanceKeyOf(task)).toBe(allowanceKeyOf(main));
    });

    it("takes a linked folder to the repository of its target", () => {
        writeRepository(files, "/work/other");
        files.createDirectory(`/work/other/${PLUGIN}`);
        files.createSymbolicLink(`/work/repo/.camunda/plugins/borrowed`, `/work/other/${PLUGIN}`);

        expect(allowances.allowanceAt("plugin", "/work/repo/.camunda/plugins/borrowed")).toEqual({
            kind: "plugin",
            host: LOCAL_HOST,
            origin: { kind: "repository", path: "/work/other/.git" },
            addOn: PLUGIN,
        });
    });

    it("takes a linked folder outside every repository as a folder origin at its target", () => {
        files.createDirectory("/downloads/foreign");
        files.createSymbolicLink("/work/repo/.camunda/plugins/foreign", "/downloads/foreign");

        expect(
            allowances.locatedAllowanceAt("plugin", "/work/repo/.camunda/plugins/foreign"),
        ).toEqual({
            kind: "plugin",
            host: LOCAL_HOST,
            origin: { kind: "folder", path: "/downloads/foreign" },
            addOn: "",
        });
    });

    it("takes a folder not on disk as a folder origin at the path given, located nowhere", () => {
        expect(allowances.allowanceAt("rulePackage", "/gone/rules")).toEqual({
            kind: "rulePackage",
            host: LOCAL_HOST,
            origin: { kind: "folder", path: "/gone/rules" },
            addOn: "",
        });
        expect(allowances.locatedAllowanceAt("rulePackage", "/gone/rules")).toBeUndefined();
    });

    it("gives a linked worktree its repository's key when git spells the drive in upper case", () => {
        // The posix tree holds the drive as a folder.
        const stored = (path: string) => path.replace(/^[Cc]:/, "/c:");
        const windowsLayout: GitLayoutFiles = {
            writeFile: (path, content) => files.writeFile(stored(path), content),
            createDirectory: (path) => files.createDirectory(stored(path)),
        };
        // As Windows looks paths up whatever the drive case, and Node's realpathSync keeps it.
        const windowsFiles: RepositoryFilesPort = {
            realPath: (path) => (files.realPath(stored(path)) === undefined ? undefined : path),
            entryKindOf: (path) => files.entryKindOf(stored(path)),
            readTextFile: (path) => files.readTextFile(stored(path)),
        };
        writeRepository(windowsLayout, "C:/Users/u/A");
        writeLinkedWorktree(windowsLayout, "C:/Users/u/A", "C:/Users/u/wt");
        windowsLayout.createDirectory(`c:/Users/u/A/${PLUGIN}`);
        windowsLayout.createDirectory(`c:/Users/u/wt/${PLUGIN}`);
        const onWindows = new AllowanceLocator(windowsFiles, LOCAL_HOST);

        const main = onWindows.allowanceAt("plugin", `c:/Users/u/A/${PLUGIN}`);
        const linked = onWindows.allowanceAt("plugin", `c:/Users/u/wt/${PLUGIN}`);

        expect(linked.origin.kind).toBe("repository");
        expect(allowanceKeyOf(linked)).toBe(allowanceKeyOf(main));
    });

    it("puts the host into the key", () => {
        const remote = new AllowanceLocator(files, "ssh-remote+box");

        const remoteAllowance = remote.allowanceAt("plugin", `/work/repo/${PLUGIN}`);

        expect(remoteAllowance.host).toBe("ssh-remote+box");
        expect(allowanceKeyOf(remoteAllowance)).not.toBe(
            allowanceKeyOf(allowances.allowanceAt("plugin", `/work/repo/${PLUGIN}`)),
        );
    });
});
