/**
 * The project's trust on the bridge: the real bridge (`createBridge`) over a
 * temp workspace holding one allowed plugin, with the host's side played by
 * the test. Untrusted until the host says otherwise, the bridge serves no
 * plugin and asks nothing; `workspaceTrust/didChange` reloads the page with
 * the plugin, and withdrawing it reloads the page without.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { allowanceOf, allowanceRowOf, LOCAL_HOST } from "@miragon/bpmn-modeler-core";

import {
    hostNotification,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./composition/bridge";
import { METHODS } from "./protocol/domain/descriptor";
import { RegisterParams } from "./protocol/domain/types";
import { Rpc } from "./transport/adapter/out/Rpc";

interface Frame {
    readonly id?: number;
    readonly method: string;
    readonly params: {
        readonly editorId?: string;
        readonly message?: { readonly type: string; readonly plugins?: { name: string }[] };
    };
}

interface ProjectBridge {
    readonly rpc: Rpc;
    readonly frames: Frame[];
    readonly editorId: string;
    /** Registers another diagram of the project, as IntelliJ does when the user opens one. */
    registerEditor(
        fileName: string,
        workspaceTrust: RegisterParams["workspaceTrust"],
    ): Promise<void>;
}

const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

/** An editor of a project with an allowed plugin, registered with `workspaceTrust` as given. */
async function editorOfProject(
    workspaceTrust: RegisterParams["workspaceTrust"],
): Promise<ProjectBridge> {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-trust-")));
    const cacheRoot = await fs.mkdtemp(join(tmpdir(), "bridge-trust-cache-"));
    const pluginId = join(root, ".camunda", "plugins", "resize-tasks");
    await fs.mkdir(pluginId, { recursive: true });
    await fs.writeFile(
        join(pluginId, "plugin.json"),
        JSON.stringify({ name: "Resize Tasks", script: "client.js" }),
    );
    await fs.writeFile(join(pluginId, "client.js"), "window.registerResize = true;");
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
    const registerEditor = async (
        fileName: string,
        trust: RegisterParams["workspaceTrust"],
    ): Promise<void> => {
        const path = join(root, fileName);
        const { workspaceTrust: _trusted, ...untold } = registerParams(
            `file://${path}`,
            root,
            path,
            "",
            {
                sessionId: 1,
                pluginApprovals: [
                    allowanceRowOf(
                        allowanceOf("plugin", pluginId, { kind: "noRepository" }, LOCAL_HOST),
                    ),
                ],
                pluginApprovalsRevision: 1,
            },
        );
        await bridge.rpc.handleLine(
            hostNotification(
                METHODS.sessionRegister,
                trust === undefined ? untold : { ...untold, workspaceTrust: trust },
            ),
        );
    };
    await registerEditor("order.bpmn", workspaceTrust);
    return {
        rpc: bridge.rpc,
        frames,
        editorId: `file://${join(root, "order.bpmn")}`,
        registerEditor,
    };
}

async function servedPlugins({ rpc, frames, editorId }: ProjectBridge): Promise<string[]> {
    const fromIndex = frames.length;
    await rpc.handleLine(
        hostNotification(METHODS.webviewMessage, {
            editorId,
            sessionId: 1,
            message: { type: "GetBpmnPluginsCommand" },
        }),
    );
    const answer = await waitForFrame(
        frames,
        (frame) =>
            frame.method === METHODS.editorPostMessage &&
            frame.params.message?.type === "BpmnPluginsQuery",
        { fromIndex },
    );
    return (answer.params.message?.plugins ?? []).map(({ name }: { name: string }) => name);
}

const asked = ({ frames }: ProjectBridge) =>
    frames.filter((frame) => frame.method === METHODS.actionNoticeShow);

const reloads = ({ frames }: ProjectBridge) =>
    frames.filter((frame) => frame.method === METHODS.editorReload);

describe("the project's trust on the bridge", () => {
    it.each([
        {
            case: "the host says it is not trusted",
            workspaceTrust: { trusted: false, revision: 1 },
        },
        { case: "the host has not said yet", workspaceTrust: undefined },
    ])("serves no allowed plugin and asks nothing while $case", async ({ workspaceTrust }) => {
        const project = await editorOfProject(workspaceTrust);

        const served = await servedPlugins(project);
        await settle();

        expect(served).toEqual([]);
        expect(asked(project)).toEqual([]);
    });

    it("reloads the editor once the host says the user trusted the project, and serves the plugin then", async () => {
        const project = await editorOfProject({ trusted: false, revision: 1 });
        await servedPlugins(project);

        await project.rpc.handleLine(
            hostNotification(METHODS.workspaceTrustDidChange, { trusted: true, revision: 2 }),
        );
        await waitForFrame(project.frames, (frame) => frame.method === METHODS.editorReload);

        expect(await servedPlugins(project)).toEqual(["Resize Tasks"]);
    });

    it("reloads the editor without the plugin once the user withdraws the trust", async () => {
        const project = await editorOfProject({ trusted: true, revision: 1 });
        expect(await servedPlugins(project)).toEqual(["Resize Tasks"]);

        await project.rpc.handleLine(
            hostNotification(METHODS.workspaceTrustDidChange, { trusted: false, revision: 2 }),
        );
        await waitForFrame(project.frames, (frame) => frame.method === METHODS.editorReload);

        expect(await servedPlugins(project)).toEqual([]);
    });

    it("keeps the newer trust when an older register arrives after it", async () => {
        const project = await editorOfProject({ trusted: false, revision: 1 });
        await servedPlugins(project);
        await project.rpc.handleLine(
            hostNotification(METHODS.workspaceTrustDidChange, { trusted: true, revision: 5 }),
        );
        await waitForFrame(project.frames, (frame) => frame.method === METHODS.editorReload);

        await project.registerEditor("invoice.bpmn", { trusted: false, revision: 4 });
        await settle();

        expect(reloads(project)).toHaveLength(1);
        expect(await servedPlugins(project)).toEqual(["Resize Tasks"]);
    });

    it("keeps the newer trust when an older push arrives after it", async () => {
        const project = await editorOfProject({ trusted: true, revision: 5 });
        await servedPlugins(project);

        await project.rpc.handleLine(
            hostNotification(METHODS.workspaceTrustDidChange, { trusted: false, revision: 4 }),
        );
        await settle();

        expect(reloads(project)).toEqual([]);
        expect(await servedPlugins(project)).toEqual(["Resize Tasks"]);
    });
});
