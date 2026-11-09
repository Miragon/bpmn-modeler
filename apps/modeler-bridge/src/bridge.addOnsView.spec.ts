/**
 * End-to-end coverage for the add-ons view IntelliJ shows in the BPMN Modeler
 * tool window's Artifacts tab: the real bridge (`createBridge`) over a temp
 * project, with the host's side played by the test through the recorded
 * frames. The host opens the view with the project root and its settings,
 * relays the page's commands in `addOns/webviewMessage`, and gets the core's
 * queries in `addOns/postMessage`.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { approvedContent } from "@miragon/bpmn-modeler-core";

import {
    hostNotification,
    keepAnswering,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";
import { METHODS } from "./protocol/domain/descriptor";
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
    readonly reveal?: { readonly addOnIds: readonly string[] };
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
        const fromIndex = project.frames.length;

        await project.rpc.handleLine(hostNotification(METHODS.addOnsRefresh, {}));

        const model = await nextModel(project, fromIndex);
        expect(rowsOf(model).map(({ name }) => name)).toEqual(["Resize Tasks"]);
    });
});

/** The hash the host stores for an allowed plugin's script. */
async function contentHashOf(pluginId: string): Promise<string> {
    const script = await fs.readFile(join(pluginId, "client.js"), "utf8");
    return createHash("sha256").update(approvedContent(script, undefined), "utf8").digest("hex");
}
