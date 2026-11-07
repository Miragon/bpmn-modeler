import { describe, expect, it } from "vitest";

import {
    approvalOutcome,
    approvalsAllowing,
    approvalStateOf,
    approvedPlugins,
    cachedPluginFiles,
    holdsCachedPluginFiles,
    type PendingApproval,
    pendingApprovals,
    PLUGIN_APPROVAL_NOTICE_ID,
    PLUGIN_APPROVAL_PROMPT_ID,
    pluginApprovalNotice,
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
    it("lists each plugin with why it is asked and its folder in the workspace", () => {
        expect(
            pluginApprovalPrompt(
                [
                    { plugin: resize, state: "new" },
                    { plugin: palette, state: "changed" },
                ],
                ["/repo"],
            ),
        ).toEqual({
            id: PLUGIN_APPROVAL_PROMPT_ID,
            title: "Allow BPMN plugins from this workspace?",
            placeholder:
                "Plugins run their own code in the BPMN editor. Check only the ones you trust; open editors reload with them.",
            items: [
                {
                    label: "Resize Tasks",
                    description: "new · .camunda/plugins/resize-tasks",
                    value: resize.id,
                },
                {
                    label: "Reduced Palette",
                    description: "changed since you allowed it · .camunda/plugins/reduced-palette",
                    value: palette.id,
                },
            ],
        });
    });

    it.each<{ case: string; state: PendingApproval["state"]; shown: string }>([
        { case: "a new plugin", state: "new", shown: "new" },
        { case: "a changed plugin", state: "changed", shown: "changed since you allowed it" },
    ])(
        "shows the state of $case in the text every host renders, not a path that replaces it",
        ({ state, shown }) => {
            const [item] = pluginApprovalPrompt([{ plugin: resize, state }], ["/repo"]).items;

            expect(item?.path).toBeUndefined();
            expect(item?.description?.startsWith(shown)).toBe(true);
        },
    );
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

describe("holdsCachedPluginFiles", () => {
    const withStyle = cachedPluginFiles("/storage", palette);
    const scriptOnly = cachedPluginFiles("/storage", resize);

    it.each<{
        case: string;
        entries: [name: string, type: string][];
        files: typeof withStyle;
        holds: boolean;
    }>([
        {
            case: "a script-only copy with its script",
            entries: [["plugin.js", "file"]],
            files: scriptOnly,
            holds: true,
        },
        {
            case: "a copy with script and style",
            entries: [
                ["plugin.css", "file"],
                ["plugin.js", "file"],
            ],
            files: withStyle,
            holds: true,
        },
        {
            case: "a copy whose style is missing, after an interrupted write",
            entries: [["plugin.js", "file"]],
            files: withStyle,
            holds: false,
        },
        {
            case: "a copy whose script is missing",
            entries: [["plugin.css", "file"]],
            files: withStyle,
            holds: false,
        },
        {
            case: "a directory named like the script",
            entries: [["plugin.js", "directory"]],
            files: scriptOnly,
            holds: false,
        },
        { case: "an empty directory", entries: [], files: scriptOnly, holds: false },
    ])("is $holds for $case", ({ entries, files, holds }) => {
        expect(holdsCachedPluginFiles(entries, files)).toBe(holds);
    });
});

describe("pluginApprovalNotice", () => {
    const pendingOf = (count: number): PendingApproval[] =>
        Array.from({ length: count }, (_, index) => ({
            plugin: { ...resize, id: `${resize.id}-${index}` },
            state: "new" as const,
        }));

    it.each([
        { count: 1, message: "1 BPMN plugin in this workspace is not allowed yet." },
        { count: 2, message: "2 BPMN plugins in this workspace are not allowed yet." },
        { count: 5, message: "5 BPMN plugins in this workspace are not allowed yet." },
    ])("counts $count pending plugin(s) and offers only the review", ({ count, message }) => {
        expect(pluginApprovalNotice(pendingOf(count))).toEqual({
            id: PLUGIN_APPROVAL_NOTICE_ID,
            tone: "info",
            message,
            actions: [{ label: "Review…", value: "review" }],
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
