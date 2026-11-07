import { describe, expect, it, vi } from "vitest";

import { BpmnPluginsQuery, GetBpmnPluginsCommand } from "@miragon/bpmn-modeler-shared";

import { ArtifactService } from "../../kernel/service/ArtifactService";
import { createTestHost, FakeEditorHandle, TestHostOptions } from "../../testing";
import { PLUGIN_APPROVAL_NOTICE_ID, PLUGIN_APPROVAL_PROMPT_ID } from "../domain/pluginApproval";
import { ContentHasherPort } from "../port/pluginPorts";
import { BpmnPluginsFeature } from "./BpmnPluginsFeature";

const PLUGINS = "/work/.camunda/plugins";
const RESIZE = `${PLUGINS}/resize-tasks`;
const PALETTE = `${PLUGINS}/reduced-palette`;
const CACHE = "/storage/bpmn-plugins";

// Readable hashes keep the cache paths in the assertions legible.
const lengthHasher: ContentHasherPort = { sha256: (text) => `h${text.length}` };

const RESIZE_FILES = {
    [`${RESIZE}/index.js`]: "module.exports = { name: 'Resize Tasks', script: './client.js' };",
    [`${RESIZE}/client.js`]: "registerResize();",
};
const PALETTE_FILES = {
    [`${PALETTE}/plugin.json`]:
        '{ "name": "Reduced Palette", "script": "client.js", "style": "palette.css" }',
    [`${PALETTE}/client.js`]: "registerPalette();",
    [`${PALETTE}/palette.css`]: ".djs-palette {}",
};
/** `registerPalette();` and `.djs-palette {}` around the separator: 18 + 1 + 15. */
const PALETTE_HASH = "h34";
const RESIZE_HASH = "h18";

const REVIEW_AND_ALLOW = (
    ...ids: string[]
): Pick<TestHostOptions, "noticeAnswers" | "promptAnswers"> => ({
    noticeAnswers: { [PLUGIN_APPROVAL_NOTICE_ID]: "review" },
    promptAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: ids },
});

function setUp(
    files: Record<string, string>,
    options: Omit<TestHostOptions, "files" | "folders"> & { cacheRoot?: string } = {},
) {
    const host = createTestHost({ folders: ["/work", "/other"], files, ...options });
    const feature = new BpmnPluginsFeature({
        ...host,
        artifacts: new ArtifactService(host.workspace, host.settings, host.notifier),
        approvals: host.pluginApprovals,
        cacheRoot: options.cacheRoot ?? CACHE,
        hasher: lengthHasher,
    });
    const requestPlugins = async (editor: FakeEditorHandle) => {
        await feature.editorContribution.commandHandlers.GetBpmnPluginsCommand(
            new GetBpmnPluginsCommand(),
            editor.id,
        );
        await feature.service.whenApprovalSettled();
    };
    const openEditor = (path = "/work/order.bpmn") =>
        host.openSession(path, [feature.editorContribution.participant]);
    return { host, feature, requestPlugins, openEditor };
}

const answeredPlugins = (editor: FakeEditorHandle) =>
    editor.postedOfType<BpmnPluginsQuery>("BpmnPluginsQuery").at(-1)?.plugins;

/** Holds the next notice open until the returned function answers it with `answer`. */
function holdNotice(
    host: ReturnType<typeof createTestHost>,
    answer: string | undefined,
): () => void {
    let release: () => void = () => undefined;
    vi.spyOn(host.actionNotifier, "offer").mockImplementationOnce(
        <V>() =>
            new Promise<V | undefined>((resolve) => {
                release = () => resolve(answer as V | undefined);
            }),
    );
    return () => release();
}

/** Answers the request without waiting for the question it raises. */
async function answerRequest(feature: BpmnPluginsFeature, editor: FakeEditorHandle): Promise<void> {
    await feature.editorContribution.commandHandlers.GetBpmnPluginsCommand(
        new GetBpmnPluginsCommand(),
        editor.id,
    );
}

function recordCacheWrites(host: ReturnType<typeof createTestHost>): string[] {
    const writes: string[] = [];
    host.workspace.createWatcher(CACHE, "**/*", {
        onCreate: (path) => writes.push(path),
        onChange: (path) => writes.push(path),
    });
    return writes;
}

describe("BpmnPluginsFeature", () => {
    describe("delivery", () => {
        it("serves an approved plugin from a copy of the approved bytes, without a notice", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([
                {
                    name: "Reduced Palette",
                    scriptUrl: `webview-resource:${CACHE}/${PALETTE_HASH}/plugin.js`,
                    styleUrl: `webview-resource:${CACHE}/${PALETTE_HASH}/plugin.css`,
                },
            ]);
            expect(host.workspace.files.get(`${CACHE}/${PALETTE_HASH}/plugin.js`)).toBe(
                "registerPalette();",
            );
            expect(host.workspace.files.get(`${CACHE}/${PALETTE_HASH}/plugin.css`)).toBe(
                ".djs-palette {}",
            );
            expect(host.actionNotifier.notices).toEqual([]);
        });

        it("leaves a plugin out once its code changed", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_HASH }];
            await host.workspace.writeFile(
                `${RESIZE}/client.js`,
                "registerResize(); stealTokens();",
            );
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([]);
            expect(host.actionNotifier.notices).toHaveLength(1);
        });

        it("skips a plugin folder it cannot read and still serves the others", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                [`${PLUGINS}/broken/plugin.json`]: '{ "script": "../../escape.js" }',
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)?.map((plugin) => plugin.name)).toEqual([
                "Reduced Palette",
            ]);
            expect(host.notifier.logs).toContainEqual({
                level: "warning",
                message: `Skipped BPMN plugin in ${PLUGINS}/broken: "../../escape.js" is not a path inside the plugin folder`,
            });
        });

        it("answers with no plugins at once on a host whose webview cannot load them", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const editor = await openEditor();
            editor.servesNoFiles = true;

            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([]);
            expect(host.actionNotifier.notices).toEqual([]);
        });

        it("asks nothing for a hidden editor, which asks again once shown", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();
            editor.hidden = true;

            await requestPlugins(editor);

            expect(host.actionNotifier.notices).toEqual([]);
            expect(host.notifier.logged("debug")).toContain(
                `BPMN plugins not sent to hidden editor: ${editor.id}`,
            );
        });
    });

    describe("approval", () => {
        it("opens the editor without an unapproved plugin and only notifies about it", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([]);
            expect(host.actionNotifier.notices).toEqual([
                {
                    id: PLUGIN_APPROVAL_NOTICE_ID,
                    tone: "info",
                    message: "1 BPMN plugin in this workspace is not allowed yet.",
                    actions: [{ label: "Review…", value: "review" }],
                },
            ]);
            expect(host.picker.prompts).toEqual([]);
            expect(host.pluginApprovals.approvals).toEqual([]);
        });

        it("lists the plugins on Review… and reloads the editor with the ones allowed", async () => {
            const { host, requestPlugins, openEditor } = setUp(
                { ...RESIZE_FILES, ...PALETTE_FILES },
                REVIEW_AND_ALLOW(RESIZE),
            );
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(host.actionNotifier.notices[0]?.message).toBe(
                "2 BPMN plugins in this workspace are not allowed yet.",
            );
            expect(host.picker.prompts).toHaveLength(1);
            expect(host.pluginApprovals.approvals).toEqual([
                { pluginId: RESIZE, contentHash: RESIZE_HASH },
            ]);
            expect(editor.reloadCount).toBe(1);
        });

        it("does not notify again in this session once the notice was closed", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();

            await requestPlugins(editor);
            await requestPlugins(await openEditor("/work/invoice.bpmn"));

            expect(host.actionNotifier.notices).toHaveLength(1);
            expect(host.pluginApprovals.approvals).toEqual([]);
            expect(editor.reloadCount).toBe(0);
        });

        it("does not notify again in this session about the plugins left unchecked", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES, REVIEW_AND_ALLOW());
            const editor = await openEditor();

            await requestPlugins(editor);
            await requestPlugins(editor);

            expect(host.actionNotifier.notices).toHaveLength(1);
            expect(host.picker.prompts).toHaveLength(1);
            expect(editor.reloadCount).toBe(0);
        });

        it("notifies again about a closed plugin once its code changed", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();
            await requestPlugins(editor);

            await host.workspace.writeFile(`${RESIZE}/client.js`, "registerResize(2);");
            await requestPlugins(editor);

            expect(host.actionNotifier.notices).toHaveLength(2);
        });

        it("reloads every open editor that was offered an allowed plugin", async () => {
            const { host, feature, openEditor } = setUp(RESIZE_FILES, {
                promptAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: [RESIZE] },
            });
            const clickReview = holdNotice(host, "review");
            const order = await openEditor("/work/order.bpmn");
            const invoice = await openEditor("/work/invoice.bpmn");
            const elsewhere = await openEditor("/other/shipping.bpmn");
            const notAskedYet = await openEditor("/work/billing.bpmn");
            for (const editor of [order, invoice, elsewhere]) {
                await answerRequest(feature, editor);
            }

            clickReview();
            await feature.service.whenApprovalSettled();

            expect(
                [order, invoice, elsewhere, notAskedYet].map((each) => each.reloadCount),
            ).toEqual([1, 1, 0, 0]);
        });

        it("forgets what a closed editor was offered", async () => {
            const { host, feature, openEditor } = setUp(RESIZE_FILES, {
                promptAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: [RESIZE] },
            });
            const clickReview = holdNotice(host, "review");
            const closed = await openEditor("/work/order.bpmn");
            await answerRequest(feature, closed);
            closed.dispose();
            const reopened = await openEditor("/work/order.bpmn");

            clickReview();
            await feature.service.whenApprovalSettled();

            expect(host.pluginApprovals.approvals).toHaveLength(1);
            expect(reopened.reloadCount).toBe(0);
        });

        it("asks one question at a time across editors", async () => {
            const { host, feature, openEditor } = setUp(RESIZE_FILES);
            const closeNotice = holdNotice(host, undefined);

            await answerRequest(feature, await openEditor("/work/a.bpmn"));
            await answerRequest(feature, await openEditor("/work/b.bpmn"));
            closeNotice();
            await feature.service.whenApprovalSettled();

            expect(host.actionNotifier.offer).toHaveBeenCalledTimes(1);
        });
    });

    describe("cache", () => {
        it("writes the copy of an approved plugin once", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            await requestPlugins(await openEditor("/work/order.bpmn"));
            const writes = recordCacheWrites(host);

            await requestPlugins(await openEditor("/work/invoice.bpmn"));

            expect(writes).toEqual([]);
        });

        it("serves a copy an earlier session wrote without writing it again", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                [`${CACHE}/${PALETTE_HASH}/plugin.js`]: "registerPalette();",
                [`${CACHE}/${PALETTE_HASH}/plugin.css`]: ".djs-palette {}",
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const writes = recordCacheWrites(host);
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(writes).toEqual([]);
            expect(answeredPlugins(editor)).toHaveLength(1);
        });

        it("completes a copy an earlier session left without its style", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                [`${CACHE}/${PALETTE_HASH}/plugin.js`]: "registerPalette();",
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];

            await requestPlugins(await openEditor());

            expect(host.workspace.files.get(`${CACHE}/${PALETTE_HASH}/plugin.css`)).toBe(
                ".djs-palette {}",
            );
        });

        it("writes and serves a Windows cache root under the same path", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES, {
                cacheRoot: "C:\\Users\\me\\AppData\\Roaming\\Code\\globalStorage\\bpmn-plugins",
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const editor = await openEditor();

            await requestPlugins(editor);

            const copy = `C:/Users/me/AppData/Roaming/Code/globalStorage/bpmn-plugins/${PALETTE_HASH}/plugin.js`;
            expect(host.workspace.files.get(copy)).toBe("registerPalette();");
            expect(answeredPlugins(editor)?.[0]?.scriptUrl).toBe(`webview-resource:${copy}`);
        });
    });

    describe("discovery", () => {
        it("does not read a plugin again until a file in its folder changes", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const editor = await openEditor();
            await requestPlugins(editor);

            // Behind the watcher's back: what was read before still counts.
            host.workspace.files.set(`${PALETTE}/client.js`, "registerPalette(2);");
            await requestPlugins(editor);
            const unnoticed = answeredPlugins(editor);
            await host.workspace.writeFile(`${PALETTE}/client.js`, "registerPalette(3);");
            await requestPlugins(editor);

            expect(unnoticed).toHaveLength(1);
            expect(answeredPlugins(editor)).toEqual([]);
        });

        it("reads a plugin folder replaced as a whole again", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const editor = await openEditor();
            await requestPlugins(editor);

            await host.workspace.deleteDirectory(PALETTE);
            host.workspace.createDirectory(PALETTE, {
                [`${PALETTE}/plugin.json`]: '{ "name": "Reduced Palette", "script": "client.js" }',
                [`${PALETTE}/client.js`]: "registerPalette();",
            });
            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([]);
        });

        it("watches each plugins folder once and stops when the feature is disposed", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            await requestPlugins(await openEditor("/work/order.bpmn"));
            await requestPlugins(await openEditor("/work/invoice.bpmn"));

            feature.dispose();

            const pluginWatchers = host.workspace.watchers.filter(({ root }) => root === PLUGINS);
            expect(pluginWatchers.map(({ glob, disposed }) => ({ glob, disposed }))).toEqual([
                { glob: "**/*", disposed: true },
            ]);
        });
    });
});
