/**
 * The bridge runs each inbound call on a queue keyed by its editor or its
 * method, so a `session/register` waits behind its editor's earlier frames
 * while a later `pluginApprovals/didChange` runs at once. Each list the host
 * sends carries the host's revision, and the mirror keeps the newest one,
 * whatever order the queues apply them in.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    allowanceOf,
    allowanceRowOf,
    approvedContent,
    LOCAL_HOST,
    PluginApproval,
} from "@miragon/bpmn-modeler-core";

import {
    hostNotification,
    hostReply,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";

const SCRIPT = "window.registerResize = true;";
const HASH = createHash("sha256").update(approvedContent(SCRIPT, undefined), "utf8").digest("hex");
const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.22.0">
  <bpmn:process id="Process_1" isExecutable="true" camunda:historyTimeToLive="180" />
</bpmn:definitions>`;

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

const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

async function openPluginEditor() {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-revision-")));
    const cacheRoot = await fs.mkdtemp(join(tmpdir(), "bridge-revision-cache-"));
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
    const sourcePath = join(root, "order.bpmn");
    const editorId = `file://${sourcePath}`;
    const register = (pluginApprovals: PluginApproval[], pluginApprovalsRevision: number) =>
        hostNotification(
            "session/register",
            registerParams(editorId, root, sourcePath, BPMN, {
                sessionId: 1,
                pluginApprovals,
                pluginApprovalsRevision,
            }),
        );
    await bridge.rpc.handleLine(register([], 1));
    const allowed: PluginApproval[] = [
        allowanceRowOf(allowanceOf("plugin", pluginId, { kind: "noRepository" }, LOCAL_HOST)),
    ];
    return { rpc: bridge.rpc, frames, editorId, register, allowed };
}

/** Holds the editor's queue on the engine version picker until `release` answers it. */
async function holdEditorQueue({
    rpc,
    frames,
    editorId,
}: Awaited<ReturnType<typeof openPluginEditor>>) {
    void rpc.handleLine(hostNotification("modeler/changeEngineVersion", { editorId }));
    const picker = await waitForFrame(frames, isRequest("picker/show"));
    return { release: () => rpc.handleLine(hostReply(picker.id, { selected: null })) };
}

async function servedPlugins({
    rpc,
    frames,
    editorId,
}: Awaited<ReturnType<typeof openPluginEditor>>) {
    const fromIndex = frames.length;
    await rpc.handleLine(
        hostNotification("webview/message", {
            editorId,
            sessionId: 1,
            message: { type: "GetBpmnPluginsCommand" },
        }),
    );
    const answer = await waitForFrame(
        frames,
        (frame) =>
            frame.method === "editor/postMessage" &&
            frame.params.message?.type === "BpmnPluginsQuery",
        { fromIndex },
    );
    return answer.params.message?.plugins;
}

describe("approval lists ordered by the host's revision", () => {
    it("keeps a newer pushed list when an older register queued behind an editor frame runs after it", async () => {
        const editor = await openPluginEditor();
        const queue = await holdEditorQueue(editor);

        const register = editor.rpc.handleLine(editor.register([], 2));
        await editor.rpc.handleLine(
            hostNotification("pluginApprovals/didChange", {
                approvals: editor.allowed,
                revision: 3,
            }),
        );
        await queue.release();
        await register;

        expect(await servedPlugins(editor)).toEqual([
            { name: "Resize Tasks", scriptUrl: `/bpmn-plugins/${HASH}/plugin.js` },
        ]);
        await settle();
        expect(editor.frames.filter(isRequest("actionNotice/show"))).toEqual([]);
    });

    it("takes a newer register over an older pushed list", async () => {
        const editor = await openPluginEditor();
        await editor.rpc.handleLine(
            hostNotification("pluginApprovals/didChange", {
                approvals: editor.allowed,
                revision: 2,
            }),
        );

        await editor.rpc.handleLine(editor.register([], 3));

        expect(await servedPlugins(editor)).toEqual([]);
    });

    it("ignores a pushed list older than the one the register seeded", async () => {
        const editor = await openPluginEditor();
        await editor.rpc.handleLine(editor.register(editor.allowed, 3));

        await editor.rpc.handleLine(
            hostNotification("pluginApprovals/didChange", { approvals: [], revision: 2 }),
        );

        expect(await servedPlugins(editor)).toEqual([
            { name: "Resize Tasks", scriptUrl: `/bpmn-plugins/${HASH}/plugin.js` },
        ]);
    });
});
