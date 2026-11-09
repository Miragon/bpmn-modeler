import { describe, expect, it, vi } from "vitest";

import { ArtifactService } from "../../kernel/service/ArtifactService";
import { createTestHost, fingerprintHasher } from "../../testing";
import { approvedContent } from "../domain/pluginApproval";
import { PluginCatalog } from "./PluginCatalog";
import { WorkspacePluginLocator } from "./WorkspacePluginLocator";

const PLUGINS = "/work/.camunda/plugins";
const RESIZE = `${PLUGINS}/resize-tasks`;
const PALETTE = `${PLUGINS}/reduced-palette`;
const DOCUMENT = "/work/order.bpmn";

const hashOf = (script: string) => fingerprintHasher.sha256(approvedContent(script, undefined));

function setUp() {
    const host = createTestHost({
        folders: ["/work"],
        files: {
            [`${RESIZE}/plugin.json`]: '{ "name": "Resize Tasks", "script": "client.js" }',
            [`${RESIZE}/client.js`]: "registerResize();",
            [`${PALETTE}/plugin.json`]: '{ "name": "Reduced Palette", "script": "client.js" }',
            [`${PALETTE}/client.js`]: "registerPalette();",
        },
    });
    const locator = new WorkspacePluginLocator(
        new ArtifactService(host.workspace, host.settings, host.notifier),
        host.workspace,
        fingerprintHasher,
        host.notifier,
    );
    const catalog = new PluginCatalog(locator, host.pluginApprovals, host.notifier);
    return { host, catalog };
}

describe("PluginCatalog", () => {
    it("separates the plugins a document may load, with their bytes, from those to ask about", async () => {
        const { host, catalog } = setUp();
        host.pluginApprovals.approvals = [
            { pluginId: PALETTE, contentHash: hashOf("registerPalette();") },
        ];

        const { approved, pending } = await catalog.pluginsFor(DOCUMENT);

        expect(approved.map(({ plugin, script }) => ({ id: plugin.id, script }))).toEqual([
            { id: PALETTE, script: "registerPalette();" },
        ]);
        expect(pending.map(({ artifact, state }) => ({ id: artifact.id, state }))).toEqual([
            { id: RESIZE, state: "new" },
        ]);
    });

    it("keeps the checked plugins allowed and stops asking about the others", async () => {
        const { host, catalog } = setUp();
        const { pending } = await catalog.pluginsFor(DOCUMENT);

        const allowed = await catalog.applyAnswer(pending, { kind: "checked", ids: [RESIZE] });

        expect(allowed.map((plugin) => plugin.id)).toEqual([RESIZE]);
        expect(host.pluginApprovals.approvals).toEqual([
            { pluginId: RESIZE, contentHash: hashOf("registerResize();") },
        ]);
        const after = await catalog.pluginsFor(DOCUMENT);
        expect(after.approved.map(({ plugin }) => plugin.id)).toEqual([RESIZE]);
        expect(after.pending).toEqual([]);
        expect(catalog.stillPendingOf(pending)).toEqual([]);
    });

    it("asks again about a declined plugin once its content changed", async () => {
        const { host, catalog } = setUp();
        await catalog.applyAnswer((await catalog.pluginsFor(DOCUMENT)).pending, {
            kind: "checked",
            ids: [],
        });

        await host.workspace.writeFile(`${RESIZE}/client.js`, "registerResizE();");

        const { pending } = await catalog.pluginsFor(DOCUMENT);
        expect(pending.map(({ artifact }) => artifact.id)).toEqual([RESIZE]);
    });

    it("offers no plugins and logs why when the plugin folders cannot be read", async () => {
        const { host, catalog } = setUp();
        vi.spyOn(host.workspace, "readDirectory").mockRejectedValueOnce(new Error("EACCES"));

        const selection = await catalog.pluginsFor(DOCUMENT);

        expect(selection).toEqual({ approved: [], pending: [] });
        expect(host.notifier.loggedErrors.map((error) => error.message)).toEqual(["EACCES"]);
    });
});
