import { describe, expect, it, vi } from "vitest";

import { createTestHost } from "../../testing";
import { BpmnLintConfigLocator } from "./BpmnLintConfigLocator";

/**
 * Workspace-root resolution is reused from {@link ArtifactService}, so that
 * collaborator is doubled to just return a configured root rather than
 * re-testing ArtifactService's fallback chain here.
 */
function createLocator(files: Record<string, string> = {}) {
    const { workspace, settings } = createTestHost({ files });
    const artifacts = { getWorkspaceRoot: vi.fn().mockResolvedValue("/work") };

    const locator = new BpmnLintConfigLocator(workspace, settings, artifacts as never);

    return { locator, workspace };
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
});

describe("BpmnLintConfigLocator.readConfig", () => {
    it("delegates to the workspace port", async () => {
        const { locator } = createLocator({ "/work/.bpmnlintrc": "{}" });

        await expect(locator.readConfig("/work/.bpmnlintrc")).resolves.toBe("{}");
    });
});

describe("BpmnLintConfigLocator.createWatcher", () => {
    it("watches **/.bpmnlintrc from the workspace root and re-pushes on every change", async () => {
        const { locator, workspace } = createLocator();
        const target = { setBpmnlintConfig: vi.fn().mockResolvedValue(true) };

        const result = await locator.createWatcher("/work/proc/order.bpmn", target as never);

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
});
