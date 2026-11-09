/**
 * The plugin cache prune `server.ts` runs when the bridge starts: the real
 * bridge over a temp cache, with the IntelliJ host's side played through the
 * recorded frames. It asks the host for its stored approvals, never the
 * mirror, and removes only the copies no row names.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hostReply, waitForFrame } from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";

interface Frame {
    readonly id?: number;
    readonly method: string;
}

const NAMED = "a".repeat(64);
const UNNAMED = "b".repeat(64);
const UPPER = "C".repeat(64);
const HEX_FILE = "d".repeat(64);

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
    for (const dir of [NAMED, UNNAMED, UPPER, "notes"]) {
        await fs.mkdir(join(cacheRoot, dir));
        await fs.writeFile(join(cacheRoot, dir, "plugin.js"), "registerPlugin();");
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
    it("removes only the copies the host's stored approvals do not name", async () => {
        const { bridge, frames, cacheRoot } = await bridgeOverCache();

        const pruning = bridge.prunePluginCache();
        const read = await waitForFrame(frames, (frame) => frame.method === "pluginApprovals/read");
        await bridge.rpc.handleLine(
            hostReply(read.id, {
                approvals: [
                    { pluginId: "/other-project/.camunda/plugins/resize", contentHash: NAMED },
                ],
                revision: 3,
            }),
        );
        await pruning;

        await expect(fs.readdir(cacheRoot).then((names) => names.sort())).resolves.toEqual(
            [NAMED, UPPER, HEX_FILE, "notes"].sort(),
        );
    });

    it("sends no frame until it is asked to prune", async () => {
        const { frames } = await bridgeOverCache();

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(frames).toEqual([]);
    });
});
