import { describe, expect, it, vi } from "vitest";

import { InMemoryWorkspace } from "../../testing";
import { MarketplaceCache } from "./MarketplaceCache";

function createWorkspace(files: Record<string, string> = {}) {
    return new InMemoryWorkspace([], files);
}

describe("MarketplaceCache.replaceSource", () => {
    it("writes each file under <root>/<id>/<index>/<contentType>/<path>", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);

        await cache.replaceSource("acme", 0, [
            { contentType: "element-templates", repoPath: "templates/a.json", content: "{}" },
        ]);

        expect(workspace.files).toEqual(
            new Map([["/cache/acme/0/element-templates/templates/a.json", "{}"]]),
        );
    });

    it("drops files the new set no longer contains", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "old a",
            "/cache/acme/0/element-templates/b.json": "old b",
            "/cache/acme/1/element-templates/c.json": "sibling",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        await cache.replaceSource("acme", 0, [
            { contentType: "element-templates", repoPath: "a.json", content: "new a" },
        ]);

        expect(workspace.files).toEqual(
            new Map([
                ["/cache/acme/1/element-templates/c.json", "sibling"],
                ["/cache/acme/0/element-templates/a.json", "new a"],
            ]),
        );
    });

    it("keeps the old files when a write fails", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);
        await cache.replaceSource("acme", 0, [
            { contentType: "element-templates", repoPath: "a.json", content: "old a" },
        ]);
        const writeFile = workspace.writeFile.bind(workspace);
        vi.spyOn(workspace, "writeFile").mockImplementation(async (path, content) => {
            if (path.endsWith("/b.json")) {
                throw new Error("disk full");
            }
            await writeFile(path, content);
        });

        await expect(
            cache.replaceSource("acme", 0, [
                { contentType: "element-templates", repoPath: "a.json", content: "new a" },
                { contentType: "element-templates", repoPath: "b.json", content: "new b" },
            ]),
        ).rejects.toThrow("disk full");

        const servedPaths = await cache.getCachedTemplatePaths();
        expect(await Promise.all(servedPaths.map((path) => workspace.readFile(path)))).toEqual([
            "old a",
        ]);
    });

    it.each([
        ["a parent-traversal path", "../../../settings.json"],
        ["an absolute posix path", "/etc/passwd"],
        ["a backslash traversal path", "..\\..\\settings.json"],
    ])("rejects %s before deleting anything", async (_label, unsafeRepoPath) => {
        const cachedFiles = { "/cache/acme/0/element-templates/a.json": "last good" };
        const workspace = createWorkspace(cachedFiles);
        const cache = new MarketplaceCache("/cache", workspace);

        await expect(
            cache.replaceSource("acme", 0, [
                { contentType: "element-templates", repoPath: "b.json", content: "{}" },
                { contentType: "element-templates", repoPath: unsafeRepoPath, content: "{}" },
            ]),
        ).rejects.toThrow(/unsafe template path/);
        expect(workspace.files).toEqual(new Map(Object.entries(cachedFiles)));
    });
});

describe("MarketplaceCache.sourceIndexes", () => {
    it("lists the numeric source slots of one marketplace", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "{}",
            "/cache/acme/2/element-templates/b.json": "{}",
            "/cache/acme/notes/element-templates/c.json": "{}",
            "/cache/globex/1/element-templates/d.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.sourceIndexes("acme")).toEqual([0, 2]);
    });

    it("returns [] for a marketplace with nothing cached", async () => {
        const cache = new MarketplaceCache("/cache", createWorkspace());

        expect(await cache.sourceIndexes("acme")).toEqual([]);
    });
});

describe("MarketplaceCache.removeSource", () => {
    it("deletes one source slot and keeps its siblings", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "{}",
            "/cache/acme/1/element-templates/b.json": "{}",
            "/cache/globex/1/element-templates/c.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        await cache.removeSource("acme", 1);

        expect([...workspace.files.keys()]).toEqual([
            "/cache/acme/0/element-templates/a.json",
            "/cache/globex/1/element-templates/c.json",
        ]);
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
