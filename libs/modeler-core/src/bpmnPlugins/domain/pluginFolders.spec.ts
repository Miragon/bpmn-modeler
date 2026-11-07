import { describe, expect, it } from "vitest";

import {
    editorsOfferedAnyOf,
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

describe("editorsOfferedAnyOf", () => {
    const offered = new Map<string, readonly string[]>([
        ["file:///repo/a.bpmn", [`${PLUGINS}/resize`, `${PLUGINS}/palette`]],
        ["file:///repo/b.bpmn", [`${PLUGINS}/palette`]],
        ["file:///other/c.bpmn", []],
    ]);

    it.each<{ case: string; pluginIds: string[]; editors: string[] }>([
        {
            case: "every editor that was offered one of the plugins",
            pluginIds: [`${PLUGINS}/palette`],
            editors: ["file:///repo/a.bpmn", "file:///repo/b.bpmn"],
        },
        {
            case: "each editor once, though it was offered several of them",
            pluginIds: [`${PLUGINS}/resize`, `${PLUGINS}/palette`],
            editors: ["file:///repo/a.bpmn", "file:///repo/b.bpmn"],
        },
        {
            case: "only the editors offered that plugin",
            pluginIds: [`${PLUGINS}/resize`],
            editors: ["file:///repo/a.bpmn"],
        },
        { case: "none for a plugin no editor was offered", pluginIds: ["/x"], editors: [] },
        { case: "none for no plugins", pluginIds: [], editors: [] },
    ])("returns $case", ({ pluginIds, editors }) => {
        expect(editorsOfferedAnyOf(offered, pluginIds)).toEqual(editors);
    });
});
