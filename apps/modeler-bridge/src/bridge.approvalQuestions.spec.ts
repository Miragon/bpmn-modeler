/**
 * The bridge asks about workspace bpmn-js plugins and bpmnlint rule packages
 * through one question queue and one approval list: the host shows one notice
 * at a time, and the second answer's `pluginApprovals/save` keeps the row the
 * first one saved, since the host replaces its list with every save.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hostNotification, settle } from "./__fixtures__/bridgeHarness";
import {
    ACME_NOTICE_MESSAGE,
    AcmeBridge,
    createAcmeWorkspace,
    isRequest,
    lintOnHost,
    nextLintResults,
    openAcmeBridge,
    reviewAndAllowAll,
    waitForNotice,
} from "./__fixtures__/rulePackageBridge";

const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
    for (const dispose of disposals.splice(0)) {
        await dispose();
    }
});

async function workspaceWithPluginAndRulePackage(): Promise<{
    bridge: AcmeBridge;
    pluginId: string;
}> {
    const root = await createAcmeWorkspace();
    const pluginId = join(root, ".camunda", "plugins", "resize-tasks");
    await fs.mkdir(pluginId, { recursive: true });
    await fs.writeFile(
        join(pluginId, "plugin.json"),
        JSON.stringify({ name: "Resize Tasks", script: "client.js" }),
    );
    await fs.writeFile(join(pluginId, "client.js"), "window.registerResize = true;");
    const pluginCacheRoot = await fs.mkdtemp(join(tmpdir(), "bridge-approval-cache-"));
    const bridge = await openAcmeBridge(root, { pluginCacheRoot });
    disposals.push(async () => {
        await bridge.dispose();
        await fs.rm(pluginCacheRoot, { recursive: true, force: true });
    });
    return { bridge, pluginId };
}

async function requestPlugins({ rpc, editorId }: AcmeBridge): Promise<void> {
    await rpc.handleLine(
        hostNotification("webview/message", {
            editorId,
            sessionId: 1,
            message: { type: "GetBpmnPluginsCommand" },
        }),
    );
}

describe("bridge approval questions", () => {
    it("asks about a rule package only after the open plugin question, and keeps both answers", async () => {
        const { bridge, pluginId } = await workspaceWithPluginAndRulePackage();
        await requestPlugins(bridge);
        const pluginNotice = await waitForNotice(bridge);
        await lintOnHost(bridge);
        await settle();
        expect(bridge.frames.filter(isRequest("actionNotice/show"))).toHaveLength(1);

        const afterPluginNotice = bridge.frames.length;
        const pluginRows = await reviewAndAllowAll(bridge, pluginNotice);
        const rulePackageNotice = await waitForNotice(bridge, afterPluginNotice);
        const relintFrom = bridge.frames.length;
        const allRows = await reviewAndAllowAll(bridge, rulePackageNotice);
        await nextLintResults(bridge, relintFrom);

        expect(pluginNotice.params.message).not.toBe(ACME_NOTICE_MESSAGE);
        expect(rulePackageNotice.params.message).toBe(ACME_NOTICE_MESSAGE);
        expect(pluginRows.map((row) => row.pluginId)).toEqual([pluginId]);
        expect(allRows.map((row) => row.pluginId)).toEqual([pluginId, bridge.acmeDir]);
    });
});
