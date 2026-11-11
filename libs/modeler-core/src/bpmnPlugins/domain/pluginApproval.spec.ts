import { describe, expect, it } from "vitest";

import { type Allowance, allowanceRowOf } from "../../kernel/domain/allowance";
import { type CodeApproval, PROCESS_RESTARTS } from "../../kernel/domain/codeApproval";
import { type DirectoryEntryKind } from "../../kernel/domain/directoryEntry";
import {
    approvedContent,
    CACHED_PLUGIN_FILE_PATTERN,
    cachedCopyNames,
    cachedPluginCopy,
    cachedPluginFiles,
    type CachedPluginFiles,
    contentServedByEditors,
    editorsToReload,
    isWholeCachedCopy,
    lastUseMarkerOf,
    type OfferedPlugins,
    PLUGIN_APPROVAL_NOTICE_ID,
    PLUGIN_APPROVAL_PROMPT_ID,
    pluginApprovalNotice,
    pluginApprovalPrompt,
    PLUGIN_CODE_TEXTS,
    PLUGIN_CONTENT_HASH_PATTERN,
    type WorkspacePlugin,
} from "./pluginApproval";

const repositoryAllowance = (addOn: string): Allowance => ({
    kind: "plugin",
    host: "",
    origin: { kind: "repository", path: "/repo/.git" },
    addOn,
});

const resize: WorkspacePlugin = {
    id: "/repo/.camunda/plugins/resize-tasks",
    name: "Resize Tasks",
    allowance: repositoryAllowance(".camunda/plugins/resize-tasks"),
    scriptPath: "/repo/.camunda/plugins/resize-tasks/client.js",
    contentHash: "aaa",
};
const palette: WorkspacePlugin = {
    id: "/repo/.camunda/plugins/reduced-palette",
    name: "Reduced Palette",
    allowance: repositoryAllowance(".camunda/plugins/reduced-palette"),
    scriptPath: "/repo/.camunda/plugins/reduced-palette/client.js",
    stylePath: "/repo/.camunda/plugins/reduced-palette/style.css",
    contentHash: "bbb",
};

describe("PLUGIN_CODE_TEXTS", () => {
    it.each(PROCESS_RESTARTS)(
        "says open editors reload without a revoked plugin, for %s",
        (restart) => {
            expect(PLUGIN_CODE_TEXTS.revokedFollowUp(restart)).toBe(
                "Open editors reload without it.",
            );
        },
    );
});

describe("pluginApprovalPrompt", () => {
    it("lists each plugin by its name and its folder in the workspace", () => {
        expect(pluginApprovalPrompt([resize, palette], ["/repo"])).toEqual({
            id: PLUGIN_APPROVAL_PROMPT_ID,
            title: "Allow BPMN plugins from this workspace?",
            placeholder:
                "Plugins run their own code in the BPMN editor. Allowing one covers it in every worktree of its repository, or in its folder outside a repository, later changes included. Check only the ones you trust; open editors reload with them.",
            items: [
                {
                    label: "Resize Tasks",
                    description: ".camunda/plugins/resize-tasks",
                    value: resize.id,
                },
                {
                    label: "Reduced Palette",
                    description: ".camunda/plugins/reduced-palette",
                    value: palette.id,
                },
            ],
        });
    });

    it("shows the folder in the text every host renders, not a path that replaces it", () => {
        const [item] = pluginApprovalPrompt([resize], ["/elsewhere"]).items;

        expect(item?.path).toBeUndefined();
        expect(item?.description).toBe(resize.id);
    });
});

describe("cachedPluginFiles", () => {
    it("addresses the approved copy by its content, so changed files never reuse it", () => {
        expect(cachedPluginFiles("/storage/bpmn-plugins", palette)).toEqual({
            script: "/storage/bpmn-plugins/bbb/plugin.js",
            style: "/storage/bpmn-plugins/bbb/plugin.css",
            lastUse: "/storage/bpmn-plugins/bbb/last-used",
        });
        expect(cachedPluginFiles("/storage/bpmn-plugins", resize)).toEqual({
            script: "/storage/bpmn-plugins/aaa/plugin.js",
            lastUse: "/storage/bpmn-plugins/aaa/last-used",
        });
    });
});

describe("lastUseMarkerOf", () => {
    it("names the marker of a copy folder found in the cache, as a copy of that hash writes it", () => {
        expect(lastUseMarkerOf("/storage/bpmn-plugins", "aaa")).toBe(
            cachedPluginFiles("/storage/bpmn-plugins", resize).lastUse,
        );
    });
});

describe("cachedPluginCopy", () => {
    const withStyle = cachedPluginFiles("/storage", palette);
    const scriptOnly = cachedPluginFiles("/storage", resize);
    const NOW = 1794355200000;

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
                { path: "/storage/bbb/last-used", content: "1794355200000" },
                { path: "/storage/bbb/plugin.js", content: "client();" },
                { path: "/storage/bbb/plugin.css", content: ".palette {}" },
            ],
        },
        {
            case: "a plugin without a style",
            files: scriptOnly,
            style: undefined,
            copy: [
                { path: "/storage/aaa/last-used", content: "1794355200000" },
                { path: "/storage/aaa/plugin.js", content: "client();" },
            ],
        },
        {
            case: "a style file with no text read for it",
            files: withStyle,
            style: undefined,
            copy: [
                { path: "/storage/bbb/last-used", content: "1794355200000" },
                { path: "/storage/bbb/plugin.js", content: "client();" },
            ],
        },
        {
            case: "a style text with no style file",
            files: scriptOnly,
            style: ".palette {}",
            copy: [
                { path: "/storage/aaa/last-used", content: "1794355200000" },
                { path: "/storage/aaa/plugin.js", content: "client();" },
            ],
        },
    ])(
        "pairs each file with the bytes it must hold, the last use first so no whole copy lacks it: $case",
        ({ files, style, copy }) => {
            expect(cachedPluginCopy(files, "client();", style, NOW)).toEqual(copy);
        },
    );
});

describe("pluginApprovalNotice", () => {
    const pendingOf = (count: number): WorkspacePlugin[] =>
        Array.from({ length: count }, (_, index) => ({ ...resize, id: `${resize.id}-${index}` }));

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

describe("editorsToReload", () => {
    const offered = new Map<string, OfferedPlugins>([
        ["file:///repo/a.bpmn", { served: [resize], withheld: [palette] }],
        ["file:///repo/b.bpmn", { served: [], withheld: [palette] }],
        ["file:///repo/c.bpmn", { served: [resize], withheld: [] }],
        ["file:///other/d.bpmn", { served: [], withheld: [] }],
    ]);
    const allowanceOfPlugin = ({ allowance }: WorkspacePlugin) => allowanceRowOf(allowance);
    const contentRowAt = (pluginId: string): CodeApproval => ({
        pluginId,
        contentHash: "0".repeat(64),
    });

    it.each<{ case: string; approvals: CodeApproval[]; editors: string[] }>([
        {
            case: "none while every served plugin stays allowed and nothing withheld is, as after the migration",
            approvals: [allowanceOfPlugin(resize)],
            editors: [],
        },
        {
            case: "the editors that load a revoked plugin",
            approvals: [],
            editors: ["file:///repo/a.bpmn", "file:///repo/c.bpmn"],
        },
        {
            case: "none while a row pinned to other content still allows a served plugin's place",
            approvals: [contentRowAt(resize.id)],
            editors: [],
        },
        {
            case: "the editors that load a plugin whose content is allowed only in another folder",
            approvals: [contentRowAt("/worktree/.camunda/plugins/resize-tasks")],
            editors: ["file:///repo/a.bpmn", "file:///repo/c.bpmn"],
        },
        {
            case: "each editor once that was withheld a plugin allowed in another worktree",
            approvals: [
                allowanceOfPlugin(resize),
                allowanceOfPlugin({ ...palette, id: "/worktree/.camunda/plugins/reduced-palette" }),
            ],
            editors: ["file:///repo/a.bpmn", "file:///repo/b.bpmn"],
        },
        {
            case: "none for a withheld plugin whose add-on is allowed in another repository",
            approvals: [
                allowanceOfPlugin(resize),
                allowanceRowOf({
                    ...palette.allowance,
                    origin: { kind: "repository", path: "/clone/.git" },
                }),
            ],
            editors: [],
        },
        {
            case: "none for a row of a plugin no editor was offered",
            approvals: [allowanceOfPlugin(resize), contentRowAt("/x")],
            editors: [],
        },
    ])("returns $case", ({ approvals, editors }) => {
        expect(editorsToReload(offered, approvals)).toEqual(editors);
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

describe("cachedCopyNames", () => {
    const copy = "a".repeat(64);

    it.each<{ case: string; entry: [string, DirectoryEntryKind]; copy: boolean }>([
        { case: "a folder named like a content hash", entry: [copy, "directory"], copy: true },
        { case: "a file named like a copy", entry: ["d".repeat(64), "file"], copy: false },
        { case: "an upper-case hash", entry: ["D".repeat(64), "directory"], copy: false },
        { case: "a hash one digit short", entry: ["d".repeat(63), "directory"], copy: false },
        { case: "a hash one digit long", entry: ["d".repeat(65), "directory"], copy: false },
        { case: "a folder of another name", entry: ["notes", "directory"], copy: false },
        {
            case: "a hash with a suffix",
            entry: [`${"d".repeat(64)}.old`, "directory"],
            copy: false,
        },
        {
            case: "a hash with a prefix",
            entry: [`old.${"d".repeat(64)}`, "directory"],
            copy: false,
        },
    ])("counts $case as a copy: $copy", ({ entry, copy: isCopy }) => {
        expect(cachedCopyNames([entry])).toEqual(isCopy ? [entry[0]] : []);
    });

    it("lists every copy in the folder's order", () => {
        const other = "e".repeat(64);

        expect(
            cachedCopyNames([
                [other, "directory"],
                ["notes", "directory"],
                [copy, "directory"],
            ]),
        ).toEqual([other, copy]);
    });

    it("spells a content hash as the copy folder's name", () => {
        expect(cachedPluginFiles("/cache", { ...resize, contentHash: copy }).script).toMatch(
            new RegExp(`^/cache/${PLUGIN_CONTENT_HASH_PATTERN}/`),
        );
    });

    it("names each copy file as a cache path a page may load, and the last use as none", () => {
        const files = cachedPluginFiles("/cache", {
            ...resize,
            stylePath: "/repo/.camunda/plugins/resize-tasks/style.css",
            contentHash: copy,
        });
        const loadable = new RegExp(`^/cache/${CACHED_PLUGIN_FILE_PATTERN}$`);

        expect(files.script).toMatch(loadable);
        expect(files.style).toMatch(loadable);
        expect(files.lastUse).not.toMatch(loadable);
        expect(`/cache/${copy}/plugin.json`).not.toMatch(loadable);
    });
});

describe("contentServedByEditors", () => {
    it.each<{ case: string; offered: [string, OfferedPlugins][]; served: string[] }>([
        { case: "no open editor", offered: [], served: [] },
        {
            case: "an editor served nothing",
            offered: [["file:///repo/a.bpmn", { served: [], withheld: [resize] }]],
            served: [],
        },
        {
            case: "every editor's served content, each once",
            offered: [
                ["file:///repo/a.bpmn", { served: [resize, palette], withheld: [] }],
                ["file:///repo/b.bpmn", { served: [resize], withheld: [] }],
            ],
            served: ["aaa", "bbb"],
        },
        {
            case: "no withheld content",
            offered: [["file:///repo/a.bpmn", { served: [resize], withheld: [palette] }]],
            served: ["aaa"],
        },
    ])("holds $case", ({ offered, served }) => {
        expect([...contentServedByEditors(new Map(offered))].sort()).toEqual(served);
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
