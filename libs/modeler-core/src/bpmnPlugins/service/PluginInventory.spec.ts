import { describe, expect, it } from "vitest";

import { GetBpmnPluginsCommand } from "@miragon/bpmn-modeler-shared";

import { allowanceOf, LOCAL_HOST } from "../../kernel/domain/allowance";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { QuestionQueue } from "../../kernel/service/QuestionQueue";
import { createTestHost, fingerprintHasher } from "../../testing";
import { PLUGIN_APPROVAL_NOTICE_ID } from "../domain/pluginApproval";
import { NO_MANIFEST_REASON } from "../domain/pluginManifest";
import { BpmnPluginsFeature } from "../composition/BpmnPluginsFeature";

const PLUGINS = "/work/.camunda/plugins";
const RESIZE = `${PLUGINS}/resize-tasks`;
const PALETTE = `${PLUGINS}/reduced-palette`;
const BROKEN = `${PLUGINS}/broken`;
const NESTED_PLUGINS = "/work/orders/.camunda/plugins";
const CACHE = "/storage/bpmn-plugins";

const RESIZE_FILES = {
    [`${RESIZE}/plugin.json`]: '{ "name": "Resize Tasks", "script": "client.js" }',
    [`${RESIZE}/client.js`]: "registerResize();",
};
const PALETTE_FILES = {
    [`${PALETTE}/plugin.json`]:
        '{ "name": "Reduced Palette", "script": "client.js", "style": "palette.css" }',
    [`${PALETTE}/client.js`]: "registerPalette();",
    [`${PALETTE}/palette.css`]: ".djs-palette {}",
};
const folderAllowance = (folder: string) =>
    allowanceOf("plugin", folder, { kind: "noRepository" }, LOCAL_HOST);

function setUp(files: Record<string, string>) {
    const host = createTestHost({ folders: ["/work"], files });
    const feature = new BpmnPluginsFeature({
        ...host,
        artifacts: new ArtifactService(host.workspace, host.settings, host.notifier),
        approvals: host.pluginApprovals,
        cacheRoot: CACHE,
        hasher: fingerprintHasher,
        questions: new QuestionQueue(),
    });
    return { host, feature, inventory: feature.inventory };
}

describe("PluginInventory", () => {
    it("lists every plugin folder in a plugins folder, one it cannot read with the reason", async () => {
        const { inventory } = setUp({
            ...RESIZE_FILES,
            ...PALETTE_FILES,
            [`${BROKEN}/readme.md`]: "no manifest",
        });

        const listed = await inventory.pluginsIn([PLUGINS, "/work/missing/plugins"]);

        expect(listed).toEqual([
            {
                kind: "found",
                artifact: { id: RESIZE, name: "Resize Tasks", allowance: folderAllowance(RESIZE) },
                name: "Resize Tasks",
            },
            {
                kind: "found",
                artifact: {
                    id: PALETTE,
                    name: "Reduced Palette",
                    allowance: folderAllowance(PALETTE),
                },
                name: "Reduced Palette",
            },
            {
                kind: "unreadable",
                id: BROKEN,
                name: "broken",
                reason: NO_MANIFEST_REASON,
                allowance: folderAllowance(BROKEN),
            },
        ]);
    });

    it("knows the plugins folders it and the editors looked in", async () => {
        const { host, feature, inventory } = setUp({ ...RESIZE_FILES });
        const editor = await host.openSession("/work/orders/order.bpmn", [
            feature.editorContribution.participant,
        ]);
        await feature.editorContribution.commandHandlers.GetBpmnPluginsCommand(
            new GetBpmnPluginsCommand(),
            editor.id,
        );

        await inventory.pluginsIn([NESTED_PLUGINS]);

        expect(inventory.knownPluginDirs()).toEqual([PLUGINS, NESTED_PLUGINS]);
    });

    it("reads a plugin again past what it remembered", async () => {
        const { host, inventory } = setUp({ ...RESIZE_FILES });
        await inventory.pluginsIn([PLUGINS]);
        // Changed without a watcher event, so only a fresh read sees it.
        host.workspace.files.set(
            `${RESIZE}/plugin.json`,
            '{ "name": "Resize Tasks (edited)", "script": "client.js" }',
        );

        const current = await inventory.current(RESIZE);

        expect(current).toEqual({
            kind: "found",
            artifact: {
                id: RESIZE,
                name: "Resize Tasks (edited)",
                allowance: folderAllowance(RESIZE),
            },
            name: "Resize Tasks (edited)",
        });
    });

    it.each([
        {
            case: "gone once its folder is",
            folder: `${PLUGINS}/deleted`,
            presence: { kind: "gone", id: `${PLUGINS}/deleted`, name: "deleted" },
        },
        {
            case: "unreadable without a manifest",
            folder: BROKEN,
            presence: {
                kind: "unreadable",
                id: BROKEN,
                name: "broken",
                reason: NO_MANIFEST_REASON,
                allowance: folderAllowance(BROKEN),
            },
        },
    ])("reads a plugin as $case", async ({ folder, presence }) => {
        const { inventory } = setUp({ [`${BROKEN}/readme.md`]: "no manifest" });

        expect(await inventory.current(folder)).toEqual(presence);
    });

    it("announces a change below a plugins folder it listed, and an answer about a plugin", async () => {
        const { host, inventory, feature } = setUp({ ...RESIZE_FILES });
        let changes = 0;
        inventory.onDidChange(() => changes++);
        await inventory.pluginsIn([PLUGINS]);

        await host.workspace.writeFile(`${RESIZE}/client.js`, "registerResizE();");
        await feature.catalog.applyAnswer(
            [
                {
                    id: RESIZE,
                    name: "Resize Tasks",
                    allowance: folderAllowance(RESIZE),
                    contentHash: "h",
                    scriptPath: "s",
                },
            ],
            { kind: "checked", ids: [] },
        );

        expect(changes).toBe(2);
    });

    it("asks no notice about a plugin left to the view, and remembers it for the session", async () => {
        const { host, feature, inventory } = setUp({ ...RESIZE_FILES });
        const [listed] = await inventory.pluginsIn([PLUGINS]);
        if (listed.kind !== "found") throw new Error("not found");

        inventory.leaveForView(listed.artifact);
        const editor = await host.openSession("/work/order.bpmn", [
            feature.editorContribution.participant,
        ]);
        await feature.editorContribution.commandHandlers.GetBpmnPluginsCommand(
            new GetBpmnPluginsCommand(),
            editor.id,
        );
        await feature.service.whenApprovalSettled();

        expect(host.actionNotifier.notices.map(({ id }) => id)).not.toContain(
            PLUGIN_APPROVAL_NOTICE_ID,
        );
        expect([...inventory.sessionAnswers().values()]).toEqual(["leftForView"]);
    });

    it("removes on request every copy no editor is served, however recently used", async () => {
        const { inventory } = setUp({
            [`${CACHE}/${"a".repeat(64)}/plugin.js`]: "registerResize();",
            [`${CACHE}/${"a".repeat(64)}/last-used`]: String(Date.now()),
            [`${CACHE}/${"b".repeat(64)}/plugin.js`]: "registerPalette();",
        });

        expect(await inventory.pruneCache()).toEqual({ removed: 2 });
    });
});
