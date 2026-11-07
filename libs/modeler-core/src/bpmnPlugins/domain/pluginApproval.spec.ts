import { describe, expect, it } from "vitest";

import {
    approvalOutcome,
    approvalsAllowing,
    approvalStateOf,
    approvedPlugins,
    cachedPluginFiles,
    pendingApprovals,
    PLUGIN_APPROVAL_PROMPT_ID,
    pluginApprovalPrompt,
    type PluginApproval,
    type PluginApprovalState,
    type WorkspacePlugin,
} from "./pluginApproval";

const resize: WorkspacePlugin = {
    id: "/repo/.camunda/plugins/resize-tasks",
    name: "Resize Tasks",
    scriptPath: "/repo/.camunda/plugins/resize-tasks/client.js",
    contentHash: "aaa",
};
const palette: WorkspacePlugin = {
    id: "/repo/.camunda/plugins/reduced-palette",
    name: "Reduced Palette",
    scriptPath: "/repo/.camunda/plugins/reduced-palette/client.js",
    stylePath: "/repo/.camunda/plugins/reduced-palette/style.css",
    contentHash: "bbb",
};

describe("approvalStateOf", () => {
    it.each<{ case: string; approvals: PluginApproval[]; state: PluginApprovalState }>([
        { case: "no approval", approvals: [], state: "new" },
        {
            case: "an approval of this content",
            approvals: [{ pluginId: resize.id, contentHash: "aaa" }],
            state: "approved",
        },
        {
            case: "an approval of other content, after a pull or an update",
            approvals: [{ pluginId: resize.id, contentHash: "old" }],
            state: "changed",
        },
        {
            case: "an approval of the same content in another folder",
            approvals: [{ pluginId: "/elsewhere/resize-tasks", contentHash: "aaa" }],
            state: "new",
        },
    ])("is $state with $case", ({ approvals, state }) => {
        expect(approvalStateOf(resize, approvals)).toBe(state);
    });
});

describe("approvalsAllowing", () => {
    it("replaces the approval of a changed plugin and keeps the others", () => {
        const approvals: PluginApproval[] = [
            { pluginId: resize.id, contentHash: "old" },
            { pluginId: "/other", contentHash: "ccc" },
        ];

        expect(approvalsAllowing(approvals, [resize])).toEqual([
            { pluginId: "/other", contentHash: "ccc" },
            { pluginId: resize.id, contentHash: "aaa" },
        ]);
    });
});

describe("pendingApprovals", () => {
    it("asks about new and changed plugins, except those declined in this session", () => {
        const approvals: PluginApproval[] = [{ pluginId: resize.id, contentHash: "old" }];
        const declined = new Set([`${palette.id}#bbb`]);

        expect(pendingApprovals([resize, palette], approvals, declined)).toEqual([
            { plugin: resize, state: "changed" },
        ]);
    });

    it("asks again once a declined plugin changes", () => {
        const declined = new Set([`${palette.id}#old`]);

        expect(pendingApprovals([palette], [], declined)).toEqual([
            { plugin: palette, state: "new" },
        ]);
    });
});

describe("pluginApprovalPrompt", () => {
    it("lists each plugin with why it is asked and where it lives", () => {
        expect(
            pluginApprovalPrompt([
                { plugin: resize, state: "new" },
                { plugin: palette, state: "changed" },
            ]),
        ).toEqual({
            id: PLUGIN_APPROVAL_PROMPT_ID,
            title: "Allow BPMN plugins from this workspace?",
            placeholder:
                "Plugins run their own code in the BPMN editor. Check only the ones you trust; the editor reloads with them.",
            items: [
                { label: "Resize Tasks", description: "new", path: resize.id, value: resize.id },
                {
                    label: "Reduced Palette",
                    description: "changed since you allowed it",
                    path: palette.id,
                    value: palette.id,
                },
            ],
        });
    });
});

describe("cachedPluginFiles", () => {
    it("addresses the approved copy by its content, so changed files never reuse it", () => {
        expect(cachedPluginFiles("/storage/bpmn-plugins", palette)).toEqual({
            directory: "/storage/bpmn-plugins/bbb",
            script: "/storage/bpmn-plugins/bbb/plugin.js",
            style: "/storage/bpmn-plugins/bbb/plugin.css",
        });
        expect(cachedPluginFiles("/storage/bpmn-plugins", resize)).toEqual({
            directory: "/storage/bpmn-plugins/aaa",
            script: "/storage/bpmn-plugins/aaa/plugin.js",
        });
    });
});

describe("approvedPlugins", () => {
    it("keeps only the plugins whose current content the user allowed", () => {
        const approvals: PluginApproval[] = [
            { pluginId: resize.id, contentHash: "aaa" },
            { pluginId: palette.id, contentHash: "old" },
        ];

        expect(approvedPlugins([resize, palette], approvals)).toEqual([resize]);
    });
});

describe("approvalOutcome", () => {
    it("allows the checked plugins and declines the rest for this session", () => {
        const pending = [
            { plugin: resize, state: "new" as const },
            { plugin: palette, state: "changed" as const },
        ];

        expect(approvalOutcome(pending, [palette.id])).toEqual({
            allowed: [palette],
            declineKeys: [`${resize.id}#aaa`],
        });
    });
});
