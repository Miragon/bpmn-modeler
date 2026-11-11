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
import { ApprovalReviewPort, PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { ListReview } from "../../kernel/adapter/out/ListReview";
import { ViewReview } from "../../addOns/adapter/out/ViewReview";
import { QuestionQueue } from "../../kernel/service/QuestionQueue";
import {
    createTestHost,
    FakeEditorHandle,
    fingerprintHasher,
    InMemoryPluginApprovals,
    RecordingAddOnViewReveal,
    ScriptedReview,
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
const WORKTREE_RESIZE = "/worktree/.camunda/plugins/resize-tasks";
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
        review?: ScriptedReview | ((host: ReturnType<typeof createTestHost>) => ApprovalReviewPort);
        now?: () => number;
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
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.review === undefined
            ? {}
            : {
                  review:
                      typeof options.review === "function" ? options.review(host) : options.review,
              }),
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

/** A host that cannot answer for the approvals it stores. */
class UnreachableHost extends InMemoryPluginApprovals {
    override readStored(): Promise<readonly CodeApproval[]> {
        return Promise.reject(new Error("host unreachable"));
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

interface Hold {
    readonly reached: Promise<void>;
    release(): void;
}

/** Holds the first listing of each path until the test releases it, in the order of `paths`. */
function holdListings(host: ReturnType<typeof createTestHost>, paths: readonly string[]): Hold[] {
    const holds = new Map<string, Hold & { reach(): void; readonly held: Promise<void> }>();
    for (const path of paths) {
        let release: () => void = () => undefined;
        let reach: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const reached = new Promise<void>((resolve) => {
            reach = resolve;
        });
        holds.set(path, { held, reached, reach: () => reach(), release: () => release() });
    }
    const listed = [...holds.values()];
    const readDirectory = host.workspace.readDirectory.bind(host.workspace);
    vi.spyOn(host.workspace, "readDirectory").mockImplementation(async (path) => {
        const hold = holds.get(path);
        if (hold !== undefined) {
            holds.delete(path);
            hold.reach();
            await hold.held;
        }
        return readDirectory(path);
    });
    return listed;
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
            expect(cachePaths(host)).toEqual([
                `${CACHE}/${RESIZE_HASH}/last-used`,
                `${CACHE}/${RESIZE_HASH}/plugin.js`,
            ]);
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

        it("takes Review… to the review the host passes, which can leave the plugin to a view", async () => {
            const review = new ScriptedReview({ [PLUGIN_APPROVAL_PROMPT_ID]: "leftForView" });
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES, {
                noticeAnswers: { [PLUGIN_APPROVAL_NOTICE_ID]: "review" },
                review,
            });
            const editor = await openEditor();

            await requestPlugins(editor);
            await requestPlugins(await openEditor("/work/invoice.bpmn"));

            expect(review.requests.map(({ artifactIds }) => artifactIds)).toEqual([[RESIZE]]);
            expect(host.picker.prompts).toEqual([]);
            expect(host.pluginApprovals.approvals).toEqual([]);
            expect(host.actionNotifier.notices).toHaveLength(1);
            expect(editor.reloadCount).toBe(0);
        });

        it("takes Review… to the add-ons view at the plugin's row when the view lists it", async () => {
            const view = new RecordingAddOnViewReveal();
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES, {
                noticeAnswers: { [PLUGIN_APPROVAL_NOTICE_ID]: "review" },
                review: (testHost) =>
                    new ViewReview("plugin", view, new ListReview(testHost.picker)),
            });
            const editor = await openEditor();

            await requestPlugins(editor);
            await requestPlugins(await openEditor("/work/invoice.bpmn"));

            expect(view.revealed).toEqual([[`plugin:${RESIZE}`]]);
            expect(host.picker.prompts).toEqual([]);
            expect(host.actionNotifier.notices).toHaveLength(1);
            expect(host.pluginApprovals.approvals).toEqual([]);
            expect(editor.reloadCount).toBe(0);
        });

        it("serves a plugin allowed in another folder without a notice, stores its row and logs one line", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const worktree = { pluginId: WORKTREE_RESIZE, contentHash: RESIZE_HASH };
            host.pluginApprovals.approvals = [worktree];
            const editor = await openEditor();

            await requestPlugins(editor);
            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([
                {
                    name: "Resize Tasks",
                    scriptUrl: `webview-resource:${CACHE}/${RESIZE_HASH}/plugin.js`,
                },
            ]);
            expect(host.actionNotifier.notices).toEqual([]);
            expect(host.pluginApprovals.approvals).toEqual([
                worktree,
                { pluginId: RESIZE, contentHash: RESIZE_HASH },
            ]);
            expect(host.notifier.logged("info")).toEqual([
                `Allowed BPMN plugin Resize Tasks in ${RESIZE}: you allowed the same content in ${WORKTREE_RESIZE}.`,
            ]);
        });

        it("a stored row of content allowed elsewhere reloads no editor", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            host.pluginApprovals.approvals = [
                { pluginId: WORKTREE_RESIZE, contentHash: RESIZE_HASH },
            ];
            const first = await openEditor("/work/order.bpmn");
            await requestPlugins(first);
            const second = await openEditor("/work/shipping.bpmn");

            await requestPlugins(second);

            expect([first.reloadCount, second.reloadCount]).toEqual([0, 0]);
        });

        it("replaces a row here of older content with content allowed in another folder", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const worktree = { pluginId: WORKTREE_RESIZE, contentHash: RESIZE_HASH };
            host.pluginApprovals.approvals = [
                { pluginId: RESIZE, contentHash: "0".repeat(64) },
                worktree,
            ];
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)?.map(({ name }) => name)).toEqual(["Resize Tasks"]);
            expect(host.actionNotifier.notices).toEqual([]);
            expect(host.pluginApprovals.approvals).toEqual([
                { pluginId: RESIZE, contentHash: RESIZE_HASH },
                worktree,
            ]);
        });

        it("still serves a plugin allowed in another folder when storing its row fails, and logs why", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            host.pluginApprovals.approvals = [
                { pluginId: WORKTREE_RESIZE, contentHash: RESIZE_HASH },
            ];
            vi.spyOn(host.pluginApprovals, "change").mockRejectedValue(new Error("store locked"));
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)?.map(({ name }) => name)).toEqual(["Resize Tasks"]);
            expect(host.notifier.logged("error")).toEqual([
                expect.stringContaining("store locked"),
            ]);
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

        it("serves a copy an earlier session wrote and writes only its last use", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                [`${CACHE}/${PALETTE_HASH}/plugin.js`]: "registerPalette();",
                [`${CACHE}/${PALETTE_HASH}/plugin.css`]: ".djs-palette {}",
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const writes = recordCacheWrites(host);
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(writes).toEqual([`${CACHE}/${PALETTE_HASH}/last-used`]);
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

            expect(writes).toEqual([
                `${CACHE}/${PALETTE_HASH}/last-used`,
                `${CACHE}/${PALETTE_HASH}/plugin.js`,
            ]);
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
                `${CACHE}/${PALETTE_HASH}/last-used`,
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
                `${CACHE}/${PALETTE_HASH}/last-used`,
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

    describe("recording the last use of a copy", () => {
        const DAY = 24 * 60 * 60 * 1000;
        const NOW = Date.UTC(2026, 10, 11);
        const MARKER = `${CACHE}/${PALETTE_HASH}/last-used`;

        function clockAt(start: number) {
            const clock = { ms: start, now: () => clock.ms };
            return clock;
        }

        it("writes the time it copied a plugin beside the copy", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES, {
                now: () => NOW,
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];

            await requestPlugins(await openEditor());

            expect(host.workspace.files.get(MARKER)).toBe(String(NOW));
        });

        it("records a served copy's use at most once a day", async () => {
            const clock = clockAt(NOW);
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES, {
                now: clock.now,
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const editor = await openEditor();
            await requestPlugins(editor);

            clock.ms = NOW + DAY - 1;
            await requestPlugins(await openEditor("/work/invoice.bpmn"));
            const withinTheDay = host.workspace.files.get(MARKER);
            clock.ms = NOW + DAY;
            await requestPlugins(editor);

            expect(withinTheDay).toBe(String(NOW));
            expect(host.workspace.files.get(MARKER)).toBe(String(NOW + DAY));
        });

        it("serves a plugin whose use it cannot record, logs why and tries again on the next request", async () => {
            const clock = clockAt(NOW);
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES, {
                now: clock.now,
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_HASH }];
            const editor = await openEditor();
            await requestPlugins(editor);
            clock.ms = NOW + DAY;
            const writeFile = host.workspace.writeFile.bind(host.workspace);
            vi.spyOn(host.workspace, "writeFile").mockImplementation(async (path, content) => {
                if (path === MARKER) throw new Error("EROFS");
                await writeFile(path, content);
            });

            await requestPlugins(editor);
            const whileFailing = answeredPlugins(editor)?.map(({ name }) => name);
            vi.mocked(host.workspace.writeFile).mockRestore();
            await requestPlugins(editor);

            expect(whileFailing).toEqual(["Reduced Palette"]);
            expect(host.notifier.logged("warning")).toEqual([
                `BPMN plugin cache: could not record the use of ${CACHE}/${PALETTE_HASH} (Error: EROFS)`,
            ]);
            expect(host.workspace.files.get(MARKER)).toBe(String(NOW + DAY));
        });
    });

    describe("pruning the cache", () => {
        const DAY = 24 * 60 * 60 * 1000;
        const NOW = Date.UTC(2026, 10, 11);
        const UPPER = "A".repeat(64);
        const IDLE = "1".repeat(64);
        const RECENT = "2".repeat(64);
        const UNMARKED = "3".repeat(64);
        const UNREADABLE = "4".repeat(64);
        const HEX_FILE = "5".repeat(64);
        // A prune takes only SHA-256 names, so these specs hash as the hosts do.
        const hasher: ContentHasherPort = {
            sha256: (text) => createHash("sha256").update(text, "utf8").digest("hex"),
        };
        const PALETTE_SHA = hasher.sha256(approvedContent("registerPalette();", ".djs-palette {}"));
        const RESIZE_SHA = hasher.sha256(approvedContent("registerResize();", undefined));
        const copyUsed = (hash: string, lastUse: string) => ({
            [`${CACHE}/${hash}/plugin.js`]: "registerPlugin();",
            [`${CACHE}/${hash}/last-used`]: lastUse,
        });

        it("removes at start-up the copies idle for 30 days or without a last use, reads no approval and keeps anything else", async () => {
            const { host, feature } = setUp(
                {
                    ...copyUsed(IDLE, String(NOW - 30 * DAY)),
                    ...copyUsed(RECENT, String(NOW - 30 * DAY + 1)),
                    ...copyUsed(UNREADABLE, "yesterday"),
                    [`${CACHE}/${UNMARKED}/plugin.js`]: "registerUnmarked();",
                    ...copyUsed(UPPER, "0"),
                    [`${CACHE}/notes/readme.md`]: "# Notes",
                    [`${CACHE}/notes/last-used`]: "0",
                    [`${CACHE}/${HEX_FILE}`]: "a file",
                },
                { hasher, approvals: new UnreachableHost(), now: () => NOW },
            );

            const pruned = await feature.service.pruneIdleCopies();

            expect(pruned).toEqual({ removed: 3 });
            expect(cachePaths(host)).toEqual(
                [
                    `${CACHE}/${RECENT}/last-used`,
                    `${CACHE}/${RECENT}/plugin.js`,
                    `${CACHE}/${UPPER}/last-used`,
                    `${CACHE}/${UPPER}/plugin.js`,
                    `${CACHE}/notes/last-used`,
                    `${CACHE}/notes/readme.md`,
                    `${CACHE}/${HEX_FILE}`,
                ].sort(),
            );
        });

        it("removes on request every copy no editor here is served, however recently used", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(
                { ...PALETTE_FILES, ...copyUsed(RECENT, String(NOW)) },
                { hasher, now: () => NOW },
            );
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_SHA }];
            await requestPlugins(await openEditor());

            const pruned = await feature.service.pruneUnusedCopies();

            expect(pruned).toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([
                `${CACHE}/${PALETTE_SHA}/last-used`,
                `${CACHE}/${PALETTE_SHA}/plugin.css`,
                `${CACHE}/${PALETTE_SHA}/plugin.js`,
            ]);
        });

        it("keeps at start-up a copy an editor here is served, even with its last use gone", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(PALETTE_FILES, {
                hasher,
                now: () => NOW,
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_SHA }];
            await requestPlugins(await openEditor());
            host.workspace.files.delete(`${CACHE}/${PALETTE_SHA}/last-used`);

            await expect(feature.service.pruneIdleCopies()).resolves.toEqual({ removed: 0 });
        });

        it("removes on request the copy of an editor that closed", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(PALETTE_FILES, {
                hasher,
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_SHA }];
            const editor = await openEditor();
            await requestPlugins(editor);
            editor.dispose();

            await expect(feature.service.pruneUnusedCopies()).resolves.toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([]);
        });

        it("logs a start-up prune whose cache cannot be listed and removes nothing", async () => {
            const { host, feature } = setUp(
                { [`${CACHE}/${IDLE}/plugin.js`]: "registerGone();" },
                { hasher, now: () => NOW },
            );
            const readDirectory = host.workspace.readDirectory.bind(host.workspace);
            vi.spyOn(host.workspace, "readDirectory").mockImplementation(async (path) => {
                if (path === CACHE) throw new Error("cache unreadable");
                return readDirectory(path);
            });

            await feature.pruneIdleCopies();

            expect(cachePaths(host)).toEqual([`${CACHE}/${IDLE}/plugin.js`]);
            expect(host.notifier.logged("error")).toEqual([
                expect.stringContaining("cache unreadable"),
            ]);
        });

        it("removes nothing before the cache folder exists", async () => {
            const { feature } = setUp(PALETTE_FILES, { hasher });

            await expect(feature.service.pruneIdleCopies()).resolves.toEqual({ removed: 0 });
        });

        it("waits for a copy being written before it prunes", async () => {
            const { host, feature, openEditor } = setUp(RESIZE_FILES, { hasher });
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_SHA }];
            const editor = await openEditor();
            const write = holdNext(host.workspace, "writeFile");
            const answering = answerRequest(feature, editor);
            await write.reached;
            feature.service.releaseEditor(editor.id);

            const pruning = feature.service.pruneUnusedCopies();
            await new Promise((resolve) => setTimeout(resolve, 0));
            write.release();
            await answering;

            await expect(pruning).resolves.toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([]);
        });

        it("waits for a last use being recorded before it prunes", async () => {
            const clock = { ms: NOW };
            const { host, feature, requestPlugins, openEditor } = setUp(RESIZE_FILES, {
                hasher,
                now: () => clock.ms,
            });
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_SHA }];
            const editor = await openEditor();
            await requestPlugins(editor);
            clock.ms = NOW + DAY;
            const write = holdNext(host.workspace, "writeFile");
            const answering = answerRequest(feature, editor);
            await write.reached;
            feature.service.releaseEditor(editor.id);

            const pruning = feature.service.pruneUnusedCopies();
            await new Promise((resolve) => setTimeout(resolve, 0));
            write.release();
            await answering;

            await expect(pruning).resolves.toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([]);
        });

        it("records no last use while a prune runs", async () => {
            const clock = { ms: NOW };
            const { host, feature, requestPlugins, openEditor } = setUp(RESIZE_FILES, {
                hasher,
                now: () => clock.ms,
            });
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_SHA }];
            const editor = await openEditor();
            await requestPlugins(editor);
            clock.ms = NOW + 31 * DAY;
            const [checkingCopy, listingCache] = holdListings(host, [
                `${CACHE}/${RESIZE_SHA}`,
                CACHE,
            ]);

            const answering = answerRequest(feature, editor);
            await checkingCopy.reached;
            feature.service.releaseEditor(editor.id);
            const pruning = feature.service.pruneIdleCopies();
            await listingCache.reached;
            checkingCopy.release();
            await new Promise((resolve) => setTimeout(resolve, 0));
            listingCache.release();

            await expect(pruning).resolves.toEqual({ removed: 1 });
            await answering;
            expect(cachePaths(host)).toEqual([]);
        });

        it("keeps a copy an editor asks for while a prune lists the cache", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(
                { ...RESIZE_FILES, [`${CACHE}/${RESIZE_SHA}/plugin.js`]: "registerResize();" },
                { hasher },
            );
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_SHA }];
            const editor = await openEditor();
            const [listingCache] = holdListings(host, [CACHE]);
            const pruning = feature.service.pruneIdleCopies();
            await listingCache.reached;

            const requesting = requestPlugins(editor);
            await new Promise((resolve) => setTimeout(resolve, 0));
            listingCache.release();

            await expect(pruning).resolves.toEqual({ removed: 0 });
            await requesting;
            expect(answeredPlugins(editor)?.map(({ name }) => name)).toEqual(["Resize Tasks"]);
            expect(cachePaths(host)).toEqual([
                `${CACHE}/${RESIZE_SHA}/last-used`,
                `${CACHE}/${RESIZE_SHA}/plugin.js`,
            ]);
        });

        it("waits for a prune that starts while it checks a copy another process deleted", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(RESIZE_FILES, { hasher });
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_SHA }];
            const editor = await openEditor();
            await requestPlugins(editor);
            await host.workspace.deleteDirectory(`${CACHE}/${RESIZE_SHA}`);
            const [checkingCopy, listingCache] = holdListings(host, [
                `${CACHE}/${RESIZE_SHA}`,
                CACHE,
            ]);

            const answering = answerRequest(feature, editor);
            await checkingCopy.reached;
            const pruning = feature.service.pruneIdleCopies();
            await listingCache.reached;
            checkingCopy.release();
            await new Promise((resolve) => setTimeout(resolve, 0));
            listingCache.release();
            await pruning;
            await answering;

            expect(answeredPlugins(editor)?.map(({ name }) => name)).toEqual(["Resize Tasks"]);
            expect(cachePaths(host)).toEqual([
                `${CACHE}/${RESIZE_SHA}/last-used`,
                `${CACHE}/${RESIZE_SHA}/plugin.js`,
            ]);
        });

        it("copies again an entry another process deleted", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES, { hasher });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_SHA }];
            const editor = await openEditor();
            await requestPlugins(editor);

            await host.workspace.deleteDirectory(`${CACHE}/${PALETTE_SHA}`);
            await requestPlugins(editor);

            expect(cachePaths(host)).toEqual([
                `${CACHE}/${PALETTE_SHA}/last-used`,
                `${CACHE}/${PALETTE_SHA}/plugin.css`,
                `${CACHE}/${PALETTE_SHA}/plugin.js`,
            ]);
        });

        it("logs a copy it cannot remove and still removes the others", async () => {
            const { host, feature } = setUp(
                {
                    [`${CACHE}/${IDLE}/plugin.js`]: "registerGone();",
                    [`${CACHE}/${UNMARKED}/plugin.js`]: "registerGoneToo();",
                },
                { hasher },
            );
            const deleteDirectory = host.workspace.deleteDirectory.bind(host.workspace);
            vi.spyOn(host.workspace, "deleteDirectory").mockImplementation(async (path) => {
                if (path.endsWith(IDLE)) throw new Error("EBUSY");
                await deleteDirectory(path);
            });

            await expect(feature.service.pruneIdleCopies()).resolves.toEqual({ removed: 1 });
            expect(cachePaths(host)).toEqual([`${CACHE}/${IDLE}/plugin.js`]);
            expect(host.notifier.logged("warning")).toEqual([
                `BPMN plugin cache: could not remove ${CACHE}/${IDLE} (Error: EBUSY)`,
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
