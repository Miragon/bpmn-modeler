import { describe, expect, it, vi } from "vitest";

import { createTestHost } from "../../../testing";
import { ArtifactService } from "../../../kernel/service/ArtifactService";
import { BpmnLintConfigLocator } from "./BpmnLintConfigLocator";

function createLocator(files: Record<string, string> = {}, folders = ["/work"]) {
    const { workspace, settings } = createTestHost({ folders, files });
    const artifacts = new ArtifactService(workspace, settings);

    const locator = new BpmnLintConfigLocator(workspace, settings, artifacts);

    return { locator, workspace, settings };
}

describe("BpmnLintConfigLocator.findNearestConfig", () => {
    it("returns the nearest .bpmnlintrc, preferring closer directories", async () => {
        // Both the document dir and the root carry a config; the nearer wins.
        const { locator } = createLocator({
            "/work/a/.bpmnlintrc": "{}",
            "/work/.bpmnlintrc": "{}",
        });

        await expect(locator.findNearestConfig("/work/a")).resolves.toBe("/work/a/.bpmnlintrc");
    });

    it("falls back to <configFolder>/.bpmnlintrc within a level", async () => {
        const { locator } = createLocator({ "/work/a/.camunda/.bpmnlintrc": "{}" });

        await expect(locator.findNearestConfig("/work/a")).resolves.toBe(
            "/work/a/.camunda/.bpmnlintrc",
        );
    });

    it("prefers a level's direct .bpmnlintrc over its <configFolder> variant", async () => {
        const { locator, workspace } = createLocator({
            "/work/.bpmnlintrc": "{}",
            "/work/.camunda/.bpmnlintrc": "{}",
        });
        const readDirectory = vi.spyOn(workspace, "readDirectory");

        await expect(locator.findNearestConfig("/work")).resolves.toBe("/work/.bpmnlintrc");
        // The direct file matched first, so the `.camunda` dir is never probed.
        expect(readDirectory.mock.calls).toEqual([["/work"]]);
    });

    it("treats a missing directory as absent rather than erroring", async () => {
        const { locator } = createLocator();

        await expect(locator.findNearestConfig("/work")).resolves.toBeUndefined();
    });

    it("stops at the workspace root and returns undefined when absent", async () => {
        const { locator, workspace } = createLocator({ "/work/a/order.bpmn": "<xml/>" });
        const readDirectory = vi.spyOn(workspace, "readDirectory");

        await expect(locator.findNearestConfig("/work/a")).resolves.toBeUndefined();
        // The walk covers each level + its config folder, nearest-first, and
        // never ascends above the workspace root.
        expect(readDirectory.mock.calls.map(([path]) => path)).toEqual([
            "/work/a",
            "/work/a/.camunda",
            "/work",
            "/work/.camunda",
        ]);
    });

    it("finds a .bpmnlintrc in a drive-root workspace", async () => {
        const { locator } = createLocator({ "/c:/.bpmnlintrc": "{}" }, ["/c:/"]);

        await expect(locator.findNearestConfig("/c:/proj")).resolves.toBe("/c:/.bpmnlintrc");
    });

    it("finds a .bpmnlintrc when the workspace is the filesystem root", async () => {
        const { locator } = createLocator({ "/.bpmnlintrc": "{}" }, ["/"]);

        await expect(locator.findNearestConfig("/proj")).resolves.toBe("/.bpmnlintrc");
    });

    it.each([
        { location: "<dir>", config: "//server/share/work/.bpmnlintrc" },
        { location: "<configFolder>", config: "//server/share/work/.camunda/.bpmnlintrc" },
    ])("finds a $location/.bpmnlintrc in a workspace on a UNC share", async ({ config }) => {
        const { locator } = createLocator({ [config]: "{}" }, ["//server/share/work"]);

        await expect(locator.findNearestConfig("//server/share/work/a")).resolves.toBe(config);
    });
});

describe("BpmnLintConfigLocator.readConfig", () => {
    it("delegates to the workspace port", async () => {
        const { locator } = createLocator({ "/work/.bpmnlintrc": "{}" });

        await expect(locator.readConfig("/work/.bpmnlintrc")).resolves.toBe("{}");
    });
});

describe("BpmnLintConfigLocator.createWatcher", () => {
    it("re-pushes the lint config on every change of a .bpmnlintrc its lookup reads", async () => {
        const { locator, workspace } = createLocator();
        const target = { setBpmnlintConfig: vi.fn().mockResolvedValue(true) };

        const result = await locator.createWatcher("/work/proc/order.bpmn", target);

        expect(result.disposables).toHaveLength(1);
        expect(result.errors).toEqual([]);

        await workspace.writeFile("/work/.bpmnlintrc", "{}");
        await workspace.writeFile("/work/.bpmnlintrc", '{ "extends": "x" }');
        workspace.deleteFile("/work/.bpmnlintrc");
        await workspace.writeFile("/work/proc/.bpmnlintrc.bak", "{}");
        await workspace.writeFile("/elsewhere/.bpmnlintrc", "{}");
        expect(target.setBpmnlintConfig).toHaveBeenCalledTimes(3);
        expect(target.setBpmnlintConfig).toHaveBeenNthCalledWith(1, "/work/proc/order.bpmn");

        result.disposables[0].dispose();
        await workspace.writeFile("/work/proc/.bpmnlintrc", "{}");
        expect(target.setBpmnlintConfig).toHaveBeenCalledTimes(3);
    });

    it("re-pushes the lint config when the folder holding .bpmnlintrc is deleted as one event", async () => {
        const { locator, workspace } = createLocator({ "/work/.camunda/.bpmnlintrc": "{}" });
        const target = { setBpmnlintConfig: vi.fn().mockResolvedValue(true) };
        await locator.createWatcher("file:///work/proc/order.bpmn", target);

        await workspace.deleteDirectory("/work/.camunda");

        expect(target.setBpmnlintConfig).toHaveBeenCalledExactlyOnceWith(
            "file:///work/proc/order.bpmn",
        );
    });

    it("re-pushes the lint config when a folder holding .bpmnlintrc is moved in as one event", async () => {
        const { locator, workspace } = createLocator();
        const target = { setBpmnlintConfig: vi.fn().mockResolvedValue(true) };
        await locator.createWatcher("file:///work/proc/order.bpmn", target);

        workspace.createDirectory("/work/proc/.camunda", {
            "/work/proc/.camunda/.bpmnlintrc": "{}",
        });

        expect(target.setBpmnlintConfig).toHaveBeenCalledExactlyOnceWith(
            "file:///work/proc/order.bpmn",
        );
    });

    it("ignores a .bpmnlintrc beside the document's lookup chain", async () => {
        const { locator, workspace } = createLocator({ "/work/other/.camunda/.bpmnlintrc": "{}" });
        const target = { setBpmnlintConfig: vi.fn().mockResolvedValue(true) };
        await locator.createWatcher("file:///work/proc/order.bpmn", target);

        await workspace.writeFile("/work/other/.bpmnlintrc", "{}");
        await workspace.deleteDirectory("/work/other/.camunda");

        expect(target.setBpmnlintConfig).not.toHaveBeenCalled();
    });

    it("follows a config folder changed after the watcher started", async () => {
        const { locator, workspace, settings } = createLocator();
        const target = { setBpmnlintConfig: vi.fn().mockResolvedValue(true) };
        await locator.createWatcher("file:///work/proc/order.bpmn", target);

        settings.values.configFolder = ".config";
        await workspace.writeFile("/work/.config/.bpmnlintrc", "{}");

        expect(target.setBpmnlintConfig).toHaveBeenCalledExactlyOnceWith(
            "file:///work/proc/order.bpmn",
        );
    });

    it("watches from a UNC document's directory when only its server holds a git repository", async () => {
        const { locator, workspace } = createLocator(
            { "file://server/.git/HEAD": "ref: refs/heads/main" },
            [],
        );

        await locator.createWatcher("file://server/share/loose/order.bpmn", {
            setBpmnlintConfig: vi.fn(),
        });

        expect(workspace.watchers.map(({ root }) => root)).toEqual(["file://server/share/loose"]);
    });
});
