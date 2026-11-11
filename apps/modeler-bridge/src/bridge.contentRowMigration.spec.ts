/**
 * The rewrite `server.ts` runs when the bridge starts: the real bridge over a
 * temp folder, with the IntelliJ host's approval list answered by hand. Each
 * row pinned to content at a plugin folder found here becomes the allowance
 * of that plugin, in one change.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    allowanceOf,
    allowanceRowOf,
    LOCAL_HOST,
    PluginApproval,
} from "@miragon/bpmn-modeler-core";

import { hostErrorReply, hostReply, waitForFrame } from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";

interface Frame {
    readonly id?: number;
    readonly method: string;
    readonly params?: {
        readonly level?: string;
        readonly message?: string;
        readonly allow?: readonly PluginApproval[];
        readonly revoke?: readonly string[];
    };
}

const PLUGIN_HASH = "0123456789abcdef".repeat(4);

const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

async function bridgeOverFolder() {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-content-rows-")));
    const frames: Frame[] = [];
    const bridge = createBridge(
        (line) => frames.push(JSON.parse(line)),
        () => {},
        { pluginCacheRoot: join(root, "cache") },
    );
    disposals.push(async () => {
        bridge.dispose();
        await fs.rm(root, { recursive: true, force: true });
    });
    const requestOf = (method: string) =>
        waitForFrame(frames, (frame) => frame.method === method && frame.id !== undefined);
    return { root, frames, bridge, requestOf };
}

describe("rewriting approvals pinned to content when the bridge starts", () => {
    it("asks the host for its list", async () => {
        const { bridge, requestOf } = await bridgeOverFolder();

        void bridge.migrateContentRows();

        await expect(requestOf("pluginApprovals/read")).resolves.toMatchObject({ params: {} });
    });

    it("allows the plugin found at a row's folder and revokes only that row, in one change", async () => {
        const { root, frames, bridge, requestOf } = await bridgeOverFolder();
        const found = join(root, ".camunda", "plugins", "resize");
        const missing = join(root, ".camunda", "plugins", "removed");
        await fs.mkdir(found, { recursive: true });
        const rows: PluginApproval[] = [
            { pluginId: found, contentHash: PLUGIN_HASH },
            { pluginId: missing, contentHash: PLUGIN_HASH },
        ];

        const migrated = bridge.migrateContentRows();
        const read = await requestOf("pluginApprovals/read");
        await bridge.rpc.handleLine(hostReply(read.id!, { approvals: rows, revision: 1 }));
        const change = await requestOf("pluginApprovals/change");
        await bridge.rpc.handleLine(hostReply(change.id!, { approvals: [], revision: 2 }));
        await migrated;

        const allowance = allowanceOf("plugin", found, { kind: "noRepository" }, LOCAL_HOST);
        expect(change.params).toEqual({ allow: [allowanceRowOf(allowance)], revoke: [found] });
        expect(frames.filter(({ method }) => method === "pluginApprovals/change")).toHaveLength(1);
        expect(frames).toContainEqual({
            method: "notifier/log",
            params: {
                level: "info",
                message:
                    "Approvals: rewrote 1 approval pinned to content as an allowance of its add-on, later changes included.",
            },
        });
    });

    it("sends no change when the list holds no row pinned to content", async () => {
        const { frames, bridge, requestOf } = await bridgeOverFolder();

        const migrated = bridge.migrateContentRows();
        const read = await requestOf("pluginApprovals/read");
        await bridge.rpc.handleLine(hostReply(read.id!, { approvals: [], revision: 1 }));
        await migrated;

        expect(frames.map(({ method }) => method)).toEqual(["pluginApprovals/read"]);
    });

    it("logs a list it cannot read and does not throw", async () => {
        const { frames, bridge, requestOf } = await bridgeOverFolder();

        const migrated = bridge.migrateContentRows();
        const read = await requestOf("pluginApprovals/read");
        await bridge.rpc.handleLine(hostErrorReply(read.id!, "store unreadable"));

        await expect(migrated).resolves.toBeUndefined();
        expect(frames).toContainEqual({
            method: "notifier/log",
            params: {
                level: "error",
                message: expect.stringContaining("store unreadable"),
            },
        });
    });
});
