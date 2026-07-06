import { beforeEach, describe, expect, it, vi } from "vitest";

import { DirectoryNotFound, NoWorkspaceFolderFoundError } from "../domain/errors";
import { ArtifactService } from "./ArtifactService";

/**
 * Builds the service with bare-`vi.fn()` port doubles cast to the interfaces.
 * The service only ever calls these methods, so structural doubles keep the
 * test free of any `vscode` surface (the subject imports only pure ports).
 */
function createService() {
    const vsWorkspace = {
        getWorkspaceFolderForDocument: vi.fn(),
        findGitRoot: vi.fn(),
        readDirectory: vi.fn(),
        readFile: vi.fn(),
        createWatcher: vi.fn(),
    };
    const vsSettings = {
        getConfigFolder: vi.fn().mockReturnValue(".camunda"),
    };

    const service = new ArtifactService(vsWorkspace as never, vsSettings as never);

    return { service, vsWorkspace, vsSettings };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("ArtifactService.getWorkspaceRoot", () => {
    it("returns the VS Code workspace folder when one exists", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.getWorkspaceFolderForDocument.mockReturnValue("/work");

        await expect(service.getWorkspaceRoot("/work/sub")).resolves.toBe("/work");
        expect(vsWorkspace.findGitRoot).not.toHaveBeenCalled();
    });

    it("falls back to the enclosing git repo when no workspace folder is found", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.getWorkspaceFolderForDocument.mockImplementation(() => {
            throw new NoWorkspaceFolderFoundError();
        });
        vsWorkspace.findGitRoot.mockResolvedValue("/repo");

        await expect(service.getWorkspaceRoot("/repo/sub")).resolves.toBe("/repo");
    });

    it("falls back to the document directory when neither folder nor git root exist", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.getWorkspaceFolderForDocument.mockImplementation(() => {
            throw new NoWorkspaceFolderFoundError();
        });
        vsWorkspace.findGitRoot.mockResolvedValue(undefined);

        await expect(service.getWorkspaceRoot("/some/dir")).resolves.toBe("/some/dir");
    });

    it("rethrows errors that are not NoWorkspaceFolderFoundError", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.getWorkspaceFolderForDocument.mockImplementation(() => {
            throw new Error("boom");
        });

        await expect(service.getWorkspaceRoot("/work/sub")).rejects.toThrow("boom");
        expect(vsWorkspace.findGitRoot).not.toHaveBeenCalled();
    });
});

describe("ArtifactService.readDirectory", () => {
    it("returns the empty list when the directory is missing", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.readDirectory.mockRejectedValue(new DirectoryNotFound("/x"));

        await expect(service.readDirectory("/x", ".json")).resolves.toEqual([]);
    });

    it("rethrows non-DirectoryNotFound read errors", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.readDirectory.mockRejectedValue(new Error("EACCES"));

        await expect(service.readDirectory("/x", ".json")).rejects.toThrow("EACCES");
    });

    it("returns only files matching the extension and recurses into subdirectories", async () => {
        const { service, vsWorkspace } = createService();
        // Sub-directory entries are resolved by path, so the recursion can be
        // driven purely off the requested folder.
        vsWorkspace.readDirectory.mockImplementation((folder: string) => {
            if (folder === "/root") {
                return Promise.resolve([
                    ["a.json", "file"],
                    ["b.txt", "file"],
                    ["nested", "directory"],
                ]);
            }
            if (folder === "/root/nested") {
                return Promise.resolve([["c.json", "file"]]);
            }
            return Promise.resolve([]);
        });

        await expect(service.readDirectory("/root", ".json")).resolves.toEqual([
            "/root/a.json",
            "/root/nested/c.json",
        ]);
    });
});

describe("ArtifactService.collectTemplateDirs", () => {
    it("walks up nearest-first and stops at the workspace root", async () => {
        const { service, vsWorkspace } = createService();
        // Every probed directory exists, so the result mirrors the walk order.
        vsWorkspace.readDirectory.mockResolvedValue([]);

        await expect(
            service.collectTemplateDirs("/work/a/b", "/work", ".camunda"),
        ).resolves.toEqual([
            "/work/a/b/.camunda/element-templates",
            "/work/a/.camunda/element-templates",
            "/work/.camunda/element-templates",
        ]);
    });

    it("swallows DirectoryNotFound but keeps directories that exist", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.readDirectory.mockImplementation((path: string) => {
            if (path === "/work/a/.camunda/element-templates") {
                throw new DirectoryNotFound(path);
            }
            return Promise.resolve([]);
        });

        await expect(service.collectTemplateDirs("/work/a", "/work", ".camunda")).resolves.toEqual([
            "/work/.camunda/element-templates",
        ]);
    });

    it("rethrows non-DirectoryNotFound errors raised during the walk", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.readDirectory.mockRejectedValue(new Error("EIO"));

        await expect(service.collectTemplateDirs("/work/a", "/work", ".camunda")).rejects.toThrow(
            "EIO",
        );
    });

    it("does not walk above a document that already is the workspace root", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.readDirectory.mockResolvedValue([]);

        await expect(service.collectTemplateDirs("/work", "/work", ".camunda")).resolves.toEqual([
            "/work/.camunda/element-templates",
        ]);
        // The single probe proves the loop broke at the root, not via the
        // filesystem-root parent guard.
        expect(vsWorkspace.readDirectory).toHaveBeenCalledTimes(1);
    });

    it("collects dirs when the workspace root carries a trailing slash (drive-root)", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.readDirectory.mockResolvedValue([]);

        // A drive-root workspace opened as `C:\` surfaces as `/c:/`; the trailing
        // slash must not defeat the `startsWith`/`===` containment guard.
        await expect(service.collectTemplateDirs("/c:/proj", "/c:/", ".camunda")).resolves.toEqual([
            "/c:/proj/.camunda/element-templates",
            "/c:/.camunda/element-templates",
        ]);
    });

    it("guards against an infinite loop at the filesystem root", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.readDirectory.mockResolvedValue([]);

        // documentDir starts at "/", which is neither equal to nor under the
        // sentinel root, so the loop must not even run.
        await expect(service.collectTemplateDirs("/", "/work", ".camunda")).resolves.toEqual([]);
        expect(vsWorkspace.readDirectory).not.toHaveBeenCalled();
    });
});

describe("ArtifactService.getArtifactPaths", () => {
    it("aggregates JSON paths from every template dir and reports the extension", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.getWorkspaceFolderForDocument.mockReturnValue("/work");
        vsWorkspace.readDirectory.mockImplementation((path: string) => {
            if (path === "/work/a/.camunda/element-templates") {
                return Promise.resolve([["near.json", "file"]]);
            }
            if (path === "/work/.camunda/element-templates") {
                return Promise.resolve([["root.json", "file"]]);
            }
            return Promise.resolve([]);
        });

        const [paths, extension] = await service.getArtifactPaths("/work/a");

        expect(extension).toBe(".json");
        // Nearest-first dir order is preserved across the aggregation.
        expect(paths).toEqual([
            "/work/a/.camunda/element-templates/near.json",
            "/work/.camunda/element-templates/root.json",
        ]);
    });
});

describe("ArtifactService.getPayloadPaths", () => {
    it("aggregates JSON paths from the payloads subfolders", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.getWorkspaceFolderForDocument.mockReturnValue("/work");
        vsWorkspace.readDirectory.mockImplementation((path: string) => {
            if (path === "/work/.camunda/payloads") {
                return Promise.resolve([["order.json", "file"]]);
            }
            return Promise.resolve([]);
        });

        await expect(service.getPayloadPaths("/work")).resolves.toEqual([
            "/work/.camunda/payloads/order.json",
        ]);
    });
});

describe("ArtifactService.readFile", () => {
    it("delegates to the workspace port", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.readFile.mockResolvedValue("contents");

        await expect(service.readFile("/work/a.json")).resolves.toBe("contents");
        expect(vsWorkspace.readFile).toHaveBeenCalledWith("/work/a.json");
    });
});

describe("ArtifactService.createWatcher", () => {
    it("watches the config glob from the workspace root and wires all three handlers to a template refresh", async () => {
        const { service, vsWorkspace } = createService();
        vsWorkspace.getWorkspaceFolderForDocument.mockReturnValue("/work");
        const handle = { dispose: vi.fn() };
        vsWorkspace.createWatcher.mockReturnValue(handle);
        const target = { setElementTemplates: vi.fn().mockResolvedValue(true) };

        const result = await service.createWatcher("/work/proc/order.bpmn", target as never);

        expect(result).toEqual({ disposables: [handle], errors: [] });
        expect(vsWorkspace.createWatcher).toHaveBeenCalledWith(
            "/work",
            "**/.camunda/element-templates/**/*.json",
            expect.objectContaining({
                onCreate: expect.any(Function),
                onChange: expect.any(Function),
                onDelete: expect.any(Function),
            }),
        );

        // Each handler must trigger a refresh keyed by the originating editor.
        const handlers = vsWorkspace.createWatcher.mock.calls[0][2];
        handlers.onCreate("/work/.camunda/element-templates/x.json");
        handlers.onChange("/work/.camunda/element-templates/x.json");
        handlers.onDelete("/work/.camunda/element-templates/x.json");
        expect(target.setElementTemplates).toHaveBeenCalledTimes(3);
        expect(target.setElementTemplates).toHaveBeenNthCalledWith(1, "/work/proc/order.bpmn");
    });

    it("logs a rejected template refresh instead of leaking an unhandled rejection", async () => {
        const { vsWorkspace, vsSettings } = createService();
        vsWorkspace.getWorkspaceFolderForDocument.mockReturnValue("/work");
        vsWorkspace.createWatcher.mockReturnValue({ dispose: vi.fn() });
        const logger = {
            logDebug: vi.fn(),
            logInfo: vi.fn(),
            logWarning: vi.fn(),
            logError: vi.fn(),
        };
        const service = new ArtifactService(
            vsWorkspace as never,
            vsSettings as never,
            logger as never,
        );
        const boom = new Error("templates dir unreadable");
        const target = { setElementTemplates: vi.fn().mockRejectedValue(boom) };

        await service.createWatcher("/work/proc/order.bpmn", target as never);
        const handlers = vsWorkspace.createWatcher.mock.calls[0][2];
        handlers.onChange("/work/.camunda/element-templates/x.json");
        // The `.catch` guard runs on a later microtask; flush before asserting.
        await Promise.resolve();
        await Promise.resolve();

        expect(logger.logError).toHaveBeenCalledWith(boom);
    });
});
