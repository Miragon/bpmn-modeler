import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { BpmnPluginsQuery, GetBpmnPluginsCommand } from "@miragon/bpmn-modeler-shared";

import {
    allowing,
    ApprovableArtifact,
    CodeApproval,
    CodeApprovalChange,
} from "../../kernel/domain/codeApproval";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { QuestionQueue } from "../../kernel/service/QuestionQueue";
import {
    createTestHost,
    FakeEditorHandle,
    fingerprintHasher,
    InMemoryPluginApprovals,
    TestHostOptions,
} from "../../testing";
import {
    approvedContent,
    PLUGIN_APPROVAL_NOTICE_ID,
    PLUGIN_APPROVAL_PROMPT_ID,
} from "../domain/pluginApproval";
import { ContentHasherPort } from "../port/pluginPorts";
import { BpmnPluginsFeature } from "./BpmnPluginsFeature";

const PLUGINS = "/work/.camunda/plugins";
const RESIZE = `${PLUGINS}/resize-tasks`;
const PALETTE = `${PLUGINS}/reduced-palette`;
const OTHER_PALETTE = "/other/.camunda/plugins/reduced-palette";
const CACHE = "/storage/bpmn-plugins";

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
const OTHER_PALETTE_FILES = {
    [`${OTHER_PALETTE}/plugin.json`]: '{ "name": "Other Palette", "script": "client.js" }',
    [`${OTHER_PALETTE}/client.js`]: "registerOtherPalette();",
};
const PALETTE_HASH = fingerprintHasher.sha256(
    approvedContent("registerPalette();", ".djs-palette {}"),
);
const RESIZE_HASH = fingerprintHasher.sha256(approvedContent("registerResize();", undefined));
/** `registerResize();` with one character changed, so its length stays. */
const RESIZE_EDITED = "registerResizE();";

const REVIEW_AND_ALLOW = (
    ...ids: string[]
): Pick<TestHostOptions, "noticeAnswers" | "promptAnswers"> => ({
    noticeAnswers: { [PLUGIN_APPROVAL_NOTICE_ID]: "review" },
    promptAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: ids },
});

function setUp(
    files: Record<string, string>,
    options: Omit<TestHostOptions, "files" | "folders"> & {
        cacheRoot?: string;
        approvals?: PluginApprovalStorePort;
        questions?: QuestionQueue;
        hasher?: ContentHasherPort;
    } = {},
) {
    const host = createTestHost({ folders: ["/work", "/other"], files, ...options });
    const feature = new BpmnPluginsFeature({
        ...host,
        artifacts: new ArtifactService(host.workspace, host.settings, host.notifier),
        approvals: options.approvals ?? host.pluginApprovals,
        cacheRoot: options.cacheRoot ?? CACHE,
        hasher: options.hasher ?? fingerprintHasher,
        questions: options.questions ?? new QuestionQueue(),
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

const reviewedLabels = (host: ReturnType<typeof createTestHost>) =>
    host.picker.prompts.map(({ args }) =>
        (args[0] as ChoicePrompt<string>).items.map((item) => item.label),
    );

/** Answers the request without waiting for the question it raises. */
async function answerRequest(feature: BpmnPluginsFeature, editor: FakeEditorHandle): Promise<void> {
    await feature.editorContribution.commandHandlers.GetBpmnPluginsCommand(
        new GetBpmnPluginsCommand(),
        editor.id,
    );
}

/** Merges the change only after an await, as the bridge's store does once IntelliJ answered it. */
class LaggingPluginApprovals extends InMemoryPluginApprovals {
    override async change(change: CodeApprovalChange): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await super.change(change);
    }
}

/** A mirror that has not heard of every row the host stores yet, as the bridge's can lag. */
class MirrorBehindHost extends InMemoryPluginApprovals {
    mirrored: readonly CodeApproval[] = [];

    override read(): readonly CodeApproval[] {
        return this.mirrored;
    }
}

/** Holds the next call to a method until the test releases it; `reached` resolves once it is called. */
function holdNext<T extends object, K extends keyof T>(
    target: T,
    method: K,
): { readonly reached: Promise<void>; release(): void } {
    const original = (target[method] as (...args: unknown[]) => Promise<unknown>).bind(target);
    let release: () => void = () => undefined;
    let reach: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
        reach = resolve;
    });
    const spy = vi.spyOn(target, method as never) as unknown as {
        mockImplementationOnce(impl: (...args: unknown[]) => Promise<unknown>): void;
    };
    spy.mockImplementationOnce(async (...args: unknown[]) => {
        reach();
        await held;
        return original(...args);
    });
    return { reached, release };
}

const cachePaths = (host: ReturnType<typeof createTestHost>) =>
    [...host.workspace.files.keys()].filter((path) => path.startsWith(CACHE)).sort();

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

        it("serves an approved plugin without a style from its script alone", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_HASH }];
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([
                {
                    name: "Resize Tasks",
                    scriptUrl: `webview-resource:${CACHE}/${RESIZE_HASH}/plugin.js`,
                },
            ]);
            expect(
                [...host.workspace.files.keys()].filter((path) => path.startsWith(CACHE)),
            ).toEqual([`${CACHE}/${RESIZE_HASH}/plugin.js`]);
        });

        it("leaves a plugin out once its code changed", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_HASH }];
            await host.workspace.writeFile(`${RESIZE}/client.js`, RESIZE_EDITED);
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

        it.each<{ case: string; files: Record<string, string>; folder: string; reason: string }>([
            {
                case: "a folder that holds no manifest",
                files: { [`${PLUGINS}/notes/readme.md`]: "# Notes" },
                folder: `${PLUGINS}/notes`,
                reason: "holds neither plugin.json nor index.js",
            },
            {
                case: "a folder whose manifest names a missing script",
                files: { [`${PLUGINS}/half/plugin.json`]: '{ "script": "client.js" }' },
                folder: `${PLUGINS}/half`,
                reason: "a file it names is missing",
            },
        ])(
            "skips $case, says why and still serves the others",
            async ({ files, folder, reason }) => {
                const { host, requestPlugins, openEditor } = setUp({ ...PALETTE_FILES, ...files });
                host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
                const editor = await openEditor();

                await requestPlugins(editor);

                expect(answeredPlugins(editor)?.map((plugin) => plugin.name)).toEqual([
                    "Reduced Palette",
                ]);
                expect(host.notifier.logs).toContainEqual({
                    level: "warning",
                    message: `Skipped BPMN plugin in ${folder}: ${reason}`,
                });
            },
        );

        it("reads no folder a host lists under a name that leaves the plugins folder", async () => {
            const configFolder = "/work/.camunda";
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                [`${configFolder}/plugin.json`]:
                    '{ "name": "Config Folder", "script": "client.js" }',
                [`${configFolder}/client.js`]: "registerConfig();",
            });
            const listDirectory = host.workspace.readDirectory.bind(host.workspace);
            vi.spyOn(host.workspace, "readDirectory").mockImplementation(async (path) =>
                path === PLUGINS
                    ? [...(await listDirectory(path)), ["..", "directory"]]
                    : listDirectory(path),
            );
            host.pluginApprovals.approvals = [
                { pluginId: PALETTE, contentHash: PALETTE_HASH },
                {
                    pluginId: configFolder,
                    contentHash: fingerprintHasher.sha256(
                        approvedContent("registerConfig();", undefined),
                    ),
                },
            ];
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)?.map((plugin) => plugin.name)).toEqual([
                "Reduced Palette",
            ]);
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

        it("answers a hidden editor on a host whose webview cannot load plugins without failing", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();
            editor.servesNoFiles = true;
            editor.hidden = true;

            await requestPlugins(editor);

            expect(host.actionNotifier.notices).toEqual([]);
            expect(host.notifier.loggedErrors).toEqual([]);
        });

        it("asks nothing and logs when the answer does not reach the editor", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();
            vi.spyOn(editor, "postMessage").mockResolvedValueOnce(false);

            await requestPlugins(editor);

            expect(host.actionNotifier.notices).toEqual([]);
            expect(host.notifier.logged("warning")).toContain(
                `BPMN plugins could not be sent to editor: ${editor.id}`,
            );
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

            await host.workspace.writeFile(`${RESIZE}/client.js`, RESIZE_EDITED);
            await requestPlugins(editor);

            expect(host.actionNotifier.notices).toHaveLength(2);
        });

        it("reloads every open editor that was offered an allowed plugin", async () => {
            const { host, feature, openEditor } = setUp(RESIZE_FILES, {
                promptAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: [RESIZE] },
            });
            const notice = host.actionNotifier.holdNextNotice();
            const order = await openEditor("/work/order.bpmn");
            const invoice = await openEditor("/work/invoice.bpmn");
            const elsewhere = await openEditor("/other/shipping.bpmn");
            const notAskedYet = await openEditor("/work/billing.bpmn");
            for (const editor of [order, invoice, elsewhere]) {
                await answerRequest(feature, editor);
            }

            notice.answer("review");
            await feature.service.whenApprovalSettled();

            expect(
                [order, invoice, elsewhere, notAskedYet].map((each) => each.reloadCount),
            ).toEqual([1, 1, 0, 0]);
        });

        it("reloads an editor withheld a plugin once another writer allows it", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();
            await requestPlugins(editor);

            host.pluginApprovals.storeElsewhere([{ pluginId: RESIZE, contentHash: RESIZE_HASH }], {
                notify: true,
            });

            expect(editor.reloadCount).toBe(1);
        });

        it("reloads the editors that loaded a plugin another writer revoked", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...RESIZE_FILES,
                ...OTHER_PALETTE_FILES,
            });
            host.pluginApprovals.storeElsewhere([{ pluginId: RESIZE, contentHash: RESIZE_HASH }], {
                notify: true,
            });
            const loaded = await openEditor("/work/order.bpmn");
            const elsewhere = await openEditor("/other/shipping.bpmn");
            await requestPlugins(loaded);
            await requestPlugins(elsewhere);

            host.pluginApprovals.storeElsewhere([], { notify: true });

            expect([loaded.reloadCount, elsewhere.reloadCount]).toEqual([1, 0]);
        });

        it("reloads an editor once until it asks for its plugins again", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const allowed = [{ pluginId: RESIZE, contentHash: RESIZE_HASH }];
            host.pluginApprovals.storeElsewhere(allowed, { notify: true });
            const editor = await openEditor();
            await requestPlugins(editor);

            host.pluginApprovals.storeElsewhere([], { notify: true });
            host.pluginApprovals.storeElsewhere(allowed, { notify: true });
            const beforeAsking = editor.reloadCount;
            await requestPlugins(editor);
            host.pluginApprovals.storeElsewhere([], { notify: true });

            expect([beforeAsking, editor.reloadCount]).toEqual([1, 2]);
        });

        it("reloads no editor for a change the store has not announced", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();
            await requestPlugins(editor);

            host.pluginApprovals.storeElsewhere([{ pluginId: RESIZE, contentHash: RESIZE_HASH }]);

            expect(editor.reloadCount).toBe(0);
        });

        it("follows no approval change once disposed", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();
            await requestPlugins(editor);

            feature.dispose();
            host.pluginApprovals.storeElsewhere([{ pluginId: RESIZE, contentHash: RESIZE_HASH }], {
                notify: true,
            });

            expect(editor.reloadCount).toBe(0);
        });

        it("forgets what a closed editor was offered", async () => {
            const { host, feature, openEditor } = setUp(RESIZE_FILES, {
                promptAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: [RESIZE] },
            });
            const notice = host.actionNotifier.holdNextNotice();
            const closed = await openEditor("/work/order.bpmn");
            await answerRequest(feature, closed);
            closed.dispose();
            const reopened = await openEditor("/work/order.bpmn");

            notice.answer("review");
            await feature.service.whenApprovalSettled();

            expect(host.pluginApprovals.approvals).toHaveLength(1);
            expect(reopened.reloadCount).toBe(0);
        });

        it("asks one question at a time across editors", async () => {
            const { host, feature, openEditor } = setUp(RESIZE_FILES);
            const notice = host.actionNotifier.holdNextNotice();

            await answerRequest(feature, await openEditor("/work/a.bpmn"));
            await answerRequest(feature, await openEditor("/work/b.bpmn"));
            notice.answer(undefined);
            await feature.service.whenApprovalSettled();

            expect(host.actionNotifier.notices).toHaveLength(1);
        });

        it("asks about another editor's plugins once the open question is answered", async () => {
            const { host, feature, openEditor } = setUp(
                { ...RESIZE_FILES, ...OTHER_PALETTE_FILES },
                REVIEW_AND_ALLOW(OTHER_PALETTE),
            );
            const notice = host.actionNotifier.holdNextNotice();
            const first = await openEditor("/work/a.bpmn");
            const second = await openEditor("/other/b.bpmn");
            await answerRequest(feature, first);
            await answerRequest(feature, second);
            const whileOpen = host.actionNotifier.notices.length;

            notice.answer(undefined);
            await feature.service.whenApprovalSettled();

            expect(whileOpen).toBe(1);
            expect(host.actionNotifier.notices).toHaveLength(2);
            expect(reviewedLabels(host)).toEqual([["Other Palette"]]);
            expect([first.reloadCount, second.reloadCount]).toEqual([0, 1]);
        });

        it("keeps the row another approval kind writes through the shared question queue", async () => {
            const approvals = new LaggingPluginApprovals();
            const questions = new QuestionQueue();
            const { host, feature, openEditor } = setUp(RESIZE_FILES, {
                ...REVIEW_AND_ALLOW(RESIZE),
                approvals,
                questions,
            });
            const rulePackage: ApprovableArtifact = {
                id: "/work/node_modules/bpmnlint-plugin-acme",
                name: "bpmnlint-plugin-acme",
                contentHash: "bpmnlint-closure-v1:ddd",
            };
            const notice = host.actionNotifier.holdNextNotice();
            await answerRequest(feature, await openEditor());

            const rulePackageAnswer = questions.ask(() =>
                approvals.change(allowing([rulePackage])),
            );
            notice.answer("review");
            await feature.service.whenApprovalSettled();
            await rulePackageAnswer;

            expect(approvals.approvals).toEqual([
                { pluginId: RESIZE, contentHash: RESIZE_HASH },
                { pluginId: rulePackage.id, contentHash: "bpmnlint-closure-v1:ddd" },
            ]);
        });

        it("logs a reload that fails and still reloads the other editors", async () => {
            const { host, feature, openEditor } = setUp(RESIZE_FILES, REVIEW_AND_ALLOW(RESIZE));
            const notice = host.actionNotifier.holdNextNotice();
            const failing = await openEditor("/work/a.bpmn");
            const other = await openEditor("/work/b.bpmn");
            await answerRequest(feature, failing);
            await answerRequest(feature, other);
            vi.spyOn(failing, "reload").mockImplementation(() => {
                throw new Error("reload failed");
            });

            notice.answer("review");
            await feature.service.whenApprovalSettled();

            expect(host.notifier.loggedErrors.map((error) => error.message)).toEqual([
                "reload failed",
            ]);
            expect(other.reloadCount).toBe(1);
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

        it("rewrites a copy an earlier session left cut short, before serving it", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                [`${CACHE}/${PALETTE_HASH}/plugin.js`]: "registerPal",
                [`${CACHE}/${PALETTE_HASH}/plugin.css`]: ".djs-palette {}",
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const writes = recordCacheWrites(host);

            await requestPlugins(await openEditor());

            expect(writes).toEqual([`${CACHE}/${PALETTE_HASH}/plugin.js`]);
            expect(host.workspace.files.get(`${CACHE}/${PALETTE_HASH}/plugin.js`)).toBe(
                "registerPalette();",
            );
        });

        it("rewrites a copy it cannot read back and serves it", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                [`${CACHE}/${PALETTE_HASH}/plugin.js`]: "registerPalette();",
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const readFile = host.workspace.readFile.bind(host.workspace);
            vi.spyOn(host.workspace, "readFile").mockImplementation(async (path) => {
                if (path.startsWith(CACHE)) {
                    throw new Error("EACCES");
                }
                return readFile(path);
            });
            const writes = recordCacheWrites(host);
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(writes.sort()).toEqual([
                `${CACHE}/${PALETTE_HASH}/plugin.css`,
                `${CACHE}/${PALETTE_HASH}/plugin.js`,
            ]);
            expect(answeredPlugins(editor)?.map((plugin) => plugin.name)).toEqual([
                "Reduced Palette",
            ]);
        });

        it("writes the copy once for editors that ask at the same time", async () => {
            const { host, feature, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const editors = [
                await openEditor("/work/order.bpmn"),
                await openEditor("/work/invoice.bpmn"),
            ];
            const writes = recordCacheWrites(host);

            await Promise.all(editors.map((editor) => answerRequest(feature, editor)));

            expect(writes.sort()).toEqual([
                `${CACHE}/${PALETTE_HASH}/plugin.css`,
                `${CACHE}/${PALETTE_HASH}/plugin.js`,
            ]);
            expect(editors.map((editor) => answeredPlugins(editor)?.length)).toEqual([1, 1]);
        });

        it("leaves out a plugin whose copy cannot be written, serves the others and tries again later", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                ...RESIZE_FILES,
            });
            host.pluginApprovals.approvals = [
                { pluginId: PALETTE, contentHash: PALETTE_HASH },
                { pluginId: RESIZE, contentHash: RESIZE_HASH },
            ];
            const writeFile = host.workspace.writeFile.bind(host.workspace);
            vi.spyOn(host.workspace, "writeFile").mockImplementation(async (path, content) => {
                if (path.endsWith(`${PALETTE_HASH}/plugin.js`)) {
                    throw new Error("ENOSPC");
                }
                await writeFile(path, content);
            });
            const editor = await openEditor();

            await requestPlugins(editor);
            const whileFailing = answeredPlugins(editor)?.map((plugin) => plugin.name);
            vi.mocked(host.workspace.writeFile).mockRestore();
            await requestPlugins(editor);

            expect(whileFailing).toEqual(["Resize Tasks"]);
            expect(host.notifier.logged("warning")).toContain(
                'BPMN plugin "Reduced Palette" left out: its copy could not be written (Error: ENOSPC)',
            );
            expect(
                answeredPlugins(editor)
                    ?.map((plugin) => plugin.name)
                    .sort(),
            ).toEqual(["Reduced Palette", "Resize Tasks"]);
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

    describe("pruning the cache", () => {
        const UNNAMED = "0".repeat(64);
        const UPPER = "A".repeat(64);
        // A prune takes only SHA-256 names, so these specs hash as the hosts do.
        const hasher: ContentHasherPort = {
            sha256: (text) => createHash("sha256").update(text, "utf8").digest("hex"),
        };
        const PALETTE_SHA = hasher.sha256(approvedContent("registerPalette();", ".djs-palette {}"));
        const RESIZE_SHA = hasher.sha256(approvedContent("registerResize();", undefined));

        it("removes the copies no stored approval names and keeps anything else in the folder", async () => {
            const { host, feature } = setUp(
                {
                    ...PALETTE_FILES,
                    [`${CACHE}/${PALETTE_SHA}/plugin.js`]: "registerPalette();",
                    [`${CACHE}/${UNNAMED}/plugin.js`]: "registerGone();",
                    [`${CACHE}/${UNNAMED}/plugin.css`]: ".gone {}",
                    [`${CACHE}/${UPPER}/plugin.js`]: "registerUpper();",
                    [`${CACHE}/notes/readme.md`]: "# Notes",
                    [`${CACHE}/${"1".repeat(64)}`]: "a file",
                },
                { hasher },
            );
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_SHA }];

            const pruned = await feature.service.pruneCache();

            expect(pruned).toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual(
                [
                    `${CACHE}/${PALETTE_SHA}/plugin.js`,
                    `${CACHE}/${UPPER}/plugin.js`,
                    `${CACHE}/notes/readme.md`,
                    `${CACHE}/${"1".repeat(64)}`,
                ].sort(),
            );
        });

        it("keeps every hash a stored approval names even when read() lags", async () => {
            const approvals = new MirrorBehindHost();
            const { host, feature } = setUp(
                {
                    [`${CACHE}/${PALETTE_SHA}/plugin.js`]: "registerPalette();",
                    [`${CACHE}/${RESIZE_SHA}/plugin.js`]: "registerResize();",
                },
                { approvals, hasher },
            );
            approvals.approvals = [
                { pluginId: PALETTE, contentHash: PALETTE_SHA },
                { pluginId: OTHER_PALETTE, contentHash: RESIZE_SHA },
            ];

            await expect(feature.service.pruneCache()).resolves.toEqual({ removed: 0 });
            expect(cachePaths(host)).toHaveLength(2);
        });

        it("asks the host nothing when the cache holds no copy", async () => {
            const approvals = new MirrorBehindHost();
            const readStored = vi.spyOn(approvals, "readStored");
            const { feature } = setUp(
                { [`${CACHE}/notes/readme.md`]: "# Notes" },
                { approvals, hasher },
            );

            await expect(feature.service.pruneCache()).resolves.toEqual({ removed: 0 });
            expect(readStored).not.toHaveBeenCalled();
        });

        it("removes nothing before the cache folder exists", async () => {
            const { feature } = setUp(PALETTE_FILES, { hasher });

            await expect(feature.service.pruneCache()).resolves.toEqual({ removed: 0 });
        });

        it("waits for a copy being written before it prunes", async () => {
            const approvals = new MirrorBehindHost();
            const { host, feature, openEditor } = setUp(RESIZE_FILES, { approvals, hasher });
            approvals.mirrored = [{ pluginId: RESIZE, contentHash: RESIZE_SHA }];
            const editor = await openEditor();
            const write = holdNext(host.workspace, "writeFile");
            const answering = answerRequest(feature, editor);
            await write.reached;

            const pruning = feature.service.pruneCache();
            await new Promise((resolve) => setTimeout(resolve, 0));
            write.release();
            await answering;

            await expect(pruning).resolves.toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([]);
        });

        it("copies a plugin again once a prune that ran while it was asked for removed it", async () => {
            const approvals = new MirrorBehindHost();
            const { host, feature, requestPlugins, openEditor } = setUp(
                { ...RESIZE_FILES, [`${CACHE}/${RESIZE_SHA}/plugin.js`]: "registerResize();" },
                { approvals, hasher },
            );
            approvals.mirrored = [{ pluginId: RESIZE, contentHash: RESIZE_SHA }];
            const editor = await openEditor();
            const read = holdNext(approvals, "readStored");
            const pruning = feature.service.pruneCache();
            await read.reached;

            const requesting = requestPlugins(editor);
            await new Promise((resolve) => setTimeout(resolve, 0));
            read.release();
            await pruning;
            await requesting;

            expect(answeredPlugins(editor)?.map(({ name }) => name)).toEqual(["Resize Tasks"]);
            expect(cachePaths(host)).toEqual([`${CACHE}/${RESIZE_SHA}/plugin.js`]);
        });

        it("copies again an entry another process deleted", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES, { hasher });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_SHA }];
            const editor = await openEditor();
            await requestPlugins(editor);

            await host.workspace.deleteDirectory(`${CACHE}/${PALETTE_SHA}`);
            await requestPlugins(editor);

            expect(cachePaths(host)).toEqual([
                `${CACHE}/${PALETTE_SHA}/plugin.css`,
                `${CACHE}/${PALETTE_SHA}/plugin.js`,
            ]);
        });

        it("logs a copy it cannot remove and still removes the others", async () => {
            const OTHER_UNNAMED = "2".repeat(64);
            const { host, feature } = setUp(
                {
                    [`${CACHE}/${UNNAMED}/plugin.js`]: "registerGone();",
                    [`${CACHE}/${OTHER_UNNAMED}/plugin.js`]: "registerGoneToo();",
                },
                { hasher },
            );
            const deleteDirectory = host.workspace.deleteDirectory.bind(host.workspace);
            vi.spyOn(host.workspace, "deleteDirectory").mockImplementation(async (path) => {
                if (path.endsWith(UNNAMED)) throw new Error("EBUSY");
                await deleteDirectory(path);
            });

            await expect(feature.service.pruneCache()).resolves.toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([`${CACHE}/${UNNAMED}/plugin.js`]);
            expect(host.notifier.logged("warning")).toEqual([
                `BPMN plugin cache: could not remove ${CACHE}/${UNNAMED} (Error: EBUSY)`,
            ]);
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

        it("reads every plugin again when the plugins folder changes as a whole", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                ...RESIZE_FILES,
            });
            host.pluginApprovals.approvals = [
                { pluginId: PALETTE, contentHash: PALETTE_HASH },
                { pluginId: RESIZE, contentHash: RESIZE_HASH },
            ];
            const editor = await openEditor();
            await requestPlugins(editor);
            host.workspace.files.set(`${PALETTE}/client.js`, "registerPalettE();");
            host.workspace.files.set(`${RESIZE}/client.js`, RESIZE_EDITED);
            await requestPlugins(editor);
            const unnoticed = answeredPlugins(editor);

            host.workspace.watchers
                .find(({ root, disposed }) => root === PLUGINS && !disposed)
                ?.handlers.onChange?.(PLUGINS);
            await requestPlugins(editor);

            expect(unnoticed).toHaveLength(2);
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
