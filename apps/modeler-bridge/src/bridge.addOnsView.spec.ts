/**
 * End-to-end coverage for the add-ons view IntelliJ shows in the BPMN Modeler
 * tool window's Add-ons tab: the real bridge (`createBridge`) over a temp
 * project, with the host's side played by the test through the recorded
 * frames. The host opens the view with the project root and its settings,
 * relays the page's commands in `addOns/webviewMessage`, and gets the core's
 * queries in `addOns/postMessage`.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { approvedContent } from "@miragon/bpmn-modeler-core";

import {
    hostNotification,
    hostReply,
    keepAnswering,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import {
    createAcmeWorkspace,
    lintOnHost,
    openAcmeBridge,
    waitForNotice,
} from "./__fixtures__/rulePackageBridge";
import { createBridge } from "./composition/bridge";
import { HOST_SHOW_REPLY_DEADLINE_MS, METHODS } from "./protocol/domain/descriptor";
import { AddOnsOpenParams, PluginApprovalsSnapshot } from "./protocol/domain/types";
import { Rpc } from "./transport/adapter/out/Rpc";

interface AddOnRow {
    readonly id: string;
    readonly name: string;
    readonly state: string;
}

interface PostedQuery {
    readonly type: string;
    readonly model?: {
        readonly revision: number;
        readonly groups: readonly {
            readonly sources: readonly { readonly addOns: readonly AddOnRow[] }[];
        }[];
        readonly emptyText?: string;
    };
    readonly requestId?: number;
    readonly result?: { readonly kind: string; readonly reason?: string };
    readonly reveal?: { readonly kind: string; readonly addOnIds?: readonly string[] };
}

interface Frame {
    readonly id?: number;
    readonly method: string;
    readonly params: { readonly message?: PostedQuery } & Readonly<Record<string, unknown>>;
}

interface ProjectBridge {
    readonly rpc: Rpc;
    readonly frames: Frame[];
    readonly root: string;
    /** What the host answers the next `pluginApprovals/read` with. */
    stored: PluginApprovalsSnapshot;
}

const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

const isPosted = (type: string) => (frame: Frame) =>
    frame.method === METHODS.addOnsPostMessage && frame.params.message?.type === type;

function rowsOf(frame: Frame): AddOnRow[] {
    return (frame.params.message?.model?.groups ?? []).flatMap(({ sources }) =>
        sources.flatMap(({ addOns }) => addOns),
    );
}

async function writePlugin(root: string, configFolder: string, name: string): Promise<string> {
    const folder = join(root, configFolder, "plugins", name);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(join(folder, "plugin.json"), JSON.stringify({ name, script: "client.js" }));
    await fs.writeFile(join(folder, "client.js"), `window.${name.replace(/\W/g, "")} = true;`);
    return folder;
}

/** A bridge over a temp project holding one plugin, `Resize Tasks`, with a host that keeps answering the catalog's reads. */
async function projectBridge(
    disposeLater: (dispose: () => Promise<void>) => void,
): Promise<ProjectBridge> {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-add-ons-")));
    const cacheRoot = await fs.mkdtemp(join(tmpdir(), "bridge-add-ons-cache-"));
    await writePlugin(root, ".camunda", "Resize Tasks");
    const frames: Frame[] = [];
    const bridge = createBridge(
        (line) => frames.push(JSON.parse(line)),
        () => {},
        { pluginCacheRoot: cacheRoot },
    );
    const project: ProjectBridge = {
        rpc: bridge.rpc,
        frames,
        root,
        stored: { approvals: [], revision: 1 },
    };
    const handleLine = bridge.rpc.handleLine.bind(bridge.rpc);
    const stopAnswering = [
        keepAnswering(handleLine, frames, METHODS.marketplaceStateRead, () => ({
            registered: { project: [], allProjects: [] },
            writable: [],
        })),
        keepAnswering(handleLine, frames, METHODS.templatePreferencesRead, () => ({
            project: { disabled: [], revision: 1 },
            allProjects: { disabled: [], revision: 1 },
        })),
        keepAnswering(handleLine, frames, METHODS.pluginApprovalsRead, () => project.stored),
    ];
    disposeLater(async () => {
        stopAnswering.forEach((stop) => stop());
        bridge.dispose();
        await Promise.all(
            [root, cacheRoot].map((dir) => fs.rm(dir, { recursive: true, force: true })),
        );
    });
    return project;
}

async function openView(
    { rpc, root }: ProjectBridge,
    overrides: Partial<AddOnsOpenParams> = {},
): Promise<void> {
    await rpc.handleLine(
        hostNotification(METHODS.addOnsOpen, {
            open: true,
            workspaceRoot: root,
            settings: {},
            ...overrides,
        } satisfies AddOnsOpenParams),
    );
}

async function fromPage({ rpc }: ProjectBridge, message: object): Promise<void> {
    await rpc.handleLine(hostNotification(METHODS.addOnsWebviewMessage, { message }));
}

const nextModel = (project: ProjectBridge, fromIndex = 0) =>
    waitForFrame(project.frames, isPosted("AddOnCatalogQuery"), { fromIndex });

/** Waits until the bridge sent nothing for `quietMs`, so no listing is still in flight. */
async function untilQuiet({ frames }: ProjectBridge, quietMs = 300): Promise<void> {
    let seen = frames.length;
    let quietSince = Date.now();
    while (Date.now() - quietSince < quietMs) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (frames.length !== seen) {
            seen = frames.length;
            quietSince = Date.now();
        }
    }
}

const isRequest = (method: string) => (frame: Frame) =>
    frame.method === method && frame.id !== undefined;

/** Opens `order.bpmn`, whose page asks for its plugins, and waits for the notice about the new one. */
async function noticeAboutNewPlugin(project: ProjectBridge): Promise<Frame> {
    const editorId = `file://${join(project.root, "order.bpmn")}`;
    await project.rpc.handleLine(
        hostNotification(
            METHODS.sessionRegister,
            registerParams(editorId, project.root, editorId.slice(7), "", { sessionId: 1 }),
        ),
    );
    await project.rpc.handleLine(
        hostNotification(METHODS.webviewMessage, {
            editorId,
            sessionId: 1,
            message: { type: "GetBpmnPluginsCommand" },
        }),
    );
    return waitForFrame(project.frames, isRequest(METHODS.actionNoticeShow));
}

/** Clicks "Review…" and returns the reveal request the bridge then sends. */
async function review(project: ProjectBridge, notice: Frame): Promise<Frame> {
    const fromIndex = project.frames.length;
    await project.rpc.handleLine(hostReply(notice.id!, { chosen: 0 }));
    return waitForFrame(project.frames, isRequest(METHODS.addOnsReveal), { fromIndex });
}

/** What `revealAddOns` does once it selected the tab: the tab reports itself open, then the reply. */
async function showAddOnsTab(project: ProjectBridge, reveal: Frame): Promise<void> {
    await openView(project);
    await project.rpc.handleLine(hostReply(reveal.id!, { shown: true }));
}

describe("the add-ons view on the bridge", () => {
    it("lists the project the host opened the view with", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));

        await openView(project);

        const model = await nextModel(project);
        expect(rowsOf(model).map(({ id, name }) => ({ id, name }))).toEqual([
            {
                id: `plugin:${join(project.root, ".camunda", "plugins", "Resize Tasks")}`,
                name: "Resize Tasks",
            },
        ]);
    });

    it("lists nothing while the view is hidden", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));

        await openView(project, { open: false });
        await settle();
        await settle();

        expect(project.frames.filter(isPosted("AddOnCatalogQuery"))).toEqual([]);
    });

    it("lists from the configured config folder at once", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));
        await writePlugin(project.root, ".bpmn", "Reduced Palette");

        await openView(project, { settings: { configFolder: ".bpmn" } });

        const model = await nextModel(project);
        expect(rowsOf(model).map(({ name }) => name)).toEqual(["Reduced Palette"]);
    });

    it("lists no folder when the host has no project root", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));

        await openView(project, { workspaceRoot: undefined });

        const model = await nextModel(project);
        expect(rowsOf(model)).toEqual([]);
        expect(model.params.message?.model?.emptyText).toEqual(expect.any(String));
    });

    it("posts the last model again to a page that loads after it", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));
        await openView(project);
        const first = await nextModel(project);
        const fromIndex = project.frames.length;

        await fromPage(project, { type: "GetAddOnCatalogCommand" });

        const again = await nextModel(project, fromIndex);
        expect(again.params.message?.model?.revision).toBe(first.params.message?.model?.revision);
    });

    it("answers a page request under the id the page gave it", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));
        await openView(project);
        await nextModel(project);

        await fromPage(project, {
            type: "AddOnRequestCommand",
            requestId: 7,
            request: { kind: "revoke", addOnId: "plugin:/nowhere" },
        });

        const answer = await waitForFrame(project.frames, isPosted("AddOnActionResultQuery"));
        expect(answer.params.message).toMatchObject({
            requestId: 7,
            result: { kind: "refused", reason: "unknownAddOn" },
        });
    });

    it("refuses a page request in no shape the core knows", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));
        await openView(project);
        await nextModel(project);

        await fromPage(project, {
            type: "AddOnRequestCommand",
            requestId: 8,
            request: { kind: "uninstall" },
        });

        const answer = await waitForFrame(project.frames, isPosted("AddOnActionResultQuery"));
        expect(answer.params.message).toMatchObject({
            requestId: 8,
            result: { kind: "refused", reason: "notOffered" },
        });
    });

    it("reads the stored approvals again on refresh", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));
        await openView(project);
        const [row] = rowsOf(await nextModel(project));
        expect(row?.state).toBe("new");
        const pluginId = row!.id.replace(/^plugin:/, "");
        await untilQuiet(project);
        project.stored = {
            approvals: [{ pluginId, contentHash: await contentHashOf(pluginId) }],
            revision: 2,
        };
        const fromIndex = project.frames.length;

        await project.rpc.handleLine(hostNotification(METHODS.addOnsRefresh, {}));

        const refreshed = await waitForFrame(
            project.frames,
            (frame) =>
                isPosted("AddOnCatalogQuery")(frame) && rowsOf(frame)[0]?.state === "approved",
            { fromIndex },
        );
        expect(refreshed.params.message?.model?.revision).toBeGreaterThan(0);
    });

    it("keeps listing the project root after its last editor closes", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));
        await openView(project);
        await nextModel(project);
        const editorId = `file://${join(project.root, "order.bpmn")}`;
        await project.rpc.handleLine(
            hostNotification(
                METHODS.sessionRegister,
                registerParams(editorId, project.root, editorId.slice(7), "", { sessionId: 1 }),
            ),
        );
        await project.rpc.handleLine(
            hostNotification(METHODS.sessionDispose, { editorId, sessionId: 1 }),
        );
        await untilQuiet(project);
        const fromIndex = project.frames.length;

        await project.rpc.handleLine(hostNotification(METHODS.addOnsRefresh, {}));

        const model = await nextModel(project, fromIndex);
        expect(rowsOf(model).map(({ name }) => name)).toEqual(["Resize Tasks"]);
    });
});

describe("Review… on the bridge of the IntelliJ host", () => {
    it("opens the add-ons view at the new plugin's row instead of a list", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));
        const notice = await noticeAboutNewPlugin(project);

        const reveal = await review(project, notice);
        expect(reveal.params).toEqual({});
        await showAddOnsTab(project, reveal);

        const shown = await waitForFrame(project.frames, isPosted("RevealAddOnsQuery"));
        expect(shown.params.message?.reveal).toMatchObject({
            kind: "rows",
            addOnIds: [`plugin:${join(project.root, ".camunda", "plugins", "Resize Tasks")}`],
        });
        await settle();
        expect(project.frames.filter(isRequest(METHODS.pickerShow))).toEqual([]);
        expect(project.frames.filter(isRequest(METHODS.actionNoticeShow))).toEqual([notice]);
    });

    it("opens the add-ons view at the new rule package's row instead of a list", async () => {
        const bridge = await openAcmeBridge(await createAcmeWorkspace());
        const handleLine = bridge.rpc.handleLine.bind(bridge.rpc);
        const stopAnswering = [
            keepAnswering(handleLine, bridge.frames, METHODS.marketplaceStateRead, () => ({
                registered: { project: [], allProjects: [] },
                writable: [],
            })),
            keepAnswering(handleLine, bridge.frames, METHODS.templatePreferencesRead, () => ({
                project: { disabled: [], revision: 1 },
                allProjects: { disabled: [], revision: 1 },
            })),
            keepAnswering(handleLine, bridge.frames, METHODS.pluginApprovalsRead, () => ({
                approvals: [],
                revision: 1,
            })),
        ];
        disposals.push(async () => {
            stopAnswering.forEach((stop) => stop());
            await bridge.dispose();
        });
        const project: ProjectBridge = {
            rpc: bridge.rpc,
            frames: bridge.frames as Frame[],
            root: bridge.root,
            stored: { approvals: [], revision: 1 },
        };
        await lintOnHost(bridge);
        const notice = (await waitForNotice(bridge)) as Frame;

        await showAddOnsTab(project, await review(project, notice));

        const shown = await waitForFrame(project.frames, isPosted("RevealAddOnsQuery"));
        expect(shown.params.message?.reveal).toMatchObject({
            kind: "rows",
            addOnIds: [`rulePackage:${bridge.acmeDir}`],
        });
    });

    it("lists the new plugins when the host cannot show the view", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));
        const reveal = await review(project, await noticeAboutNewPlugin(project));

        await project.rpc.handleLine(hostReply(reveal.id!, { shown: false }));

        const list = await waitForFrame(project.frames, isRequest(METHODS.pickerShow));
        expect(list.params).toMatchObject({ canPickMany: true });
        expect(project.frames.filter(isPosted("RevealAddOnsQuery"))).toEqual([]);
    });

    it("lists the new plugins when the host does not answer in time", async () => {
        const project = await projectBridge((dispose) => disposals.push(dispose));
        const notice = await noticeAboutNewPlugin(project);
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            await project.rpc.handleLine(hostReply(notice.id!, { chosen: 0 }));
            for (let turn = 0; turn < 50; turn++) {
                if (project.frames.some(isRequest(METHODS.addOnsReveal))) break;
                await vi.advanceTimersByTimeAsync(0);
            }
            expect(project.frames.some(isRequest(METHODS.addOnsReveal))).toBe(true);
            await vi.advanceTimersByTimeAsync(HOST_SHOW_REPLY_DEADLINE_MS);
        } finally {
            vi.useRealTimers();
        }

        await expect(
            waitForFrame(project.frames, isRequest(METHODS.pickerShow)),
        ).resolves.toBeDefined();
    });

    it("lists a new rule package a link put outside the project, without asking for the view", async () => {
        const root = await createAcmeWorkspace();
        const outside = await fs.realpath(
            await fs.mkdtemp(join(tmpdir(), "bridge-add-ons-outside-")),
        );
        await fs.rename(join(root, "node_modules"), join(outside, "node_modules"));
        await fs.symlink(join(outside, "node_modules"), join(root, "node_modules"));
        const bridge = await openAcmeBridge(root);
        disposals.push(async () => {
            await bridge.dispose();
            await fs.rm(outside, { recursive: true, force: true });
        });
        await lintOnHost(bridge);
        const notice = await waitForNotice(bridge);

        await bridge.rpc.handleLine(hostReply(notice.id!, { chosen: 0 }));

        await waitForFrame(bridge.frames, isRequest(METHODS.pickerShow));
        expect(bridge.frames.filter(isRequest(METHODS.addOnsReveal))).toEqual([]);
    });
});

/** The hash the host stores for an allowed plugin's script. */
async function contentHashOf(pluginId: string): Promise<string> {
    const script = await fs.readFile(join(pluginId, "client.js"), "utf8");
    return createHash("sha256").update(approvedContent(script, undefined), "utf8").digest("hex");
}
