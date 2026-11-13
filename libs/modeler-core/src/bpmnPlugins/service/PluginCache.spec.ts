import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { allowanceOf, LOCAL_HOST } from "../../kernel/domain/allowance";
import { createTestHost, TestHost } from "../../testing";
import { approvedContent } from "../domain/pluginApproval";
import { PluginCache } from "./PluginCache";
import { DiscoveredPlugin } from "./WorkspacePluginLocator";

const CACHE = "/storage/bpmn-plugins";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 11);

// A prune takes only SHA-256 names, so these specs hash as the hosts do.
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function discovered(
    folder: string,
    name: string,
    script: string,
    style?: string,
): DiscoveredPlugin {
    return {
        plugin: {
            id: folder,
            name,
            allowance: allowanceOf("plugin", folder, { kind: "noRepository" }, LOCAL_HOST),
            scriptPath: `${folder}/client.js`,
            ...(style === undefined ? {} : { stylePath: `${folder}/palette.css` }),
            contentHash: sha256(approvedContent(script, style)),
        },
        script,
        ...(style === undefined ? {} : { style }),
    };
}

const PALETTE = discovered(
    "/work/.camunda/plugins/reduced-palette",
    "Reduced Palette",
    "registerPalette();",
    ".djs-palette {}",
);
const RESIZE = discovered(
    "/work/.camunda/plugins/resize-tasks",
    "Resize Tasks",
    "registerResize();",
);
const PALETTE_HASH = PALETTE.plugin.contentHash;
const RESIZE_HASH = RESIZE.plugin.contentHash;

function setUp(
    files: Record<string, string> = {},
    options: { cacheRoot?: string; now?: () => number } = {},
) {
    const host = createTestHost({ files });
    const inUse = new Set<string>();
    const cache = new PluginCache(
        host.workspace,
        host.notifier,
        options.cacheRoot ?? CACHE,
        () => inUse,
        options.now ?? (() => NOW),
    );
    return { host, cache, inUse };
}

function clockAt(start: number) {
    const clock = { ms: start, now: () => clock.ms };
    return clock;
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

const cachePaths = (host: TestHost) =>
    [...host.workspace.files.keys()].filter((path) => path.startsWith(CACHE)).sort();

function recordCacheWrites(host: TestHost): string[] {
    const writes: string[] = [];
    host.workspace.createWatcher(CACHE, "**/*", {
        onCreate: (path) => writes.push(path),
        onChange: (path) => writes.push(path),
    });
    return writes;
}

interface Hold {
    readonly reached: Promise<void>;
    release(): void;
}

/** Holds the next call to a method until the test releases it; `reached` resolves once it is called. */
function holdNext<T extends object, K extends keyof T>(target: T, method: K): Hold {
    const original = (target[method] as (...args: unknown[]) => Promise<unknown>).bind(target);
    let release: () => void = () => undefined;
    let reach: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
        reach = resolve;
    });
    const spy = vi.spyOn(target, method as never) as unknown as {
        mockImplementationOnce(impl: (...args: unknown[]) => Promise<unknown>): void;
    };
    spy.mockImplementationOnce(async (...args: unknown[]) => {
        reach();
        await held;
        return original(...args);
    });
    return { reached, release };
}

/** Holds the first listing of each path until the test releases it, in the order of `paths`. */
function holdListings(host: TestHost, paths: readonly string[]): Hold[] {
    const holds = new Map<string, Hold & { reach(): void; readonly held: Promise<void> }>();
    for (const path of paths) {
        let release: () => void = () => undefined;
        let reach: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const reached = new Promise<void>((resolve) => {
            reach = resolve;
        });
        holds.set(path, { held, reached, reach: () => reach(), release: () => release() });
    }
    const listed = [...holds.values()];
    const readDirectory = host.workspace.readDirectory.bind(host.workspace);
    vi.spyOn(host.workspace, "readDirectory").mockImplementation(async (path) => {
        const hold = holds.get(path);
        if (hold !== undefined) {
            holds.delete(path);
            hold.reach();
            await hold.held;
        }
        return readDirectory(path);
    });
    return listed;
}

describe("PluginCache", () => {
    describe("copying", () => {
        it("writes the copy of a plugin once", async () => {
            const { host, cache } = setUp();
            await cache.servedCopyOf(PALETTE);
            const writes = recordCacheWrites(host);

            await cache.servedCopyOf(PALETTE);

            expect(writes).toEqual([]);
        });

        it("serves a copy an earlier session wrote and writes only its last use", async () => {
            const { host, cache } = setUp({
                [`${CACHE}/${PALETTE_HASH}/plugin.js`]: "registerPalette();",
                [`${CACHE}/${PALETTE_HASH}/plugin.css`]: ".djs-palette {}",
            });
            const writes = recordCacheWrites(host);

            const files = await cache.servedCopyOf(PALETTE);

            expect(writes).toEqual([`${CACHE}/${PALETTE_HASH}/last-used`]);
            expect(files).toEqual({
                script: `${CACHE}/${PALETTE_HASH}/plugin.js`,
                style: `${CACHE}/${PALETTE_HASH}/plugin.css`,
                lastUse: `${CACHE}/${PALETTE_HASH}/last-used`,
            });
        });

        it("rewrites a copy an earlier session left cut short, before serving it", async () => {
            const { host, cache } = setUp({
                [`${CACHE}/${PALETTE_HASH}/plugin.js`]: "registerPal",
                [`${CACHE}/${PALETTE_HASH}/plugin.css`]: ".djs-palette {}",
            });
            const writes = recordCacheWrites(host);

            await cache.servedCopyOf(PALETTE);

            expect(writes).toEqual([
                `${CACHE}/${PALETTE_HASH}/last-used`,
                `${CACHE}/${PALETTE_HASH}/plugin.js`,
            ]);
            expect(host.workspace.files.get(`${CACHE}/${PALETTE_HASH}/plugin.js`)).toBe(
                "registerPalette();",
            );
        });

        it("rewrites a copy it cannot read back", async () => {
            const { host, cache } = setUp({
                [`${CACHE}/${PALETTE_HASH}/plugin.js`]: "registerPalette();",
            });
            const readFile = host.workspace.readFile.bind(host.workspace);
            vi.spyOn(host.workspace, "readFile").mockImplementation(async (path) => {
                if (path.startsWith(CACHE)) {
                    throw new Error("EACCES");
                }
                return readFile(path);
            });
            const writes = recordCacheWrites(host);

            await cache.servedCopyOf(PALETTE);

            expect(writes.sort()).toEqual([
                `${CACHE}/${PALETTE_HASH}/last-used`,
                `${CACHE}/${PALETTE_HASH}/plugin.css`,
                `${CACHE}/${PALETTE_HASH}/plugin.js`,
            ]);
        });

        it("writes the copy once for requests at the same time", async () => {
            const { host, cache } = setUp();
            const writes = recordCacheWrites(host);

            await Promise.all([cache.servedCopyOf(PALETTE), cache.servedCopyOf(PALETTE)]);

            expect(writes.sort()).toEqual([
                `${CACHE}/${PALETTE_HASH}/last-used`,
                `${CACHE}/${PALETTE_HASH}/plugin.css`,
                `${CACHE}/${PALETTE_HASH}/plugin.js`,
            ]);
        });

        it("rejects a copy it cannot write and writes it on the next request", async () => {
            const { host, cache } = setUp();
            const writeFile = host.workspace.writeFile.bind(host.workspace);
            vi.spyOn(host.workspace, "writeFile").mockImplementation(async (path, content) => {
                if (path.endsWith(`${PALETTE_HASH}/plugin.js`)) {
                    throw new Error("ENOSPC");
                }
                await writeFile(path, content);
            });

            await expect(cache.servedCopyOf(PALETTE)).rejects.toThrow("ENOSPC");
            vi.mocked(host.workspace.writeFile).mockRestore();
            await cache.servedCopyOf(PALETTE);

            expect(host.workspace.files.get(`${CACHE}/${PALETTE_HASH}/plugin.js`)).toBe(
                "registerPalette();",
            );
        });

        it("completes a copy an earlier session left without its style", async () => {
            const { host, cache } = setUp({
                [`${CACHE}/${PALETTE_HASH}/plugin.js`]: "registerPalette();",
            });

            await cache.servedCopyOf(PALETTE);

            expect(host.workspace.files.get(`${CACHE}/${PALETTE_HASH}/plugin.css`)).toBe(
                ".djs-palette {}",
            );
        });

        it("writes and serves a Windows cache root under the same path", async () => {
            const { host, cache } = setUp(
                {},
                { cacheRoot: "C:\\Users\\me\\AppData\\Roaming\\Code\\globalStorage\\bpmn-plugins" },
            );

            const files = await cache.servedCopyOf(PALETTE);

            const copy = `C:/Users/me/AppData/Roaming/Code/globalStorage/bpmn-plugins/${PALETTE_HASH}/plugin.js`;
            expect(host.workspace.files.get(copy)).toBe("registerPalette();");
            expect(files.script).toBe(copy);
        });

        it("copies again an entry another process deleted", async () => {
            const { host, cache } = setUp();
            await cache.servedCopyOf(PALETTE);

            await host.workspace.deleteDirectory(`${CACHE}/${PALETTE_HASH}`);
            await cache.servedCopyOf(PALETTE);

            expect(cachePaths(host)).toEqual([
                `${CACHE}/${PALETTE_HASH}/last-used`,
                `${CACHE}/${PALETTE_HASH}/plugin.css`,
                `${CACHE}/${PALETTE_HASH}/plugin.js`,
            ]);
        });
    });

    describe("recording the last use of a copy", () => {
        const MARKER = `${CACHE}/${PALETTE_HASH}/last-used`;

        it("writes the time it copied a plugin beside the copy", async () => {
            const { host, cache } = setUp();

            await cache.servedCopyOf(PALETTE);

            expect(host.workspace.files.get(MARKER)).toBe(String(NOW));
        });

        it("records a served copy's use at most once a day", async () => {
            const clock = clockAt(NOW);
            const { host, cache } = setUp({}, { now: clock.now });
            await cache.servedCopyOf(PALETTE);

            clock.ms = NOW + DAY - 1;
            await cache.servedCopyOf(PALETTE);
            const withinTheDay = host.workspace.files.get(MARKER);
            clock.ms = NOW + DAY;
            await cache.servedCopyOf(PALETTE);

            expect(withinTheDay).toBe(String(NOW));
            expect(host.workspace.files.get(MARKER)).toBe(String(NOW + DAY));
        });

        it("serves a copy whose use it cannot record, logs why and tries again on the next request", async () => {
            const clock = clockAt(NOW);
            const { host, cache } = setUp({}, { now: clock.now });
            await cache.servedCopyOf(PALETTE);
            clock.ms = NOW + DAY;
            const writeFile = host.workspace.writeFile.bind(host.workspace);
            vi.spyOn(host.workspace, "writeFile").mockImplementation(async (path, content) => {
                if (path === MARKER) throw new Error("EROFS");
                await writeFile(path, content);
            });

            const whileFailing = await cache.servedCopyOf(PALETTE);
            vi.mocked(host.workspace.writeFile).mockRestore();
            await cache.servedCopyOf(PALETTE);

            expect(whileFailing.script).toBe(`${CACHE}/${PALETTE_HASH}/plugin.js`);
            expect(host.notifier.logged("warning")).toEqual([
                `BPMN plugin cache: could not record the use of ${CACHE}/${PALETTE_HASH} (Error: EROFS)`,
            ]);
            expect(host.workspace.files.get(MARKER)).toBe(String(NOW + DAY));
        });
    });

    describe("pruning", () => {
        const UPPER = "A".repeat(64);
        const IDLE = "1".repeat(64);
        const RECENT = "2".repeat(64);
        const UNMARKED = "3".repeat(64);
        const UNREADABLE = "4".repeat(64);
        const HEX_FILE = "5".repeat(64);
        const copyUsed = (hash: string, lastUse: string) => ({
            [`${CACHE}/${hash}/plugin.js`]: "registerPlugin();",
            [`${CACHE}/${hash}/last-used`]: lastUse,
        });

        it("removes at start-up the copies idle for 30 days or without a last use and keeps anything else", async () => {
            const { host, cache } = setUp({
                ...copyUsed(IDLE, String(NOW - 30 * DAY)),
                ...copyUsed(RECENT, String(NOW - 30 * DAY + 1)),
                ...copyUsed(UNREADABLE, "yesterday"),
                [`${CACHE}/${UNMARKED}/plugin.js`]: "registerUnmarked();",
                ...copyUsed(UPPER, "0"),
                [`${CACHE}/notes/readme.md`]: "# Notes",
                [`${CACHE}/notes/last-used`]: "0",
                [`${CACHE}/${HEX_FILE}`]: "a file",
            });

            const pruned = await cache.pruneIdleCopies();

            expect(pruned).toEqual({ removed: 3 });
            expect(cachePaths(host)).toEqual(
                [
                    `${CACHE}/${RECENT}/last-used`,
                    `${CACHE}/${RECENT}/plugin.js`,
                    `${CACHE}/${UPPER}/last-used`,
                    `${CACHE}/${UPPER}/plugin.js`,
                    `${CACHE}/notes/last-used`,
                    `${CACHE}/notes/readme.md`,
                    `${CACHE}/${HEX_FILE}`,
                ].sort(),
            );
        });

        it("removes on request every copy not in use, however recently used", async () => {
            const { host, cache, inUse } = setUp(copyUsed(RECENT, String(NOW)));
            await cache.servedCopyOf(PALETTE);
            inUse.add(PALETTE_HASH);

            const pruned = await cache.pruneUnusedCopies();

            expect(pruned).toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([
                `${CACHE}/${PALETTE_HASH}/last-used`,
                `${CACHE}/${PALETTE_HASH}/plugin.css`,
                `${CACHE}/${PALETTE_HASH}/plugin.js`,
            ]);
        });

        it("keeps at start-up a copy in use, even with its last use gone", async () => {
            const { host, cache, inUse } = setUp();
            await cache.servedCopyOf(PALETTE);
            inUse.add(PALETTE_HASH);
            host.workspace.files.delete(`${CACHE}/${PALETTE_HASH}/last-used`);

            await expect(cache.pruneIdleCopies()).resolves.toEqual({ removed: 0 });
        });

        it("rejects a prune whose cache cannot be listed and removes nothing", async () => {
            const { host, cache } = setUp({ [`${CACHE}/${IDLE}/plugin.js`]: "registerGone();" });
            const readDirectory = host.workspace.readDirectory.bind(host.workspace);
            vi.spyOn(host.workspace, "readDirectory").mockImplementation(async (path) => {
                if (path === CACHE) throw new Error("cache unreadable");
                return readDirectory(path);
            });

            await expect(cache.pruneIdleCopies()).rejects.toThrow("cache unreadable");
            expect(cachePaths(host)).toEqual([`${CACHE}/${IDLE}/plugin.js`]);
        });

        it("removes nothing before the cache folder exists", async () => {
            const { cache } = setUp();

            await expect(cache.pruneIdleCopies()).resolves.toEqual({ removed: 0 });
        });

        it("logs a copy it cannot remove and still removes the others", async () => {
            const { host, cache } = setUp({
                [`${CACHE}/${IDLE}/plugin.js`]: "registerGone();",
                [`${CACHE}/${UNMARKED}/plugin.js`]: "registerGoneToo();",
            });
            const deleteDirectory = host.workspace.deleteDirectory.bind(host.workspace);
            vi.spyOn(host.workspace, "deleteDirectory").mockImplementation(async (path) => {
                if (path.endsWith(IDLE)) throw new Error("EBUSY");
                await deleteDirectory(path);
            });

            await expect(cache.pruneIdleCopies()).resolves.toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([`${CACHE}/${IDLE}/plugin.js`]);
            expect(host.notifier.logged("warning")).toEqual([
                `BPMN plugin cache: could not remove ${CACHE}/${IDLE} (Error: EBUSY)`,
            ]);
        });
    });

    describe("ordering copies and prunes", () => {
        it("waits for a copy being written before it prunes", async () => {
            const { host, cache } = setUp();
            const write = holdNext(host.workspace, "writeFile");
            const serving = cache.servedCopyOf(RESIZE);
            await write.reached;

            const pruning = cache.pruneUnusedCopies();
            await nextTask();
            write.release();
            await serving;

            await expect(pruning).resolves.toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([]);
        });

        it("waits for a last use being recorded before it prunes", async () => {
            const clock = clockAt(NOW);
            const { host, cache } = setUp({}, { now: clock.now });
            await cache.servedCopyOf(RESIZE);
            clock.ms = NOW + DAY;
            const write = holdNext(host.workspace, "writeFile");
            const serving = cache.servedCopyOf(RESIZE);
            await write.reached;

            const pruning = cache.pruneUnusedCopies();
            await nextTask();
            write.release();
            await serving;

            await expect(pruning).resolves.toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([]);
        });

        it("records no last use while a prune runs", async () => {
            const clock = clockAt(NOW);
            const { host, cache } = setUp({}, { now: clock.now });
            await cache.servedCopyOf(RESIZE);
            clock.ms = NOW + 31 * DAY;
            const [checkingCopy, listingCache] = holdListings(host, [
                `${CACHE}/${RESIZE_HASH}`,
                CACHE,
            ]);

            const serving = cache.servedCopyOf(RESIZE);
            await checkingCopy.reached;
            const pruning = cache.pruneIdleCopies();
            await listingCache.reached;
            checkingCopy.release();
            await nextTask();
            listingCache.release();

            await expect(pruning).resolves.toEqual({ removed: 1 });
            await serving;
            expect(cachePaths(host)).toEqual([]);
        });

        it("keeps a copy that comes into use while a prune lists the cache", async () => {
            const { host, cache, inUse } = setUp({
                [`${CACHE}/${RESIZE_HASH}/plugin.js`]: "registerResize();",
            });
            const [listingCache] = holdListings(host, [CACHE]);
            const pruning = cache.pruneIdleCopies();
            await listingCache.reached;

            inUse.add(RESIZE_HASH);
            const serving = cache.servedCopyOf(RESIZE);
            await nextTask();
            listingCache.release();

            await expect(pruning).resolves.toEqual({ removed: 0 });
            await serving;
            expect(cachePaths(host)).toEqual([
                `${CACHE}/${RESIZE_HASH}/last-used`,
                `${CACHE}/${RESIZE_HASH}/plugin.js`,
            ]);
        });

        it("waits for a prune that starts while it checks a copy another process deleted", async () => {
            const { host, cache } = setUp();
            await cache.servedCopyOf(RESIZE);
            await host.workspace.deleteDirectory(`${CACHE}/${RESIZE_HASH}`);
            const [checkingCopy, listingCache] = holdListings(host, [
                `${CACHE}/${RESIZE_HASH}`,
                CACHE,
            ]);

            const serving = cache.servedCopyOf(RESIZE);
            await checkingCopy.reached;
            const pruning = cache.pruneIdleCopies();
            await listingCache.reached;
            checkingCopy.release();
            await nextTask();
            listingCache.release();
            await pruning;
            await serving;

            expect(cachePaths(host)).toEqual([
                `${CACHE}/${RESIZE_HASH}/last-used`,
                `${CACHE}/${RESIZE_HASH}/plugin.js`,
            ]);
        });
    });
});
