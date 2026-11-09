/**
 * End-to-end coverage for the workspace bpmn-js plugins on the bridge: the
 * real bridge (`createBridge`) over a temp workspace and a temp plugin cache,
 * with the host's side played by the test through the recorded frames.
 *
 * Covered: the approvals `session/register` seeds serve an approved plugin
 * from the cache under the loopback origin's `/bpmn-plugins/` route; an
 * unapproved plugin raises `actionNotice/show`, "Review…" opens the
 * `picker/show` list, and the checked plugin is allowed through a
 * `pluginApprovals/change` the host answers before the page gets `editor/reload`;
 * and a `pluginApprovals/didChange` from another bridge keeps an editor from
 * asking again.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { approvedContent, PluginApproval } from "@miragon/bpmn-modeler-core";

import {
    hostNotification,
    hostReply,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";
import { Rpc } from "./transport/adapter/out/Rpc";

const SCRIPT = "window.registerResize = true;";
const HASH = createHash("sha256").update(approvedContent(SCRIPT, undefined), "utf8").digest("hex");

interface Frame {
    readonly id?: number;
    readonly method: string;
    readonly params: {
        readonly editorId?: string;
        readonly message?: { readonly type: string; readonly plugins?: unknown };
    };
}

const isRequest = (method: string) => (frame: Frame) =>
    frame.method === method && frame.id !== undefined;
const isPluginsAnswer = (frame: Frame) =>
    frame.method === "editor/postMessage" && frame.params.message?.type === "BpmnPluginsQuery";

interface Bridge {
    readonly rpc: Rpc;
    readonly frames: Frame[];
    readonly root: string;
    readonly cacheRoot: string;
    readonly pluginId: string;
}

const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

async function bridgeWithPlugin(): Promise<Bridge> {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-plugins-")));
    const cacheRoot = await fs.mkdtemp(join(tmpdir(), "bridge-plugin-cache-"));
    const pluginId = join(root, ".camunda", "plugins", "resize-tasks");
    await fs.mkdir(pluginId, { recursive: true });
    await fs.writeFile(
        join(pluginId, "plugin.json"),
        JSON.stringify({ name: "Resize Tasks", script: "client.js" }),
    );
    await fs.writeFile(join(pluginId, "client.js"), SCRIPT);
    const frames: Frame[] = [];
    const bridge = createBridge(
        (line) => frames.push(JSON.parse(line)),
        () => {},
        { pluginCacheRoot: cacheRoot },
    );
    disposals.push(async () => {
        bridge.dispose();
        await Promise.all(
            [root, cacheRoot].map((dir) => fs.rm(dir, { recursive: true, force: true })),
        );
    });
    return { rpc: bridge.rpc, frames, root, cacheRoot, pluginId };
}

async function openEditor(
    { rpc, root }: Bridge,
    name: string,
    pluginApprovals?: PluginApproval[],
): Promise<string> {
    const editorId = `file://${join(root, name)}`;
    await rpc.handleLine(
        hostNotification(
            "session/register",
            registerParams(editorId, root, editorId.slice(7), "", {
                sessionId: 1,
                ...(pluginApprovals ? { pluginApprovals, pluginApprovalsRevision: 1 } : {}),
            }),
        ),
    );
    return editorId;
}

async function requestPlugins({ rpc, frames }: Bridge, editorId: string): Promise<Frame> {
    const fromIndex = frames.length;
    await rpc.handleLine(
        hostNotification("webview/message", {
            editorId,
            sessionId: 1,
            message: { type: "GetBpmnPluginsCommand" },
        }),
    );
    return waitForFrame(
        frames,
        (frame) => isPluginsAnswer(frame) && frame.params.editorId === editorId,
        { fromIndex },
    );
}

describe("workspace bpmn-js plugins on the bridge", () => {
    it("serves a plugin the registered approvals allow from the plugin cache route", async () => {
        const bridge = await bridgeWithPlugin();
        const editorId = await openEditor(bridge, "order.bpmn", [
            { pluginId: bridge.pluginId, contentHash: HASH },
        ]);

        const answer = await requestPlugins(bridge, editorId);

        expect(answer.params.message?.plugins).toEqual([
            { name: "Resize Tasks", scriptUrl: `/bpmn-plugins/${HASH}/plugin.js` },
        ]);
        await expect(fs.readFile(join(bridge.cacheRoot, HASH, "plugin.js"), "utf8")).resolves.toBe(
            SCRIPT,
        );
        await settle();
        expect(bridge.frames.filter(isRequest("actionNotice/show"))).toEqual([]);
    });

    it("asks about a new plugin, saves the allowed one and then reloads the page", async () => {
        const bridge = await bridgeWithPlugin();
        const { rpc, frames } = bridge;
        const editorId = await openEditor(bridge, "order.bpmn");

        const answer = await requestPlugins(bridge, editorId);
        expect(answer.params.message?.plugins).toEqual([]);

        const notice = await waitForFrame(frames, isRequest("actionNotice/show"));
        expect(notice.params).toEqual({
            tone: "info",
            message: "1 BPMN plugin in this workspace is not allowed yet.",
            labels: ["Review…"],
        });
        await rpc.handleLine(hostReply(notice.id, { chosen: 0 }));

        const list = await waitForFrame(frames, isRequest("picker/show"));
        expect(list.params).toMatchObject({ canPickMany: true });
        expect(list.params.items).toHaveLength(1);
        await rpc.handleLine(hostReply(list.id, { selected: [0] }));

        const change = await waitForFrame(frames, isRequest("pluginApprovals/change"));
        expect(change.params).toEqual({
            allow: [{ pluginId: bridge.pluginId, contentHash: HASH }],
            revoke: [],
        });
        await settle();
        expect(frames.some((frame) => frame.method === "editor/reload")).toBe(false);

        await rpc.handleLine(
            hostReply(change.id, {
                approvals: [{ pluginId: bridge.pluginId, contentHash: HASH }],
                revision: 2,
            }),
        );

        const reload = await waitForFrame(frames, (frame) => frame.method === "editor/reload");
        expect(reload.params).toEqual({ editorId, sessionId: 1 });
    });

    it("serves without asking once another bridge's approval reached this one", async () => {
        const bridge = await bridgeWithPlugin();
        const editorId = await openEditor(bridge, "order.bpmn");

        await bridge.rpc.handleLine(
            hostNotification("pluginApprovals/didChange", {
                approvals: [{ pluginId: bridge.pluginId, contentHash: HASH }],
                revision: 2,
            }),
        );
        const answer = await requestPlugins(bridge, editorId);

        expect(answer.params.message?.plugins).toEqual([
            { name: "Resize Tasks", scriptUrl: `/bpmn-plugins/${HASH}/plugin.js` },
        ]);
        await settle();
        expect(bridge.frames.filter(isRequest("actionNotice/show"))).toEqual([]);
    });
});
