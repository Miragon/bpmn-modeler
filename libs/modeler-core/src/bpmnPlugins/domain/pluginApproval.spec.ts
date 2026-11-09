import { describe, expect, it } from "vitest";

import { type CodeApproval } from "../../kernel/domain/codeApproval";
import { type DirectoryEntryKind } from "../../kernel/domain/directoryEntry";
import {
    approvedContent,
    cacheEntriesToPrune,
    CACHED_PLUGIN_FILE_PATTERN,
    cachedPluginCopy,
    cachedPluginFiles,
    type CachedPluginFiles,
    isWholeCachedCopy,
    type PendingApproval,
    PLUGIN_APPROVAL_NOTICE_ID,
    PLUGIN_APPROVAL_PROMPT_ID,
    pluginApprovalNotice,
    pluginApprovalPrompt,
    PLUGIN_CONTENT_HASH_PATTERN,
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

describe("pluginApprovalPrompt", () => {
    it("lists each plugin with why it is asked and its folder in the workspace", () => {
        expect(
            pluginApprovalPrompt(
                [
                    { artifact: resize, state: "new" },
                    { artifact: palette, state: "changed" },
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
            const [item] = pluginApprovalPrompt([{ artifact: resize, state }], ["/repo"]).items;

            expect(item?.path).toBeUndefined();
            expect(item?.description?.startsWith(shown)).toBe(true);
        },
    );
});

describe("cachedPluginFiles", () => {
    it("addresses the approved copy by its content, so changed files never reuse it", () => {
        expect(cachedPluginFiles("/storage/bpmn-plugins", palette)).toEqual({
            script: "/storage/bpmn-plugins/bbb/plugin.js",
            style: "/storage/bpmn-plugins/bbb/plugin.css",
        });
        expect(cachedPluginFiles("/storage/bpmn-plugins", resize)).toEqual({
            script: "/storage/bpmn-plugins/aaa/plugin.js",
        });
    });
});

describe("cachedPluginCopy", () => {
    const withStyle = cachedPluginFiles("/storage", palette);
    const scriptOnly = cachedPluginFiles("/storage", resize);

    it.each<{
        case: string;
        files: CachedPluginFiles;
        style: string | undefined;
        copy: { path: string; content: string }[];
    }>([
        {
            case: "a plugin with a style",
            files: withStyle,
            style: ".palette {}",
            copy: [
                { path: "/storage/bbb/plugin.js", content: "client();" },
                { path: "/storage/bbb/plugin.css", content: ".palette {}" },
            ],
        },
        {
            case: "a plugin without a style",
            files: scriptOnly,
            style: undefined,
            copy: [{ path: "/storage/aaa/plugin.js", content: "client();" }],
        },
        {
            case: "a style file with no text read for it",
            files: withStyle,
            style: undefined,
            copy: [{ path: "/storage/bbb/plugin.js", content: "client();" }],
        },
        {
            case: "a style text with no style file",
            files: scriptOnly,
            style: ".palette {}",
            copy: [{ path: "/storage/aaa/plugin.js", content: "client();" }],
        },
    ])("pairs each file with the approved bytes it must hold: $case", ({ files, style, copy }) => {
        expect(cachedPluginCopy(files, "client();", style)).toEqual(copy);
    });
});

describe("pluginApprovalNotice", () => {
    const pendingOf = (count: number): PendingApproval[] =>
        Array.from({ length: count }, (_, index) => ({
            artifact: { ...resize, id: `${resize.id}-${index}` },
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

describe("approvedContent", () => {
    it.each<{
        case: string;
        one: [script: string, style: string | undefined];
        other: [script: string, style: string | undefined];
    }>([
        {
            case: "the style's text moved into the script",
            one: ["ab", undefined],
            other: ["a", "b"],
        },
        { case: "a style added", one: ["a", undefined], other: ["a", "x"] },
        { case: "an empty style added", one: ["a", undefined], other: ["a", ""] },
        {
            case: "bytes moved across a NUL in the texts",
            one: ["benign //", "\nevil()\u0000body{}"],
            other: ["benign //\u0000\nevil()", "body{}"],
        },
        {
            case: "bytes moved across a newline in the texts",
            one: ["a\n", "b"],
            other: ["a", "\nb"],
        },
        {
            case: "a script that spells out a length prefix",
            one: ["1:a", undefined],
            other: ["1", "a"],
        },
        { case: "two empty texts and none", one: ["", ""], other: ["", undefined] },
    ])("never covers two plugins with one content: $case", ({ one, other }) => {
        expect(approvedContent(...one)).not.toBe(approvedContent(...other));
    });

    it("covers the same files with the same content", () => {
        expect(approvedContent("a", "b")).toBe(approvedContent("a", "b"));
    });
});

describe("cacheEntriesToPrune", () => {
    const named = "a".repeat(64);
    const unnamed = "b".repeat(64);
    const elsewhere = "c".repeat(64);
    const stored: CodeApproval[] = [
        { pluginId: resize.id, contentHash: named },
        { pluginId: "/other-repo/.camunda/plugins/resize-tasks", contentHash: elsewhere },
        {
            pluginId: "/repo/node_modules/bpmnlint-plugin-acme",
            contentHash: `bpmnlint-closure-v1:${unnamed}`,
        },
    ];

    it.each<{ case: string; entry: [string, DirectoryEntryKind]; pruned: boolean }>([
        { case: "a copy no stored row names", entry: [unnamed, "directory"], pruned: true },
        {
            case: "a copy a row of this workspace names",
            entry: [named, "directory"],
            pruned: false,
        },
        {
            case: "a copy a row of another workspace names",
            entry: [elsewhere, "directory"],
            pruned: false,
        },
        { case: "a file named like a copy", entry: ["d".repeat(64), "file"], pruned: false },
        { case: "an upper-case hash", entry: ["D".repeat(64), "directory"], pruned: false },
        { case: "a hash one digit short", entry: ["d".repeat(63), "directory"], pruned: false },
        { case: "a hash one digit long", entry: ["d".repeat(65), "directory"], pruned: false },
        { case: "a folder of another name", entry: ["notes", "directory"], pruned: false },
        {
            case: "a hash with a suffix",
            entry: [`${"d".repeat(64)}.old`, "directory"],
            pruned: false,
        },
    ])("prunes $case: $pruned", ({ entry, pruned }) => {
        expect(cacheEntriesToPrune([entry], stored)).toEqual(pruned ? [entry[0]] : []);
    });

    it("keeps a copy a rule package row only resembles, and prunes each unnamed copy in order", () => {
        const other = "e".repeat(64);

        expect(
            cacheEntriesToPrune(
                [
                    [other, "directory"],
                    [named, "directory"],
                    [unnamed, "directory"],
                ],
                stored,
            ),
        ).toEqual([other, unnamed]);
    });

    it("spells a content hash as the copy folder's name", () => {
        expect(cachedPluginFiles("/cache", { ...resize, contentHash: named }).script).toMatch(
            new RegExp(`^/cache/${PLUGIN_CONTENT_HASH_PATTERN}/`),
        );
    });

    it("names each copy file as a cache path a page may load", () => {
        const files = cachedPluginFiles("/cache", {
            ...resize,
            stylePath: "/repo/.camunda/plugins/resize-tasks/style.css",
            contentHash: named,
        });
        const loadable = new RegExp(`^/cache/${CACHED_PLUGIN_FILE_PATTERN}$`);

        expect(files.script).toMatch(loadable);
        expect(files.style).toMatch(loadable);
        expect(`/cache/${named}/plugin.json`).not.toMatch(loadable);
    });
});

describe("isWholeCachedCopy", () => {
    it.each<{
        case: string;
        plugin: WorkspacePlugin;
        entries: [string, DirectoryEntryKind][];
        whole: boolean;
    }>([
        { case: "a script copy", plugin: resize, entries: [["plugin.js", "file"]], whole: true },
        { case: "no script copy", plugin: resize, entries: [["plugin.css", "file"]], whole: false },
        {
            case: "a script that is a folder",
            plugin: resize,
            entries: [["plugin.js", "directory"]],
            whole: false,
        },
        {
            case: "a script and a style copy",
            plugin: palette,
            entries: [
                ["plugin.js", "file"],
                ["plugin.css", "file"],
            ],
            whole: true,
        },
        {
            case: "a styled plugin's script alone",
            plugin: palette,
            entries: [["plugin.js", "file"]],
            whole: false,
        },
    ])("is $whole for $case", ({ plugin, entries, whole }) => {
        expect(isWholeCachedCopy(plugin, entries)).toBe(whole);
    });
});
