/**
 * The plugin cache prune `server.ts` runs when the bridge starts: the real
 * bridge over a temp cache. It removes the copies idle for 30 days or without
 * a last use and asks the IntelliJ host nothing.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createBridge } from "./composition/bridge";

interface Frame {
    readonly id?: number;
    readonly method: string;
    readonly params?: { readonly level?: string; readonly message?: string };
}

const DAY = 24 * 60 * 60 * 1000;
const RECENT = "a".repeat(64);
const IDLE = "b".repeat(64);
const UNMARKED = "c".repeat(64);
const UPPER = "D".repeat(64);
const HEX_FILE = "e".repeat(64);

const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

async function bridgeOverCache(): Promise<{
    readonly bridge: ReturnType<typeof createBridge>;
    readonly frames: Frame[];
    readonly cacheRoot: string;
}> {
    const cacheRoot = await fs.mkdtemp(join(tmpdir(), "bridge-plugin-prune-"));
    const lastUseByDir: Record<string, number | undefined> = {
        [RECENT]: Date.now() - DAY,
        [IDLE]: Date.now() - 31 * DAY,
        [UNMARKED]: undefined,
        [UPPER]: Date.now() - 31 * DAY,
        notes: Date.now() - 31 * DAY,
    };
    for (const [dir, lastUse] of Object.entries(lastUseByDir)) {
        await fs.mkdir(join(cacheRoot, dir));
        await fs.writeFile(join(cacheRoot, dir, "plugin.js"), "registerPlugin();");
        if (lastUse !== undefined) {
            await fs.writeFile(join(cacheRoot, dir, "last-used"), String(lastUse));
        }
    }
    await fs.writeFile(join(cacheRoot, HEX_FILE), "not a copy");
    const frames: Frame[] = [];
    const bridge = createBridge(
        (line) => frames.push(JSON.parse(line)),
        () => {},
        { pluginCacheRoot: cacheRoot },
    );
    disposals.push(async () => {
        bridge.dispose();
        await fs.rm(cacheRoot, { recursive: true, force: true });
    });
    return { bridge, frames, cacheRoot };
}

describe("pruning the plugin cache on the bridge", () => {
    it("removes only the copies idle for 30 days or without a last use", async () => {
        const { bridge, cacheRoot } = await bridgeOverCache();

        await bridge.prunePluginCache();

        await expect(fs.readdir(cacheRoot).then((names) => names.sort())).resolves.toEqual(
            [RECENT, UPPER, HEX_FILE, "notes"].sort(),
        );
    });

    it("asks the host for no approval and sends no frame", async () => {
        const { bridge, frames } = await bridgeOverCache();

        await bridge.prunePluginCache();

        expect(frames).toEqual([]);
    });
});
