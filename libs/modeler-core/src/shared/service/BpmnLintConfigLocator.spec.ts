import { beforeEach, describe, expect, it, vi } from "vitest";

import { DirectoryNotFound } from "../domain/errors";
import { BpmnLintConfigLocator } from "./BpmnLintConfigLocator";

/**
 * Builds the locator with bare port doubles. Workspace-root resolution is reused
 * from {@link ArtifactService}, so that collaborator is doubled to just return a
 * configured root rather than re-testing ArtifactService's fallback chain here.
 */
function createLocator() {
    const vsWorkspace = {
        readDirectory: vi.fn(),
        readFile: vi.fn(),
        createWatcher: vi.fn(),
    };
    const vsSettings = { getConfigFolder: vi.fn().mockReturnValue(".camunda") };
    const artifacts = { getWorkspaceRoot: vi.fn().mockResolvedValue("/work") };

    const locator = new BpmnLintConfigLocator(
        vsWorkspace as never,
        vsSettings as never,
        artifacts as never,
    );

    return { locator, vsWorkspace, vsSettings, artifacts };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnLintConfigLocator.findNearestConfig", () => {
    it("returns the nearest .bpmnlintrc, preferring closer directories", async () => {
        const { locator, vsWorkspace } = createLocator();
        // Both the document dir and the root carry a config; the nearer wins.
        vsWorkspace.readDirectory.mockImplementation((path: string) => {
            if (path === "/work/a" || path === "/work") {
                return Promise.resolve([[".bpmnlintrc", "file"]]);
            }
            return Promise.resolve([]);
        });

        await expect(locator.findNearestConfig("/work/a")).resolves.toBe("/work/a/.bpmnlintrc");
    });

    it("falls back to <configFolder>/.bpmnlintrc within a level", async () => {
        const { locator, vsWorkspace } = createLocator();
        vsWorkspace.readDirectory.mockImplementation((path: string) => {
            if (path === "/work/a/.camunda") {
                return Promise.resolve([[".bpmnlintrc", "file"]]);
            }
            return Promise.resolve([]);
        });

        await expect(locator.findNearestConfig("/work/a")).resolves.toBe(
            "/work/a/.camunda/.bpmnlintrc",
        );
    });

    it("prefers a level's direct .bpmnlintrc over its <configFolder> variant", async () => {
        const { locator, vsWorkspace } = createLocator();
        vsWorkspace.readDirectory.mockResolvedValue([[".bpmnlintrc", "file"]]);

        await expect(locator.findNearestConfig("/work")).resolves.toBe("/work/.bpmnlintrc");
        // The direct file matched first, so the `.camunda` dir is never probed.
        expect(vsWorkspace.readDirectory).toHaveBeenCalledTimes(1);
        expect(vsWorkspace.readDirectory).toHaveBeenCalledWith("/work");
    });

    it("treats a missing directory as absent rather than erroring", async () => {
        const { locator, vsWorkspace } = createLocator();
        vsWorkspace.readDirectory.mockRejectedValue(new DirectoryNotFound("/work"));

        await expect(locator.findNearestConfig("/work")).resolves.toBeUndefined();
    });

    it("stops at the workspace root and returns undefined when absent", async () => {
        const { locator, vsWorkspace } = createLocator();
        const probed: string[] = [];
        vsWorkspace.readDirectory.mockImplementation((path: string) => {
            probed.push(path);
            return Promise.resolve([]);
        });

        await expect(locator.findNearestConfig("/work/a")).resolves.toBeUndefined();
        // The walk covers each level + its config folder, nearest-first, and
        // never ascends above the workspace root.
        expect(probed).toEqual(["/work/a", "/work/a/.camunda", "/work", "/work/.camunda"]);
    });
});

describe("BpmnLintConfigLocator.readConfig", () => {
    it("delegates to the workspace port", async () => {
        const { locator, vsWorkspace } = createLocator();
        vsWorkspace.readFile.mockResolvedValue("{}");

        await expect(locator.readConfig("/work/.bpmnlintrc")).resolves.toBe("{}");
        expect(vsWorkspace.readFile).toHaveBeenCalledWith("/work/.bpmnlintrc");
    });
});

describe("BpmnLintConfigLocator.createWatcher", () => {
    it("watches **/.bpmnlintrc from the workspace root and re-pushes on every change", async () => {
        const { locator, vsWorkspace } = createLocator();
        const handle = { dispose: vi.fn() };
        vsWorkspace.createWatcher.mockReturnValue(handle);
        const target = { setBpmnlintConfig: vi.fn().mockResolvedValue(true) };

        const result = await locator.createWatcher("/work/proc/order.bpmn", target as never);

        expect(result).toEqual({ disposables: [handle], errors: [] });
        expect(vsWorkspace.createWatcher).toHaveBeenCalledWith(
            "/work",
            "**/.bpmnlintrc",
            expect.objectContaining({
                onCreate: expect.any(Function),
                onChange: expect.any(Function),
                onDelete: expect.any(Function),
            }),
        );

        const handlers = vsWorkspace.createWatcher.mock.calls[0][2];
        handlers.onCreate("/work/.bpmnlintrc");
        handlers.onChange("/work/.bpmnlintrc");
        handlers.onDelete("/work/.bpmnlintrc");
        expect(target.setBpmnlintConfig).toHaveBeenCalledTimes(3);
        expect(target.setBpmnlintConfig).toHaveBeenNthCalledWith(1, "/work/proc/order.bpmn");
    });
});
