/**
 * End-to-end coverage for the workspace bpmn-js plugins on the bridge: the
 * real bridge (`createBridge`) over a temp workspace and a temp plugin cache,
 * with the host's side played by the test through the recorded frames.
 *
 * Covered: the approvals `session/register` seeds serve an allowed plugin
 * from the cache under the loopback origin's `/bpmn-plugins/` route, a 1.21.0
 * row pinned to content included, and so does the allowance of its repository
 * in another worktree; an
 * unapproved plugin raises `actionNotice/show`, "Review…" opens the
 * `picker/show` list once the host reports its add-ons view as not shown, and
 * the checked plugin is allowed through a
 * `pluginApprovals/change` the host answers before the page gets `editor/reload`;
 * a `pluginApprovals/didChange` from another bridge keeps an editor from
 * asking again, and one that revokes a served plugin reloads the page.
 */

import { createHash } from "node:crypto";
import { mkdirSync, promises as fs, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    AddOnCatalogModel,
    AddOnsFeature,
    allowanceOf,
    allowanceRowOf,
    approvedContent,
    LOCAL_HOST,
    PluginApproval,
} from "@miragon/bpmn-modeler-core";
import { writeLinkedWorktree, writeRepository } from "@miragon/bpmn-modeler-core/testing";

import {
    hostNotification,
    hostReply,
    keepAnswering,
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
    readonly addOns: AddOnsFeature;
    readonly frames: Frame[];
    readonly root: string;
    readonly cacheRoot: string;
    readonly pluginId: string;
    /** The row that allows the plugin, its folder outside every repository. */
    readonly allowedRow: PluginApproval;
}

const GIT_FILES = {
    writeFile: (path: string, content: string) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
    },
    createDirectory: (path: string) => mkdirSync(path, { recursive: true }),
};

async function writePlugin(root: string): Promise<string> {
    const pluginId = join(root, ".camunda", "plugins", "resize-tasks");
    await fs.mkdir(pluginId, { recursive: true });
    await fs.writeFile(
        join(pluginId, "plugin.json"),
        JSON.stringify({ name: "Resize Tasks", script: "client.js" }),
    );
    await fs.writeFile(join(pluginId, "client.js"), SCRIPT);
    return pluginId;
}

const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

async function bridgeWithPlugin(): Promise<Bridge> {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-plugins-")));
    const cacheRoot = await fs.mkdtemp(join(tmpdir(), "bridge-plugin-cache-"));
    const pluginId = await writePlugin(root);
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
    const allowedRow = allowanceRowOf(
        allowanceOf("plugin", pluginId, { kind: "noRepository" }, LOCAL_HOST),
    );
    return {
        rpc: bridge.rpc,
        addOns: bridge.addOns,
        frames,
        root,
        cacheRoot,
        pluginId,
        allowedRow,
    };
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
    it("lists the registered folder's plugin for a view, at the state the host stores", async () => {
        const bridge = await bridgeWithPlugin();
        await openEditor(bridge, "order.bpmn");
        const models: AddOnCatalogModel[] = [];

        const stopAnswering = [
            keepAnswering(
                bridge.rpc.handleLine.bind(bridge.rpc),
                bridge.frames,
                "marketplaceState/read",
                () => ({ registered: { project: [], allProjects: [] }, writable: [] }),
            ),
            keepAnswering(
                bridge.rpc.handleLine.bind(bridge.rpc),
                bridge.frames,
                "templatePreferences/read",
                () => ({
                    project: { disabled: [], revision: 1 },
                    allProjects: { disabled: [], revision: 1 },
                }),
            ),
        ];
        disposals.push(async () => stopAnswering.forEach((stop) => stop()));
        bridge.addOns.attachView((model) => models.push(model), true);
        const answerRead = async (fromIndex: number): Promise<number> => {
            const read = await waitForFrame(bridge.frames, isRequest("pluginApprovals/read"), {
                fromIndex,
            });
            await bridge.rpc.handleLine(
                hostReply(read.id, { approvals: [bridge.allowedRow], revision: 2 }),
            );
            return bridge.frames.indexOf(read) + 1;
        };
        // The first answer changes the mirror, so the catalog lists, and reads, again.
        await answerRead(await answerRead(0));
        await bridge.addOns.whenSettled();

        const addOns = models[models.length - 1]?.groups.flatMap(({ sources }) =>
            sources.flatMap((source) => source.addOns),
        );
        expect(addOns?.map(({ name, state }) => ({ name, state }))).toEqual([
            { name: "Resize Tasks", state: "approved" },
        ]);
    });

    it.each([
        { case: "its allowance", rowOf: (bridge: Bridge) => bridge.allowedRow },
        {
            case: "a row pinned to content at its folder, as 1.21.0 stored it",
            rowOf: (bridge: Bridge) => ({ pluginId: bridge.pluginId, contentHash: "f".repeat(64) }),
        },
    ])("serves a plugin $case allows from the plugin cache route", async ({ rowOf }) => {
        const bridge = await bridgeWithPlugin();
        const editorId = await openEditor(bridge, "order.bpmn", [rowOf(bridge)]);

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
        const reveal = await waitForFrame(frames, isRequest("addOns/reveal"));
        await rpc.handleLine(hostReply(reveal.id, { shown: false }));

        const list = await waitForFrame(frames, isRequest("picker/show"));
        expect(list.params).toMatchObject({ canPickMany: true });
        expect(list.params.items).toHaveLength(1);
        await rpc.handleLine(hostReply(list.id, { selected: [0] }));

        const change = await waitForFrame(frames, isRequest("pluginApprovals/change"));
        expect(change.params).toEqual({ allow: [bridge.allowedRow], revoke: [] });
        await settle();
        expect(frames.some((frame) => frame.method === "editor/reload")).toBe(false);

        await rpc.handleLine(hostReply(change.id, { approvals: [bridge.allowedRow], revision: 2 }));

        const reload = await waitForFrame(frames, (frame) => frame.method === "editor/reload");
        expect(reload.params).toEqual({ editorId, sessionId: 1 });
    });

    it("reloads the page that loaded a plugin another bridge revoked", async () => {
        const bridge = await bridgeWithPlugin();
        const editorId = await openEditor(bridge, "order.bpmn", [bridge.allowedRow]);
        await requestPlugins(bridge, editorId);
        const fromIndex = bridge.frames.length;

        await bridge.rpc.handleLine(
            hostNotification("pluginApprovals/didChange", { approvals: [], revision: 2 }),
        );

        const reload = await waitForFrame(
            bridge.frames,
            (frame) => frame.method === "editor/reload",
            { fromIndex },
        );
        expect(reload.params).toEqual({ editorId, sessionId: 1 });
    });

    it("serves without asking once another bridge's approval reached this one", async () => {
        const bridge = await bridgeWithPlugin();
        const editorId = await openEditor(bridge, "order.bpmn");

        await bridge.rpc.handleLine(
            hostNotification("pluginApprovals/didChange", {
                approvals: [bridge.allowedRow],
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

    it("serves the plugin of another worktree without asking once its repository allowed it", async () => {
        const bridge = await bridgeWithPlugin();
        writeRepository(GIT_FILES, bridge.root);
        const worktree = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-worktree-")));
        disposals.push(() => fs.rm(worktree, { recursive: true, force: true }));
        writeLinkedWorktree(GIT_FILES, bridge.root, worktree);
        await writePlugin(worktree);
        const repositoryAllowance = allowanceOf(
            "plugin",
            bridge.pluginId,
            { kind: "repository", commonDir: join(bridge.root, ".git"), worktreeRoot: bridge.root },
            LOCAL_HOST,
        );

        const editorId = await openEditor({ ...bridge, root: worktree }, "order.bpmn", [
            allowanceRowOf(repositoryAllowance),
        ]);
        const answer = await requestPlugins(bridge, editorId);

        expect(answer.params.message?.plugins).toEqual([
            { name: "Resize Tasks", scriptUrl: `/bpmn-plugins/${HASH}/plugin.js` },
        ]);
        await settle();
        expect(bridge.frames.filter(isRequest("actionNotice/show"))).toEqual([]);
    });
});
