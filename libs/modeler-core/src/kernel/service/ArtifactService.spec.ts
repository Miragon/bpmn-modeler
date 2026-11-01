import { describe, expect, it, vi } from "vitest";

import { createTestHost, TestHostOptions } from "../../testing";
import { ArtifactService } from "./ArtifactService";

function createService(options: TestHostOptions = {}) {
    const { workspace, settings } = createTestHost(options);
    const service = new ArtifactService(workspace, settings);
    return { service, workspace };
}

describe("ArtifactService.findConfigBaseDir", () => {
    it("returns the nearest directory whose config folder holds the file", async () => {
        const { service } = createService({
            files: {
                "/root/.camunda/deployment-targets.json": "{}",
                "/root/nested/.camunda/deployment-targets.json": "{}",
            },
        });

        const baseDir = await service.findConfigBaseDir(
            "/root/nested/deep",
            ".camunda",
            "deployment-targets.json",
            "/root",
        );

        expect(baseDir).toBe("/root/nested");
    });

    it("walks up to the workspace root itself", async () => {
        const { service, workspace } = createService({
            files: { "/root/.camunda/deployment-targets.json": "{}" },
        });
        const readFile = vi.spyOn(workspace, "readFile");

        const baseDir = await service.findConfigBaseDir(
            "/root/nested/deep",
            ".camunda",
            "deployment-targets.json",
            "/root",
        );

        expect(baseDir).toBe("/root");
        expect(readFile.mock.calls.map(([path]) => path)).toEqual([
            "/root/nested/deep/.camunda/deployment-targets.json",
            "/root/nested/.camunda/deployment-targets.json",
            "/root/.camunda/deployment-targets.json",
        ]);
    });

    it("does not look above the workspace root", async () => {
        const { service, workspace } = createService({
            files: { "/.camunda/deployment-targets.json": "{}" },
        });
        const readFile = vi.spyOn(workspace, "readFile");

        const baseDir = await service.findConfigBaseDir(
            "/root/nested",
            ".camunda",
            "deployment-targets.json",
            "/root",
        );

        expect(baseDir).toBeUndefined();
        expect(readFile).not.toHaveBeenCalledWith("/.camunda/deployment-targets.json");
    });

    it("returns undefined when no config folder up to the root holds the file", async () => {
        const { service } = createService();

        const baseDir = await service.findConfigBaseDir(
            "/root/nested",
            ".camunda",
            "deployment-targets.json",
            "/root",
        );

        expect(baseDir).toBeUndefined();
    });

    it("finds the file when the workspace is the filesystem root", async () => {
        const { service } = createService({
            files: { "/.camunda/deployment-targets.json": "{}" },
        });

        const baseDir = await service.findConfigBaseDir(
            "/proj",
            ".camunda",
            "deployment-targets.json",
            "/",
        );

        expect(baseDir).toBe("/");
    });

    it("finds the file in a workspace on a UNC share", async () => {
        const { service } = createService({
            files: { "//server/share/root/.camunda/deployment-targets.json": "{}" },
        });

        const baseDir = await service.findConfigBaseDir(
            "//server/share/root/nested",
            ".camunda",
            "deployment-targets.json",
            "//server/share/root",
        );

        expect(baseDir).toBe("//server/share/root");
    });

    it("does not skip an unreadable nearest file in favor of another destination", async () => {
        const { service, workspace } = createService({
            files: { "/root/.camunda/deployment-targets.json": "{}" },
        });
        const readFile = vi.spyOn(workspace, "readFile").mockRejectedValueOnce(new Error("EACCES"));

        await expect(
            service.findConfigBaseDir(
                "/root/nested",
                ".camunda",
                "deployment-targets.json",
                "/root",
            ),
        ).rejects.toThrow("EACCES");
        expect(readFile).toHaveBeenCalledOnce();
    });
});

describe("ArtifactService.getWorkspaceRoot", () => {
    // Listing any other directory is denied, as in a tree of execute-only
    // directories, so the walk only succeeds by probing `.git` itself.
    function createServiceOutsideWorkspaceFolders(
        gitEntries: Record<string, "directory" | "file">,
    ) {
        const files = Object.fromEntries(
            Object.entries(gitEntries).map(([path, type]) =>
                type === "directory"
                    ? [`${path}/HEAD`, "ref: refs/heads/main"]
                    : [path, "gitdir: /repo/.git/worktrees/feature"],
            ),
        );
        const { service, workspace } = createService({ files });
        const listDirectory = workspace.readDirectory.bind(workspace);
        vi.spyOn(workspace, "readDirectory").mockImplementation(async (path: string) => {
            if (path.endsWith("/.git")) {
                return listDirectory(path);
            }
            throw new Error(`EACCES: permission denied, scandir '${path}'`);
        });
        return service;
    }

    it("returns the VS Code workspace folder when one exists", async () => {
        const { service } = createService({
            folders: ["/work"],
            files: { "/work/sub/.git/HEAD": "ref: refs/heads/main" },
        });

        await expect(service.getWorkspaceRoot("/work/sub")).resolves.toBe("/work");
    });

    it("falls back to the document directory when it holds the git repository", async () => {
        const service = createServiceOutsideWorkspaceFolders({
            "/repo/.git": "directory",
            "/.git": "directory",
        });

        await expect(service.getWorkspaceRoot("/repo")).resolves.toBe("/repo");
    });

    it("falls back to the nearest enclosing git repository", async () => {
        const service = createServiceOutsideWorkspaceFolders({
            "/repo/.git": "directory",
            "/.git": "directory",
        });

        await expect(service.getWorkspaceRoot("/repo/processes/orders")).resolves.toBe("/repo");
    });

    it("recognises the .git file of a worktree or submodule as the repository root", async () => {
        const service = createServiceOutsideWorkspaceFolders({ "/worktrees/feature/.git": "file" });

        await expect(service.getWorkspaceRoot("/worktrees/feature/src")).resolves.toBe(
            "/worktrees/feature",
        );
    });

    it("recognises a git repository at the filesystem root", async () => {
        const service = createServiceOutsideWorkspaceFolders({ "/.git": "directory" });

        await expect(service.getWorkspaceRoot("/tmp/loose")).resolves.toBe("/");
    });

    it("finds a git repository at the UNC share root", async () => {
        const service = createServiceOutsideWorkspaceFolders({
            "//server/share/.git": "directory",
        });

        await expect(service.getWorkspaceRoot("//server/share/repo/processes")).resolves.toBe(
            "//server/share",
        );
    });

    it("stops looking for a git root at the UNC share root", async () => {
        const service = createServiceOutsideWorkspaceFolders({
            "//server/.git": "directory",
            "/.git": "directory",
        });

        await expect(service.getWorkspaceRoot("//server/share/repo/processes")).resolves.toBe(
            "//server/share/repo/processes",
        );
    });

    // VS Code spells a UNC document's editor id `file://server/share/…`.
    it("finds a git repository at the share root of a UNC uri", async () => {
        const service = createServiceOutsideWorkspaceFolders({
            "file://server/share/.git": "directory",
        });

        await expect(service.getWorkspaceRoot("file://server/share/repo/processes")).resolves.toBe(
            "file://server/share",
        );
    });

    it("stops looking for a git root at the share root of a UNC uri", async () => {
        const service = createServiceOutsideWorkspaceFolders({
            "file://server/.git": "directory",
            ".git": "file",
        });

        await expect(service.getWorkspaceRoot("file://server/share/repo/processes")).resolves.toBe(
            "file://server/share/repo/processes",
        );
    });

    // IntelliJ spells a Windows document `file://C:/…`, with no authority.
    it("finds a git repository at the drive root of IntelliJ's Windows spelling", async () => {
        const service = createServiceOutsideWorkspaceFolders({ "file://C:/.git": "directory" });

        await expect(service.getWorkspaceRoot("file://C:/repo/processes")).resolves.toBe(
            "file://C:",
        );
    });

    it("keeps URI-form document directories in URI form", async () => {
        const service = createServiceOutsideWorkspaceFolders({ "file:///repo/.git": "directory" });

        await expect(service.getWorkspaceRoot("file:///repo/processes")).resolves.toBe(
            "file:///repo",
        );
    });

    it("finds the .git file of a worktree whose directory is in URI form", async () => {
        const service = createServiceOutsideWorkspaceFolders({
            "file:///worktrees/feature/.git": "file",
        });

        await expect(service.getWorkspaceRoot("file:///worktrees/feature/src")).resolves.toBe(
            "file:///worktrees/feature",
        );
    });

    it("falls back to the document directory when no git repository encloses it", async () => {
        const service = createServiceOutsideWorkspaceFolders({});

        await expect(service.getWorkspaceRoot("/tmp/loose")).resolves.toBe("/tmp/loose");
    });

    it("rethrows errors that are not NoWorkspaceFolderFoundError", async () => {
        const { service, workspace } = createService();
        vi.spyOn(workspace, "getWorkspaceFolderForDocument").mockImplementation(() => {
            throw new Error("boom");
        });
        const readDirectory = vi.spyOn(workspace, "readDirectory");

        await expect(service.getWorkspaceRoot("/work/sub")).rejects.toThrow("boom");
        expect(readDirectory).not.toHaveBeenCalled();
    });
});

describe("ArtifactService.readDirectory", () => {
    it("returns the empty list when the directory is missing", async () => {
        const { service } = createService();

        await expect(service.readDirectory("/x", ".json")).resolves.toEqual([]);
    });

    it("rethrows non-DirectoryNotFound read errors", async () => {
        const { service, workspace } = createService();
        vi.spyOn(workspace, "readDirectory").mockRejectedValue(new Error("EACCES"));

        await expect(service.readDirectory("/x", ".json")).rejects.toThrow("EACCES");
    });

    it("returns only files matching the extension and recurses into subdirectories", async () => {
        const { service } = createService({
            files: {
                "/root/a.json": "{}",
                "/root/b.txt": "",
                "/root/nested/c.json": "{}",
            },
        });

        await expect(service.readDirectory("/root", ".json")).resolves.toEqual([
            "/root/a.json",
            "/root/nested/c.json",
        ]);
    });
});

describe("ArtifactService.collectTemplateDirs", () => {
    it("walks up nearest-first and stops at the workspace root", async () => {
        // Every probed directory exists, so the result mirrors the walk order.
        const { service } = createService({
            files: {
                "/work/a/b/.camunda/element-templates/t.json": "[]",
                "/work/a/.camunda/element-templates/t.json": "[]",
                "/work/.camunda/element-templates/t.json": "[]",
                "/.camunda/element-templates/t.json": "[]",
            },
        });

        await expect(
            service.collectTemplateDirs("/work/a/b", "/work", ".camunda"),
        ).resolves.toEqual([
            "/work/a/b/.camunda/element-templates",
            "/work/a/.camunda/element-templates",
            "/work/.camunda/element-templates",
        ]);
    });

    it("swallows DirectoryNotFound but keeps directories that exist", async () => {
        const { service } = createService({
            files: { "/work/.camunda/element-templates/t.json": "[]" },
        });

        await expect(service.collectTemplateDirs("/work/a", "/work", ".camunda")).resolves.toEqual([
            "/work/.camunda/element-templates",
        ]);
    });

    it("rethrows non-DirectoryNotFound errors raised during the walk", async () => {
        const { service, workspace } = createService();
        vi.spyOn(workspace, "readDirectory").mockRejectedValue(new Error("EIO"));

        await expect(service.collectTemplateDirs("/work/a", "/work", ".camunda")).rejects.toThrow(
            "EIO",
        );
    });

    it("does not walk above a document that already is the workspace root", async () => {
        const { service, workspace } = createService({
            files: {
                "/work/.camunda/element-templates/t.json": "[]",
                "/.camunda/element-templates/t.json": "[]",
            },
        });
        const readDirectory = vi.spyOn(workspace, "readDirectory");

        await expect(service.collectTemplateDirs("/work", "/work", ".camunda")).resolves.toEqual([
            "/work/.camunda/element-templates",
        ]);
        // The single probe proves the loop broke at the root, not via the
        // filesystem-root parent guard.
        expect(readDirectory).toHaveBeenCalledTimes(1);
    });

    it("collects dirs when the workspace root carries a trailing slash (drive-root)", async () => {
        const { service } = createService({
            files: {
                "/c:/proj/.camunda/element-templates/t.json": "[]",
                "/c:/.camunda/element-templates/t.json": "[]",
            },
        });

        // A drive-root workspace opened as `C:\` surfaces as `/c:/`; the trailing
        // slash must not defeat the `startsWith`/`===` containment guard.
        await expect(service.collectTemplateDirs("/c:/proj", "/c:/", ".camunda")).resolves.toEqual([
            "/c:/proj/.camunda/element-templates",
            "/c:/.camunda/element-templates",
        ]);
    });

    it("collects dirs when the workspace is the filesystem root", async () => {
        const { service } = createService({
            files: {
                "/proj/.camunda/element-templates/t.json": "[]",
                "/.camunda/element-templates/t.json": "[]",
            },
        });

        await expect(service.collectTemplateDirs("/proj", "/", ".camunda")).resolves.toEqual([
            "/proj/.camunda/element-templates",
            "/.camunda/element-templates",
        ]);
    });

    it("keeps the UNC root of the dirs it collects in a workspace on a share", async () => {
        const { service } = createService({
            files: {
                "//server/share/proj/a/.camunda/element-templates/t.json": "[]",
                "//server/share/proj/.camunda/element-templates/t.json": "[]",
            },
        });

        await expect(
            service.collectTemplateDirs("//server/share/proj/a", "//server/share/proj", ".camunda"),
        ).resolves.toEqual([
            "//server/share/proj/a/.camunda/element-templates",
            "//server/share/proj/.camunda/element-templates",
        ]);
    });

    it("guards against an infinite loop at the filesystem root", async () => {
        const { service, workspace } = createService({
            files: { "/.camunda/element-templates/t.json": "[]" },
        });
        const readDirectory = vi.spyOn(workspace, "readDirectory");

        // documentDir starts at "/", which is neither equal to nor under the
        // sentinel root, so the loop must not even run.
        await expect(service.collectTemplateDirs("/", "/work", ".camunda")).resolves.toEqual([]);
        expect(readDirectory).not.toHaveBeenCalled();
    });
});

describe("ArtifactService.getTemplateDirs", () => {
    it("returns the existing template dirs nearest-first", async () => {
        const { service } = createService({
            folders: ["/work"],
            files: {
                "/work/a/.camunda/element-templates/t.json": "[]",
                "/work/.camunda/element-templates/t.json": "[]",
            },
        });

        await expect(service.getTemplateDirs("/work/a")).resolves.toEqual([
            "/work/a/.camunda/element-templates",
            "/work/.camunda/element-templates",
        ]);
    });
});

describe("ArtifactService.getPayloadPaths", () => {
    it("aggregates JSON paths from the payloads subfolders", async () => {
        const { service } = createService({
            folders: ["/work"],
            files: { "/work/.camunda/payloads/order.json": "{}" },
        });

        await expect(service.getPayloadPaths("/work")).resolves.toEqual([
            "/work/.camunda/payloads/order.json",
        ]);
    });
});

describe("ArtifactService.readFile", () => {
    it("delegates to the workspace port", async () => {
        const { service } = createService({ files: { "/work/a.json": "contents" } });

        await expect(service.readFile("/work/a.json")).resolves.toBe("contents");
    });
});

// Hosts address an editor by its document URI, so the watcher starts from a
// `file://` directory.
describe("ArtifactService.createWatcher", () => {
    const EDITOR_ID = "file:///work/proc/order.bpmn";

    it("watches the config glob from the workspace folder and refreshes the editor on every event", async () => {
        const { service, workspace } = createService({ folders: ["/work"] });
        const target = { refreshElementTemplates: vi.fn() };

        const result = await service.createWatcher(EDITOR_ID, target);

        expect(result.disposables).toHaveLength(1);
        expect(result.errors).toEqual([]);

        // Each event must trigger a refresh keyed by the originating editor —
        // including for a bare, extension-less path (the folder-copy case).
        await workspace.writeFile("/work/.camunda/element-templates/copied-folder", "");
        await workspace.writeFile("/work/.camunda/element-templates/x.json", "{}");
        await workspace.writeFile("/work/.camunda/element-templates/x.json", "[]");
        workspace.deleteFile("/work/.camunda/element-templates/x.json");
        await workspace.writeFile("/work/proc/x.json", "{}");
        await workspace.writeFile("/elsewhere/.camunda/element-templates/x.json", "{}");
        expect(target.refreshElementTemplates.mock.calls).toEqual([
            [EDITOR_ID],
            [EDITOR_ID],
            [EDITOR_ID],
            [EDITOR_ID],
        ]);

        result.disposables[0].dispose();
        await workspace.writeFile("/work/.camunda/element-templates/y.json", "{}");
        expect(target.refreshElementTemplates).toHaveBeenCalledTimes(4);
    });

    it("watches from the document's directory when no workspace folder encloses it", async () => {
        const { service, workspace } = createService();
        const target = { refreshElementTemplates: vi.fn() };

        await service.createWatcher("file:///loose/order.bpmn", target);
        await workspace.writeFile("/loose/.camunda/element-templates/a.json", "{}");

        expect(target.refreshElementTemplates).toHaveBeenCalledExactlyOnceWith(
            "file:///loose/order.bpmn",
        );
    });

    it("watches from a UNC document's directory when only its server holds a git repository", async () => {
        const { service, workspace } = createService({
            files: { "file://server/.git/HEAD": "ref: refs/heads/main" },
        });

        await service.createWatcher("file://server/share/loose/order.bpmn", {
            refreshElementTemplates: vi.fn(),
        });

        expect(workspace.watchers.map(({ root }) => root)).toEqual(["file://server/share/loose"]);
    });

    it("watches element templates when the config folder is empty", async () => {
        const { service, workspace } = createService({
            folders: ["/work"],
            settings: { configFolder: "" },
        });
        const target = { refreshElementTemplates: vi.fn() };

        await service.createWatcher(EDITOR_ID, target);
        await workspace.writeFile("/work/element-templates/a.json", "{}");

        expect(target.refreshElementTemplates).toHaveBeenCalledWith(EDITOR_ID);
    });
});
