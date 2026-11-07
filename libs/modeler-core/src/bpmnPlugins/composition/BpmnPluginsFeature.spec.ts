import { describe, expect, it } from "vitest";

import { BpmnPluginsQuery, GetBpmnPluginsCommand } from "@miragon/bpmn-modeler-shared";

import { ArtifactService } from "../../kernel/service/ArtifactService";
import { createTestHost } from "../../testing";
import { PLUGIN_APPROVAL_PROMPT_ID, PluginApproval } from "../domain/pluginApproval";
import { ContentHasherPort, PluginApprovalStorePort } from "../port/pluginPorts";
import { BpmnPluginsFeature } from "./BpmnPluginsFeature";

const PLUGINS = "/work/.camunda/plugins";
const RESIZE = `${PLUGINS}/resize-tasks`;
const PALETTE = `${PLUGINS}/reduced-palette`;
const CACHE = "/storage/bpmn-plugins";

class InMemoryApprovals implements PluginApprovalStorePort {
    approvals: PluginApproval[] = [];

    read(): readonly PluginApproval[] {
        return this.approvals;
    }

    async write(approvals: readonly PluginApproval[]): Promise<void> {
        this.approvals = [...approvals];
    }
}

// Readable hashes keep the cache paths in the assertions legible.
const lengthHasher: ContentHasherPort = { sha256: (text) => `h${text.length}` };

const RESIZE_FILES = {
    [`${RESIZE}/index.js`]: "module.exports = { name: 'Resize Tasks', script: './client.js' };",
    [`${RESIZE}/client.js`]: "registerResize();",
};
const PALETTE_FILES = {
    [`${PALETTE}/plugin.json`]: '{ "name": "Reduced Palette", "script": "client.js", "style": "palette.css" }',
    [`${PALETTE}/client.js`]: "registerPalette();",
    [`${PALETTE}/palette.css`]: ".djs-palette {}",
};

function setUp(files: Record<string, string>, { promptAnswers = {} } = {}) {
    const host = createTestHost({ folders: ["/work"], files, promptAnswers });
    const approvals = new InMemoryApprovals();
    const feature = new BpmnPluginsFeature({
        ...host,
        artifacts: new ArtifactService(host.workspace, host.settings, host.notifier),
        approvals,
        cacheRoot: CACHE,
        hasher: lengthHasher,
    });
    const editor = host.openEditor("/work/order.bpmn");
    const requestPlugins = async () => {
        await feature.editorContribution.commandHandlers.GetBpmnPluginsCommand(
            new GetBpmnPluginsCommand(),
            editor.id,
        );
        await feature.service.whenApprovalSettled();
    };
    const answeredPlugins = () =>
        editor.postedOfType<BpmnPluginsQuery>("BpmnPluginsQuery").at(-1)?.plugins;
    return { host, approvals, editor, requestPlugins, answeredPlugins };
}

describe("BpmnPluginsFeature", () => {
    it("serves an approved plugin from a copy of the approved bytes", async () => {
        const { host, approvals, requestPlugins, answeredPlugins } = setUp(PALETTE_FILES);
        approvals.approvals = [{ pluginId: PALETTE, contentHash: "h34" }];

        await requestPlugins();

        expect(answeredPlugins()).toEqual([
            {
                name: "Reduced Palette",
                scriptUrl: `webview-resource:${CACHE}/h34/plugin.js`,
                styleUrl: `webview-resource:${CACHE}/h34/plugin.css`,
            },
        ]);
        expect(host.workspace.files.get(`${CACHE}/h34/plugin.js`)).toBe("registerPalette();");
        expect(host.workspace.files.get(`${CACHE}/h34/plugin.css`)).toBe(".djs-palette {}");
        expect(host.picker.prompts).toEqual([]);
    });

    it("opens the editor without an unapproved plugin, then asks and reloads with it", async () => {
        const { host, approvals, editor, requestPlugins, answeredPlugins } = setUp(RESIZE_FILES, {
            promptAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: [RESIZE] },
        });

        await requestPlugins();

        expect(answeredPlugins()).toEqual([]);
        expect(host.picker.prompts).toHaveLength(1);
        expect(approvals.approvals).toEqual([{ pluginId: RESIZE, contentHash: "h18" }]);
        expect(editor.reloadCount).toBe(1);
    });

    it("does not ask again in this session about a declined plugin", async () => {
        const { host, approvals, editor, requestPlugins } = setUp(RESIZE_FILES);

        await requestPlugins();
        await requestPlugins();

        expect(host.picker.prompts).toHaveLength(1);
        expect(approvals.approvals).toEqual([]);
        expect(editor.reloadCount).toBe(0);
    });

    it("leaves a plugin out once its code changed, and asks about it again", async () => {
        const { host, approvals, requestPlugins, answeredPlugins } = setUp(RESIZE_FILES);
        approvals.approvals = [{ pluginId: RESIZE, contentHash: "h18" }];
        await host.workspace.writeFile(`${RESIZE}/client.js`, "registerResize(); stealTokens();");

        await requestPlugins();

        expect(answeredPlugins()).toEqual([]);
        expect(host.picker.prompts).toHaveLength(1);
    });

    it("skips a plugin folder it cannot read and still serves the others", async () => {
        const { host, approvals, requestPlugins, answeredPlugins } = setUp({
            ...PALETTE_FILES,
            [`${PLUGINS}/broken/plugin.json`]: '{ "script": "../../escape.js" }',
        });
        approvals.approvals = [{ pluginId: PALETTE, contentHash: "h34" }];

        await requestPlugins();

        expect(answeredPlugins()?.map((plugin) => plugin.name)).toEqual(["Reduced Palette"]);
        expect(host.notifier.logs).toContainEqual({
            level: "warning",
            message: `Skipped BPMN plugin in ${PLUGINS}/broken: "../../escape.js" is not a path inside the plugin folder`,
        });
    });

    it("answers with no plugins at once on a host whose webview cannot load them", async () => {
        const { host, approvals, editor, requestPlugins, answeredPlugins } = setUp(PALETTE_FILES);
        approvals.approvals = [{ pluginId: PALETTE, contentHash: "h34" }];
        editor.servesNoFiles = true;

        await requestPlugins();

        expect(answeredPlugins()).toEqual([]);
        expect(host.picker.prompts).toEqual([]);
    });
});
