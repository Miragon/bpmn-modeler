import { describe, expect, it, vi } from "vitest";

import { InMemoryWorkspace } from "../../testing";
import { MarketplaceCache } from "./MarketplaceCache";

function createWorkspace(files: Record<string, string> = {}) {
    return new InMemoryWorkspace([], files);
}

describe("MarketplaceCache.write", () => {
    it("writes a normal path under <root>/<id>/<index>/<contentType>/<path>", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);

        await cache.write("acme", 0, "element-templates", "templates/a.json", "{}");

        expect(workspace.files).toEqual(
            new Map([["/cache/acme/0/element-templates/templates/a.json", "{}"]]),
        );
    });

    it.each([
        ["a parent-traversal path", "../../../settings.json"],
        ["an absolute posix path", "/etc/passwd"],
        ["a backslash traversal path", "..\\..\\settings.json"],
    ])("rejects %s and never writes", async (_label, repoPath) => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);

        await expect(cache.write("acme", 0, "element-templates", repoPath, "{}")).rejects.toThrow(
            /unsafe template path/,
        );
        expect(workspace.files.size).toBe(0);
    });
});

describe("MarketplaceCache.getCachedTemplatePaths", () => {
    it("returns [] when nothing is cached yet (cache root absent)", async () => {
        const cache = new MarketplaceCache("/cache", createWorkspace());

        expect(await cache.getCachedTemplatePaths()).toEqual([]);
    });

    it("recurses the element-templates segment, keeping only .json files", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "{}",
            "/cache/acme/0/element-templates/README.md": "",
            "/cache/acme/0/element-templates/nested/b.json": "{}",
            "/cache/acme/0/element-templates/nested/notes.txt": "",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.getCachedTemplatePaths()).toEqual([
            "/cache/acme/0/element-templates/a.json",
            "/cache/acme/0/element-templates/nested/b.json",
        ]);
    });

    it("scopes to element-templates, ignoring sibling content types", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "{}",
            "/cache/acme/0/lint-rules/x.json": "{}",
        });
        const readDirectory = vi.spyOn(workspace, "readDirectory");
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.getCachedTemplatePaths()).toEqual([
            "/cache/acme/0/element-templates/a.json",
        ]);
        expect(readDirectory).not.toHaveBeenCalledWith("/cache/acme/0/lint-rules");
    });

    it("treats a source slot lacking element-templates as empty, not an error", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/lint-rules/x.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.getCachedTemplatePaths()).toEqual([]);
    });

    it("aggregates across marketplaces and source indexes", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "{}",
            "/cache/acme/1/element-templates/b.json": "{}",
            "/cache/globex/0/element-templates/c.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.getCachedTemplatePaths()).toEqual([
            "/cache/acme/0/element-templates/a.json",
            "/cache/acme/1/element-templates/b.json",
            "/cache/globex/0/element-templates/c.json",
        ]);
    });
});

describe("MarketplaceCache.prune", () => {
    it("deletes an unregistered slot and keeps the registered ones", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "{}",
            "/cache/stale/0/element-templates/s.json": "{}",
            "/cache/stale/1/element-templates/t.json": "{}",
            "/cache/globex/0/element-templates/c.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        const pruned = await cache.prune(new Set(["acme", "globex"]));

        expect(pruned).toEqual(["stale"]);
        expect([...workspace.files.keys()]).toEqual([
            "/cache/acme/0/element-templates/a.json",
            "/cache/globex/0/element-templates/c.json",
        ]);
    });

    it("deletes every slot when the registered set is empty", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "{}",
            "/cache/globex/0/element-templates/c.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        const pruned = await cache.prune(new Set());

        expect(pruned).toEqual(["acme", "globex"]);
        expect(workspace.files.size).toBe(0);
    });

    it("is a no-op when the cache root does not exist yet", async () => {
        const workspace = createWorkspace();
        const deleteDirectory = vi.spyOn(workspace, "deleteDirectory");
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.prune(new Set(["acme"]))).toEqual([]);
        expect(deleteDirectory).not.toHaveBeenCalled();
    });
});
