import { describe, expect, it, vi } from "vitest";

import { InMemoryWorkspace } from "../../testing";
import { FetchedTemplateFile, formatSourceSlotRecord } from "../domain/sourceCacheRefresh";
import { MarketplaceCache } from "./MarketplaceCache";

const SOURCE = "source a";
const OTHER_SOURCE = "source b";

function createWorkspace(files: Record<string, string> = {}) {
    return new InMemoryWorkspace([], files);
}

function template(repoPath: string, content = "{}"): FetchedTemplateFile {
    return { contentType: "element-templates", repoPath, content };
}

function slotRecord(sourceIdentity: string, generation: number): string {
    return formatSourceSlotRecord({ sourceIdentity, generation });
}

async function servedContents(cache: MarketplaceCache, workspace: InMemoryWorkspace) {
    const servedPaths = await cache.getCachedTemplatePaths();
    return Promise.all(servedPaths.map((path) => workspace.readFile(path)));
}

/** Lets every write through except those to a path ending in `failingSuffix`. */
function failWritesTo(workspace: InMemoryWorkspace, failingSuffix: string) {
    const writeFile = workspace.writeFile.bind(workspace);
    return vi.spyOn(workspace, "writeFile").mockImplementation(async (path, content) => {
        if (path.endsWith(failingSuffix)) {
            throw new Error("disk full");
        }
        await writeFile(path, content);
    });
}

describe("MarketplaceCache.replaceSource", () => {
    it("writes each file under <root>/<id>/<index>/<generation>/<contentType>/<path>", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);

        await cache.replaceSource("acme", 0, SOURCE, [template("templates/a.json")]);

        expect(workspace.files).toEqual(
            new Map([
                ["/cache/acme/0/1/element-templates/templates/a.json", "{}"],
                ["/cache/acme/0/slot.json", slotRecord(SOURCE, 1)],
            ]),
        );
    });

    it("drops files the new set no longer contains", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "old a",
            "/cache/acme/0/element-templates/b.json": "old b",
            "/cache/acme/1/element-templates/c.json": "sibling",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        await cache.replaceSource("acme", 0, SOURCE, [template("a.json", "new a")]);

        expect(workspace.files).toEqual(
            new Map([
                ["/cache/acme/1/element-templates/c.json", "sibling"],
                ["/cache/acme/0/1/element-templates/a.json", "new a"],
                ["/cache/acme/0/slot.json", slotRecord(SOURCE, 1)],
            ]),
        );
    });

    it("writes each replace into the next generation and drops the one before", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);
        await cache.replaceSource("acme", 0, OTHER_SOURCE, [template("a.json", "first")]);

        await cache.replaceSource("acme", 0, SOURCE, [template("a.json", "second")]);

        expect(workspace.files).toEqual(
            new Map([
                ["/cache/acme/0/2/element-templates/a.json", "second"],
                ["/cache/acme/0/slot.json", slotRecord(SOURCE, 2)],
            ]),
        );
    });

    it("serves only the files of the later of two overlapping replaces", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);
        await cache.replaceSource("acme", 0, SOURCE, [template("old.json", "old")]);

        await Promise.all([
            cache.replaceSource("acme", 0, SOURCE, [template("a.json", "a")]),
            cache.replaceSource("acme", 0, OTHER_SOURCE, [template("b.json", "b")]),
        ]);

        expect(await servedContents(cache, workspace)).toEqual(["b"]);
        expect(await cache.cachedSlots("acme")).toEqual([
            { sourceIndex: 0, sourceIdentity: OTHER_SOURCE },
        ]);
    });

    it("removes a slot only after the replace before it finished", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);

        await Promise.all([
            cache.replaceSource("acme", 0, SOURCE, [template("a.json", "a")]),
            cache.removeSource("acme", 0),
        ]);

        expect(await servedContents(cache, workspace)).toEqual([]);
        expect(await cache.cachedSlots("acme")).toEqual([]);
    });

    it("keeps the old files when a write fails", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);
        await cache.replaceSource("acme", 0, SOURCE, [template("a.json", "old a")]);
        failWritesTo(workspace, "/b.json");

        await expect(
            cache.replaceSource("acme", 0, SOURCE, [
                template("a.json", "new a"),
                template("b.json", "new b"),
            ]),
        ).rejects.toThrow("disk full");

        expect(await servedContents(cache, workspace)).toEqual(["old a"]);
    });

    it("keeps the old files and their source when the slot record cannot be written", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);
        await cache.replaceSource("acme", 0, SOURCE, [template("a.json", "old a")]);
        failWritesTo(workspace, "/slot.json");

        await expect(
            cache.replaceSource("acme", 0, OTHER_SOURCE, [template("a.json", "new a")]),
        ).rejects.toThrow("disk full");

        expect(await servedContents(cache, workspace)).toEqual(["old a"]);
        expect(await cache.cachedSlots("acme")).toEqual([
            { sourceIndex: 0, sourceIdentity: SOURCE },
        ]);
    });

    it("does not serve the files a failed replace left behind", async () => {
        const workspace = createWorkspace();
        const cache = new MarketplaceCache("/cache", workspace);
        const failingWrites = failWritesTo(workspace, "/b.json");
        await expect(
            cache.replaceSource("acme", 0, SOURCE, [template("a.json"), template("b.json")]),
        ).rejects.toThrow("disk full");
        failingWrites.mockRestore();

        await cache.replaceSource("acme", 0, SOURCE, [template("c.json", "c")]);

        expect(await servedContents(cache, workspace)).toEqual(["c"]);
    });

    it.each([
        ["a parent-traversal path", "../../../settings.json"],
        ["an absolute posix path", "/etc/passwd"],
        ["a backslash traversal path", "..\\..\\settings.json"],
    ])("rejects %s before writing anything", async (_label, unsafeRepoPath) => {
        const cachedFiles = { "/cache/acme/0/element-templates/a.json": "last good" };
        const workspace = createWorkspace(cachedFiles);
        const cache = new MarketplaceCache("/cache", workspace);

        await expect(
            cache.replaceSource("acme", 0, SOURCE, [template("b.json"), template(unsafeRepoPath)]),
        ).rejects.toThrow(/unsafe template path/);
        expect(workspace.files).toEqual(new Map(Object.entries(cachedFiles)));
    });
});

describe("MarketplaceCache.cachedSlots", () => {
    it("names the source each slot of one marketplace recorded", async () => {
        const cache = new MarketplaceCache("/cache", createWorkspace());
        await cache.replaceSource("acme", 0, SOURCE, [template("a.json")]);
        await cache.replaceSource("acme", 2, OTHER_SOURCE, [template("b.json")]);
        await cache.replaceSource("globex", 1, SOURCE, [template("c.json")]);

        expect(await cache.cachedSlots("acme")).toEqual([
            { sourceIndex: 0, sourceIdentity: SOURCE },
            { sourceIndex: 2, sourceIdentity: OTHER_SOURCE },
        ]);
    });

    it("lists the numeric slots cached before slots recorded their source", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/element-templates/a.json": "{}",
            "/cache/acme/2/element-templates/b.json": "{}",
            "/cache/acme/notes/element-templates/c.json": "{}",
            "/cache/globex/1/element-templates/d.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.cachedSlots("acme")).toEqual([
            { sourceIndex: 0, sourceIdentity: undefined },
            { sourceIndex: 2, sourceIdentity: undefined },
        ]);
    });

    it("names no source for a slot whose record is torn", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/slot.json": '{"sourceIdentity":"sou',
            "/cache/acme/0/1/element-templates/a.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.cachedSlots("acme")).toEqual([
            { sourceIndex: 0, sourceIdentity: undefined },
        ]);
    });

    it("returns [] for a marketplace with nothing cached", async () => {
        const cache = new MarketplaceCache("/cache", createWorkspace());

        expect(await cache.cachedSlots("acme")).toEqual([]);
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

    it("serves the generation a slot record names", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/slot.json": slotRecord(SOURCE, 2),
            "/cache/acme/0/1/element-templates/old.json": "{}",
            "/cache/acme/0/2/element-templates/live.json": "{}",
            "/cache/acme/0/3/element-templates/unfinished.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.getCachedTemplatePaths()).toEqual([
            "/cache/acme/0/2/element-templates/live.json",
        ]);
    });

    it("serves no generation of a slot whose record is torn", async () => {
        const workspace = createWorkspace({
            "/cache/acme/0/slot.json": "",
            "/cache/acme/0/1/element-templates/a.json": "{}",
        });
        const cache = new MarketplaceCache("/cache", workspace);

        expect(await cache.getCachedTemplatePaths()).toEqual([]);
    });

    it("fails when a slot record cannot be read", async () => {
        const workspace = createWorkspace({ "/cache/acme/0/slot.json": slotRecord(SOURCE, 1) });
        vi.spyOn(workspace, "readFile").mockRejectedValue(new Error("permission denied"));
        const cache = new MarketplaceCache("/cache", workspace);

        await expect(cache.getCachedTemplatePaths()).rejects.toThrow("permission denied");
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
