import { describe, expect, it } from "vitest";

import {
    isPluginFolderName,
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
