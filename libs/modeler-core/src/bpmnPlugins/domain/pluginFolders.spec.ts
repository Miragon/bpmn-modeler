import { describe, expect, it } from "vitest";

import { type CodeApproval } from "../../kernel/domain/codeApproval";
import {
    editorsToReload,
    isPluginFolderName,
    type OfferedPlugins,
    pluginFolderChangedBy,
    type PluginFolderChange,
} from "./pluginFolders";

const PLUGINS = "/repo/.camunda/plugins";

describe("pluginFolderChangedBy", () => {
    it.each<{ case: string; path: string; change: PluginFolderChange }>([
        {
            case: "a file in a plugin folder",
            path: `${PLUGINS}/resize/client.js`,
            change: { kind: "folder", folder: `${PLUGINS}/resize` },
        },
        {
            case: "a file nested deeper in a plugin folder",
            path: `${PLUGINS}/resize/dist/assets/client.js`,
            change: { kind: "folder", folder: `${PLUGINS}/resize` },
        },
        {
            case: "a plugin folder moved in or out as a whole",
            path: `${PLUGINS}/resize`,
            change: { kind: "folder", folder: `${PLUGINS}/resize` },
        },
        {
            case: "the plugins folder itself",
            path: PLUGINS,
            change: { kind: "everyFolder" },
        },
        {
            case: "a path outside the plugins folder",
            path: "/repo/.camunda/element-templates/a.json",
            change: { kind: "none" },
        },
        {
            case: "a sibling whose name starts like the plugins folder",
            path: `${PLUGINS}-old/resize/client.js`,
            change: { kind: "none" },
        },
    ])("names $case", ({ path, change }) => {
        expect(pluginFolderChangedBy(path, PLUGINS)).toEqual(change);
    });
});

describe("editorsToReload", () => {
    const resize = { id: `${PLUGINS}/resize`, name: "Resize", contentHash: "r1" };
    const palette = { id: `${PLUGINS}/palette`, name: "Palette", contentHash: "p1" };
    const offered = new Map<string, OfferedPlugins>([
        ["file:///repo/a.bpmn", { served: [resize], withheld: [palette] }],
        ["file:///repo/b.bpmn", { served: [], withheld: [palette] }],
        ["file:///repo/c.bpmn", { served: [resize], withheld: [] }],
        ["file:///other/d.bpmn", { served: [], withheld: [] }],
    ]);
    const row = ({ id, contentHash }: typeof resize) => ({ pluginId: id, contentHash });

    it.each<{ case: string; approvals: CodeApproval[]; editors: string[] }>([
        {
            case: "none while every served plugin stays allowed and nothing withheld is",
            approvals: [row(resize)],
            editors: [],
        },
        {
            case: "the editors that load a revoked plugin",
            approvals: [],
            editors: ["file:///repo/a.bpmn", "file:///repo/c.bpmn"],
        },
        {
            case: "the editors that load a plugin whose row now holds other content",
            approvals: [{ pluginId: resize.id, contentHash: "r2" }],
            editors: ["file:///repo/a.bpmn", "file:///repo/c.bpmn"],
        },
        {
            case: "each editor once that was withheld a plugin now allowed",
            approvals: [row(resize), row(palette)],
            editors: ["file:///repo/a.bpmn", "file:///repo/b.bpmn"],
        },
        {
            case: "none for a withheld plugin allowed with other content",
            approvals: [row(resize), { pluginId: palette.id, contentHash: "p2" }],
            editors: [],
        },
        {
            case: "none for a row of a plugin no editor was offered",
            approvals: [row(resize), { pluginId: "/x", contentHash: "x" }],
            editors: [],
        },
    ])("returns $case", ({ approvals, editors }) => {
        expect(editorsToReload(offered, approvals)).toEqual(editors);
    });
});

describe("isPluginFolderName", () => {
    it.each<{ case: string; name: string; plugin: boolean }>([
        { case: "a plain folder name", name: "resize-tasks", plugin: true },
        { case: "a name with dots inside", name: "resize.tasks..v2", plugin: true },
        { case: "a hidden folder", name: ".resize", plugin: true },
        { case: "the current folder", name: ".", plugin: false },
        { case: "the parent folder", name: "..", plugin: false },
        { case: "an empty name", name: "", plugin: false },
        { case: "a name with a slash", name: "a/b", plugin: false },
        { case: "a name with a backslash", name: "a\\b", plugin: false },
    ])("takes $case as a plugin folder: $plugin", ({ name, plugin }) => {
        expect(isPluginFolderName(name)).toBe(plugin);
    });
});
