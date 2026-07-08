import { describe, expect, it, vi } from "vitest";

import { DirectoryNotFound } from "../../shared/domain/errors";
import { WorkspacePort } from "../../shared/domain/hostPorts";
import { MarketplaceCache } from "./MarketplaceCache";

type DirEntry = [string, "file" | "directory"];

/**
 * Minimal `WorkspacePort` double capturing `writeFile` (the sole port method
 * `write` touches), `readDirectory` (the read path), and `deleteDirectory` (the
 * prune path). `readDirectory` is driven per-path by an in-memory tree; an
 * unknown path throws `DirectoryNotFound`, mirroring a host reading a folder
 * that was never cached.
 */
function createWorkspace(tree: Record<string, DirEntry[]> = {}) {
    return {
        writeFile: vi.fn<(path: string, content: string) => Promise<void>>().mockResolvedValue(),
        deleteDirectory: vi.fn<(path: string) => Promise<void>>().mockResolvedValue(),
        readDirectory: vi.fn<(path: string) => Promise<DirEntry[]>>(async (path) => {
            const entries = tree[path];
            if (entries === undefined) {
                throw new DirectoryNotFound(path);
            }
            return entries;
        }),
    } as unknown as WorkspacePort & {
        writeFile: ReturnType<typeof vi.fn>;
        deleteDirectory: ReturnType<typeof vi.fn>;
        readDirectory: ReturnType<typeof vi.fn>;
    };
}

describe("MarketplaceCache.write", () => {
    it("writes a normal path under <root>/<id>/<index>/<contentType>/<path>", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);

        await cache.write("acme", 0, "element-templates", "templates/a.json", "{}");

        expect(workspace.writeFile).toHaveBeenCalledWith(
            "/cache/acme/0/element-templates/templates/a.json",
            "{}",
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
        expect(workspace.writeFile).not.toHaveBeenCalled();
    });
});

describe("MarketplaceCache.getCachedTemplatePaths", () => {
    it("returns [] when nothing is cached yet (cache root absent)", async () => {
        // No entry for `/cache` → readDirectory throws DirectoryNotFound.
        const cache = new MarketplaceCache("/cache", createWorkspace());

        expect(await cache.getCachedTemplatePaths()).toEqual([]);
    });

    it("recurses the element-templates segment, keeping only .json files", async () => {
        const workspace = createWorkspace({
            "/cache": [["acme", "directory"]],
            "/cache/acme": [["0", "directory"]],
            "/cache/acme/0": [["element-templates", "directory"]],
            "/cache/acme/0/element-templates": [
                ["a.json", "file"],
                ["README.md", "file"],
                ["nested", "directory"],
            ],
            "/cache/acme/0/element-templates/nested": [
                ["b.json", "file"],
                ["notes.txt", "file"],
            ],
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.getCachedTemplatePaths()).toEqual([
            "/cache/acme/0/element-templates/a.json",
            "/cache/acme/0/element-templates/nested/b.json",
        ]);
    });

    it("scopes to element-templates, ignoring sibling content types", async () => {
        const workspace = createWorkspace({
            "/cache": [["acme", "directory"]],
            "/cache/acme": [["0", "directory"]],
            "/cache/acme/0": [
                ["element-templates", "directory"],
                ["lint-rules", "directory"],
            ],
            "/cache/acme/0/element-templates": [["a.json", "file"]],
            // Never read: getCachedTemplatePaths only descends into element-templates.
            "/cache/acme/0/lint-rules": [["x.json", "file"]],
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.getCachedTemplatePaths()).toEqual([
            "/cache/acme/0/element-templates/a.json",
        ]);
        expect(workspace.readDirectory).not.toHaveBeenCalledWith("/cache/acme/0/lint-rules");
    });

    it("treats a source slot lacking element-templates as empty, not an error", async () => {
        const workspace = createWorkspace({
            "/cache": [["acme", "directory"]],
            "/cache/acme": [["0", "directory"]],
            // No element-templates child → listJsonRecursive hits DirectoryNotFound.
            "/cache/acme/0": [["lint-rules", "directory"]],
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.getCachedTemplatePaths()).toEqual([]);
    });

    it("aggregates across marketplaces and source indexes", async () => {
        const workspace = createWorkspace({
            "/cache": [
                ["acme", "directory"],
                ["globex", "directory"],
            ],
            "/cache/acme": [
                ["0", "directory"],
                ["1", "directory"],
            ],
            "/cache/acme/0": [["element-templates", "directory"]],
            "/cache/acme/0/element-templates": [["a.json", "file"]],
            "/cache/acme/1": [["element-templates", "directory"]],
            "/cache/acme/1/element-templates": [["b.json", "file"]],
            "/cache/globex": [["0", "directory"]],
            "/cache/globex/0": [["element-templates", "directory"]],
            "/cache/globex/0/element-templates": [["c.json", "file"]],
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
            "/cache": [
                ["acme", "directory"],
                ["stale", "directory"],
                ["globex", "directory"],
            ],
        });
        const cache = new MarketplaceCache("/cache", workspace);

        const pruned = await cache.prune(new Set(["acme", "globex"]));

        expect(pruned).toEqual(["stale"]);
        expect(workspace.deleteDirectory).toHaveBeenCalledOnce();
        expect(workspace.deleteDirectory).toHaveBeenCalledWith("/cache/stale");
    });

    it("deletes every slot when the registered set is empty", async () => {
        const workspace = createWorkspace({
            "/cache": [
                ["acme", "directory"],
                ["globex", "directory"],
            ],
        });
        const cache = new MarketplaceCache("/cache", workspace);

        const pruned = await cache.prune(new Set());

        expect(pruned).toEqual(["acme", "globex"]);
        expect(workspace.deleteDirectory).toHaveBeenCalledWith("/cache/acme");
        expect(workspace.deleteDirectory).toHaveBeenCalledWith("/cache/globex");
    });

    it("is a no-op when the cache root does not exist yet", async () => {
        // No entry for `/cache` → readDirectory throws DirectoryNotFound → [].
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.prune(new Set(["acme"]))).toEqual([]);
        expect(workspace.deleteDirectory).not.toHaveBeenCalled();
    });
});
