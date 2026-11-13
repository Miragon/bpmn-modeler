import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { BpmnPluginsQuery, GetBpmnPluginsCommand } from "@miragon/bpmn-modeler-shared";

import {
    Allowance,
    allowanceOf,
    allowanceRowOf,
    allowingAllowances,
    LOCAL_HOST,
} from "../../kernel/domain/allowance";
import { CodeApprovalChange } from "../../kernel/domain/codeApproval";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { ApprovalReviewPort, PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { AllowanceLocator } from "../../kernel/service/AllowanceLocator";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { ContentRowMigration } from "../../kernel/service/ContentRowMigration";
import { ListReview } from "../../kernel/adapter/out/ListReview";
import { ViewReview } from "../../addOns/adapter/out/ViewReview";
import { QuestionQueue } from "../../kernel/service/QuestionQueue";
import {
    createTestHost,
    FakeEditorHandle,
    fingerprintHasher,
    holdListings,
    holdNext,
    InMemoryInstalledPackages,
    InMemoryPluginApprovals,
    RecordingAddOnViewReveal,
    ScriptedReview,
    TestHostOptions,
    writeLinkedWorktree,
    writeRepository,
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
/** `/other` is a linked worktree of `/work` wherever a spec lays out git. */
const WORKTREE_RESIZE = "/other/.camunda/plugins/resize-tasks";
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
const RESIZE_EDITED_HASH = fingerprintHasher.sha256(approvedContent(RESIZE_EDITED, undefined));
const WORKTREE_RESIZE_FILES = {
    [`${WORKTREE_RESIZE}/index.js`]:
        "module.exports = { name: 'Resize Tasks', script: './client.js' };",
    [`${WORKTREE_RESIZE}/client.js`]: RESIZE_EDITED,
};

const RESIZE_ALLOWANCE: Allowance = allowanceOf(
    "plugin",
    RESIZE,
    { kind: "repository", worktreeRoot: "/work", commonDir: "/work/.git" },
    LOCAL_HOST,
);
const folderRowOf = (folder: string) =>
    allowanceRowOf(allowanceOf("plugin", folder, { kind: "noRepository" }, LOCAL_HOST));
const RESIZE_FOLDER_ROW = folderRowOf(RESIZE);
/** As 1.21.0 stored it: pinned to the content found at the folder. */
const LEGACY_RESIZE_ROW = { pluginId: RESIZE, contentHash: "a".repeat(64) };

/** `/work` a repository and `/other` its linked worktree, with each plugin folder on disk. */
function worktreeAllowances(...pluginFolders: string[]): AllowanceLocator {
    const disk = new InMemoryInstalledPackages();
    writeRepository(disk, "/work");
    writeLinkedWorktree(disk, "/work", "/other");
    pluginFolders.forEach((folder) => disk.createDirectory(folder));
    return new AllowanceLocator(disk, LOCAL_HOST);
}

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
        allowances?: AllowanceLocator;
        /** The host wires no trust port; the fake's trust still changes, reaching nothing. */
        trustUnwired?: boolean;
    } = {},
) {
    const host = createTestHost({ folders: ["/work", "/other"], files, ...options });
    const approvals = options.approvals ?? host.pluginApprovals;
    const allowances = options.allowances ?? host.allowances;
    const contentRows = new ContentRowMigration(approvals, allowances, host.notifier);
    const { workspaceTrust, ...hostPorts } = host;
    const feature = new BpmnPluginsFeature({
        ...hostPorts,
        ...(options.trustUnwired ? {} : { workspaceTrust }),
        artifacts: new ArtifactService(host.workspace, host.settings, host.notifier),
        approvals,
        allowances,
        contentRows,
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
    return { host, feature, contentRows, requestPlugins, openEditor };
}

const answeredPlugins = (editor: FakeEditorHandle) =>
    editor.postedOfType<BpmnPluginsQuery>("BpmnPluginsQuery").at(-1)?.plugins;

/** The content hash of each copy the editor was last served, which names what was read. */
const servedCopies = (editor: FakeEditorHandle) =>
    answeredPlugins(editor)?.map(({ scriptUrl }) => scriptUrl.split("/").at(-2));

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

const cachePaths = (host: ReturnType<typeof createTestHost>) =>
    [...host.workspace.files.keys()].filter((path) => path.startsWith(CACHE)).sort();

describe("BpmnPluginsFeature", () => {
    describe("delivery", () => {
        it("serves an approved plugin from a copy of the approved bytes, without a notice", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
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
            host.pluginApprovals.approvals = [folderRowOf(RESIZE)];
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

        it("serves an updated plugin from its new copy without asking", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            host.pluginApprovals.approvals = [RESIZE_FOLDER_ROW];
            const editor = await openEditor();
            await requestPlugins(editor);

            await host.workspace.writeFile(`${RESIZE}/client.js`, RESIZE_EDITED);
            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([
                {
                    name: "Resize Tasks",
                    scriptUrl: `webview-resource:${CACHE}/${RESIZE_EDITED_HASH}/plugin.js`,
                },
            ]);
            expect(host.workspace.files.get(`${CACHE}/${RESIZE_EDITED_HASH}/plugin.js`)).toBe(
                RESIZE_EDITED,
            );
            expect(host.actionNotifier.notices).toEqual([]);
            expect(editor.reloadCount).toBe(0);
        });

        it("skips a plugin folder it cannot read and still serves the others", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                [`${PLUGINS}/broken/plugin.json`]: '{ "script": "../../escape.js" }',
            });
            host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
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
                host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
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
            host.pluginApprovals.approvals = [folderRowOf(PALETTE), folderRowOf(configFolder)];
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)?.map((plugin) => plugin.name)).toEqual([
                "Reduced Palette",
            ]);
        });

        it("answers with no plugins at once on a host whose webview cannot load them", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
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

    describe("workspace trust", () => {
        it("serves no allowed plugin and asks about none in a workspace the user did not trust", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...RESIZE_FILES,
                ...PALETTE_FILES,
            });
            host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
            host.workspaceTrust.setTrusted(false);
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([]);
            expect(host.actionNotifier.notices).toEqual([]);
        });

        it("reloads the editor once the user trusts the workspace, then serves the allowed plugin and asks about the other", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp({
                ...RESIZE_FILES,
                ...PALETTE_FILES,
            });
            host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
            host.workspaceTrust.setTrusted(false);
            const editor = await openEditor();
            await requestPlugins(editor);

            host.workspaceTrust.setTrusted(true);
            await requestPlugins(editor);
            await feature.service.whenApprovalSettled();

            expect(editor.reloadCount).toBe(1);
            expect(answeredPlugins(editor)?.map(({ name }) => name)).toEqual(["Reduced Palette"]);
            expect(host.actionNotifier.notices).toHaveLength(1);
        });

        it("asks about an open editor's new plugin once the user trusts the workspace, without reloading it", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            host.workspaceTrust.setTrusted(false);
            const editor = await openEditor();
            await requestPlugins(editor);

            host.workspaceTrust.setTrusted(true);
            await feature.service.whenApprovalSettled();

            expect(editor.reloadCount).toBe(0);
            expect(host.actionNotifier.notices.map(({ message }) => message)).toEqual([
                "1 BPMN plugin in this workspace is not allowed yet.",
            ]);
        });

        it("asks about a plugin that two open editors withhold once, after the user trusts the workspace", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            host.workspaceTrust.setTrusted(false);
            const first = await openEditor();
            const second = await openEditor("/work/invoice.bpmn");
            await requestPlugins(first);
            await requestPlugins(second);

            host.workspaceTrust.setTrusted(true);
            await feature.service.whenApprovalSettled();

            expect(host.actionNotifier.notices).toHaveLength(1);
        });

        it("serves an allowed plugin where the host wires no trust", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES, {
                trustUnwired: true,
            });
            host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
            host.workspaceTrust.setTrusted(false);
            const editor = await openEditor();

            await requestPlugins(editor);

            expect(answeredPlugins(editor)?.map(({ name }) => name)).toEqual(["Reduced Palette"]);
        });

        it("reloads an editor that loads a plugin once the user withdraws trust, and serves it no more", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
            const editor = await openEditor();
            await requestPlugins(editor);

            host.workspaceTrust.setTrusted(false);
            await requestPlugins(editor);

            expect(editor.reloadCount).toBe(1);
            expect(answeredPlugins(editor)).toEqual([]);
        });

        it("asks nothing about a plugin found before the user withdrew trust", async () => {
            const questions = new QuestionQueue();
            let answerEarlierQuestion: () => void = () => undefined;
            void questions.ask(
                () => new Promise<void>((resolve) => (answerEarlierQuestion = resolve)),
            );
            const { host, feature, openEditor } = setUp(RESIZE_FILES, { questions });
            const editor = await openEditor();
            await answerRequest(feature, editor);

            host.workspaceTrust.setTrusted(false);
            answerEarlierQuestion();
            await feature.service.whenApprovalSettled();

            expect(host.actionNotifier.notices).toEqual([]);
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
            expect(host.pluginApprovals.approvals).toEqual([RESIZE_FOLDER_ROW]);
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

        it("asks once about a plugin found in two worktrees and reloads both editors with it", async () => {
            const { host, feature, openEditor } = setUp(
                { ...RESIZE_FILES, ...WORKTREE_RESIZE_FILES },
                {
                    ...REVIEW_AND_ALLOW(RESIZE),
                    allowances: worktreeAllowances(RESIZE, WORKTREE_RESIZE),
                },
            );
            const notice = host.actionNotifier.holdNextNotice();
            const main = await openEditor("/work/order.bpmn");
            const worktree = await openEditor("/other/order.bpmn");
            await answerRequest(feature, main);
            await answerRequest(feature, worktree);

            notice.answer("review");
            await feature.service.whenApprovalSettled();

            expect(host.actionNotifier.notices).toHaveLength(1);
            expect(reviewedLabels(host)).toEqual([["Resize Tasks"]]);
            expect(host.pluginApprovals.approvals).toEqual([allowanceRowOf(RESIZE_ALLOWANCE)]);
            expect([main.reloadCount, worktree.reloadCount]).toEqual([1, 1]);
        });

        it("serves a plugin in a second worktree without asking once the first allowed it", async () => {
            const { host, requestPlugins, openEditor } = setUp(WORKTREE_RESIZE_FILES, {
                allowances: worktreeAllowances(WORKTREE_RESIZE),
            });
            host.pluginApprovals.approvals = [allowanceRowOf(RESIZE_ALLOWANCE)];
            const editor = await openEditor("/other/order.bpmn");

            await requestPlugins(editor);

            expect(answeredPlugins(editor)).toEqual([
                {
                    name: "Resize Tasks",
                    scriptUrl: `webview-resource:${CACHE}/${RESIZE_EDITED_HASH}/plugin.js`,
                },
            ]);
            expect(host.actionNotifier.notices).toEqual([]);
        });

        it("serves a plugin a 1.21.0 row allows at its folder, before and after the migration, without a reload", async () => {
            const { host, contentRows, requestPlugins, openEditor } = setUp(RESIZE_FILES, {
                allowances: worktreeAllowances(RESIZE),
            });
            host.pluginApprovals.approvals = [LEGACY_RESIZE_ROW];
            const editor = await openEditor();
            await requestPlugins(editor);
            const before = answeredPlugins(editor);

            await contentRows.run();
            await requestPlugins(editor);

            expect(host.pluginApprovals.approvals).toEqual([allowanceRowOf(RESIZE_ALLOWANCE)]);
            expect(before?.map(({ name }) => name)).toEqual(["Resize Tasks"]);
            expect(answeredPlugins(editor)?.map(({ name }) => name)).toEqual(["Resize Tasks"]);
            expect(host.actionNotifier.notices).toEqual([]);
            expect(editor.reloadCount).toBe(0);
        });

        it("does not ask about a second worktree while the migration is in flight", async () => {
            const { host, feature, contentRows, openEditor } = setUp(
                { ...RESIZE_FILES, ...WORKTREE_RESIZE_FILES },
                { allowances: worktreeAllowances(RESIZE, WORKTREE_RESIZE) },
            );
            host.pluginApprovals.approvals = [LEGACY_RESIZE_ROW];
            const migrationWrite = holdNext(host.pluginApprovals, "change");
            const migration = contentRows.run();
            await migrationWrite.reached;
            const worktree = await openEditor("/other/order.bpmn");

            const request = answerRequest(feature, worktree);
            await new Promise((resolve) => setTimeout(resolve, 0));
            const noticesInFlight = host.actionNotifier.notices.length;
            migrationWrite.release();
            await migration;
            await request;
            await feature.service.whenApprovalSettled();

            expect(noticesInFlight).toBe(0);
            expect(host.actionNotifier.notices).toEqual([]);
            expect(answeredPlugins(worktree)?.map(({ name }) => name)).toEqual(["Resize Tasks"]);
        });

        it("reloads every worktree's editor once the allowance is revoked", async () => {
            const { host, requestPlugins, openEditor } = setUp(
                { ...RESIZE_FILES, ...WORKTREE_RESIZE_FILES },
                { allowances: worktreeAllowances(RESIZE, WORKTREE_RESIZE) },
            );
            host.pluginApprovals.storeElsewhere([allowanceRowOf(RESIZE_ALLOWANCE)], {
                notify: true,
            });
            const main = await openEditor("/work/order.bpmn");
            const worktree = await openEditor("/other/order.bpmn");
            await requestPlugins(main);
            await requestPlugins(worktree);

            host.pluginApprovals.storeElsewhere([], { notify: true });

            expect([main.reloadCount, worktree.reloadCount]).toEqual([1, 1]);
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

        it("does not notify again about a closed plugin once its code changed", async () => {
            const { host, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();
            await requestPlugins(editor);

            await host.workspace.writeFile(`${RESIZE}/client.js`, RESIZE_EDITED);
            await requestPlugins(editor);

            expect(host.actionNotifier.notices).toHaveLength(1);
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

            host.pluginApprovals.storeElsewhere([folderRowOf(RESIZE)], {
                notify: true,
            });

            expect(editor.reloadCount).toBe(1);
        });

        it("reloads the editors that loaded a plugin another writer revoked", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...RESIZE_FILES,
                ...OTHER_PALETTE_FILES,
            });
            host.pluginApprovals.storeElsewhere([folderRowOf(RESIZE)], {
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
            const allowed = [folderRowOf(RESIZE)];
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

            host.pluginApprovals.storeElsewhere([folderRowOf(RESIZE)]);

            expect(editor.reloadCount).toBe(0);
        });

        it("follows no approval change once disposed", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(RESIZE_FILES);
            const editor = await openEditor();
            await requestPlugins(editor);

            feature.dispose();
            host.pluginApprovals.storeElsewhere([folderRowOf(RESIZE)], {
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
            const rulePackage = {
                id: "/work/node_modules/bpmnlint-plugin-acme",
                allowance: allowanceOf(
                    "rulePackage",
                    "/work/node_modules/bpmnlint-plugin-acme",
                    { kind: "noRepository" },
                    LOCAL_HOST,
                ),
            };
            const notice = host.actionNotifier.holdNextNotice();
            await answerRequest(feature, await openEditor());

            const rulePackageAnswer = questions.ask(() =>
                approvals.change(allowingAllowances([rulePackage])),
            );
            notice.answer("review");
            await feature.service.whenApprovalSettled();
            await rulePackageAnswer;

            expect(approvals.approvals).toEqual([
                RESIZE_FOLDER_ROW,
                allowanceRowOf(rulePackage.allowance),
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
        const NOW = Date.UTC(2026, 10, 11);
        const IDLE = "1".repeat(64);
        // A prune takes only SHA-256 names, so these specs hash as the hosts do.
        const hasher: ContentHasherPort = {
            sha256: (text) => createHash("sha256").update(text, "utf8").digest("hex"),
        };
        const PALETTE_SHA = hasher.sha256(approvedContent("registerPalette();", ".djs-palette {}"));
        const RESIZE_SHA = hasher.sha256(approvedContent("registerResize();", undefined));

        it("leaves out a plugin whose copy cannot be written, serves the others and tries again later", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                ...RESIZE_FILES,
            });
            host.pluginApprovals.approvals = [folderRowOf(PALETTE), folderRowOf(RESIZE)];
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

        it("keeps at start-up a copy an editor here is served, even with its last use gone", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(PALETTE_FILES, {
                hasher,
                now: () => NOW,
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_SHA }];
            await requestPlugins(await openEditor());
            host.workspace.files.delete(`${CACHE}/${PALETTE_SHA}/last-used`);

            await expect(feature.cache.pruneIdleCopies()).resolves.toEqual({ removed: 0 });
        });

        it("removes on request the copy of an editor that closed", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(PALETTE_FILES, {
                hasher,
            });
            host.pluginApprovals.approvals = [{ pluginId: PALETTE, contentHash: PALETTE_SHA }];
            const editor = await openEditor();
            await requestPlugins(editor);
            editor.dispose();

            await expect(feature.cache.pruneUnusedCopies()).resolves.toEqual({ removed: 1 });
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

        it("keeps a copy an editor asks for while a prune lists the cache", async () => {
            const { host, feature, requestPlugins, openEditor } = setUp(
                { ...RESIZE_FILES, [`${CACHE}/${RESIZE_SHA}/plugin.js`]: "registerResize();" },
                { hasher },
            );
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_SHA }];
            const editor = await openEditor();
            const [listingCache] = holdListings(host.workspace, [CACHE]);
            const pruning = feature.cache.pruneIdleCopies();
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
    });

    describe("discovery", () => {
        it("does not read a plugin again until a file in its folder changes", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
            const editor = await openEditor();
            await requestPlugins(editor);

            // Behind the watcher's back: what was read before still counts.
            host.workspace.files.set(`${PALETTE}/client.js`, "registerPalette(2);");
            await requestPlugins(editor);
            const unnoticed = servedCopies(editor);
            await host.workspace.writeFile(`${PALETTE}/client.js`, "registerPalette(3);");
            await requestPlugins(editor);

            expect(unnoticed).toEqual([PALETTE_HASH]);
            expect(servedCopies(editor)).toEqual([
                fingerprintHasher.sha256(approvedContent("registerPalette(3);", ".djs-palette {}")),
            ]);
        });

        it("reads a plugin folder replaced as a whole again", async () => {
            const { host, requestPlugins, openEditor } = setUp(PALETTE_FILES);
            host.pluginApprovals.approvals = [folderRowOf(PALETTE)];
            const editor = await openEditor();
            await requestPlugins(editor);

            await host.workspace.deleteDirectory(PALETTE);
            host.workspace.createDirectory(PALETTE, {
                [`${PALETTE}/plugin.json`]: '{ "name": "Reduced Palette", "script": "client.js" }',
                [`${PALETTE}/client.js`]: "registerPalette();",
            });
            await requestPlugins(editor);

            expect(servedCopies(editor)).toEqual([
                fingerprintHasher.sha256(approvedContent("registerPalette();", undefined)),
            ]);
        });

        it("reads every plugin again when the plugins folder changes as a whole", async () => {
            const { host, requestPlugins, openEditor } = setUp({
                ...PALETTE_FILES,
                ...RESIZE_FILES,
            });
            host.pluginApprovals.approvals = [folderRowOf(PALETTE), folderRowOf(RESIZE)];
            const editor = await openEditor();
            await requestPlugins(editor);
            host.workspace.files.set(`${PALETTE}/client.js`, "registerPalettE();");
            host.workspace.files.set(`${RESIZE}/client.js`, RESIZE_EDITED);
            await requestPlugins(editor);
            const unnoticed = servedCopies(editor);

            host.workspace.watchers
                .find(({ root, disposed }) => root === PLUGINS && !disposed)
                ?.handlers.onChange?.(PLUGINS);
            await requestPlugins(editor);

            expect(unnoticed).toEqual([PALETTE_HASH, RESIZE_HASH]);
            expect(servedCopies(editor)).toEqual([
                fingerprintHasher.sha256(approvedContent("registerPalettE();", ".djs-palette {}")),
                RESIZE_EDITED_HASH,
            ]);
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
