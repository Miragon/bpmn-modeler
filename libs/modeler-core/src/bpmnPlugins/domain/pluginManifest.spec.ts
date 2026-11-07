import { describe, expect, it } from "vitest";

import { type PluginManifestReading, readPluginManifest } from "./pluginManifest";

describe("readPluginManifest", () => {
    it.each<{ case: string; text: string; reading: PluginManifestReading }>([
        {
            case: "a full manifest",
            text: '{ "name": "Resize Tasks", "script": "dist/client.js", "style": "style.css" }',
            reading: {
                kind: "manifest",
                manifest: { name: "Resize Tasks", script: "dist/client.js", style: "style.css" },
            },
        },
        {
            case: "a manifest without a name, which takes the folder's",
            text: '{ "script": "./client.js" }',
            reading: { kind: "manifest", manifest: { name: "resize-tasks", script: "client.js" } },
        },
        {
            case: "a manifest without a script",
            text: '{ "name": "x" }',
            reading: { kind: "unreadable", reason: 'plugin.json names no "script"' },
        },
        {
            case: "text that is no JSON",
            text: "{ name: ",
            reading: { kind: "unreadable", reason: "plugin.json is not valid JSON" },
        },
    ])("reads $case from plugin.json", ({ text, reading }) => {
        expect(readPluginManifest("plugin.json", text, "resize-tasks")).toEqual(reading);
    });

    it.each<{ case: string; text: string; reading: PluginManifestReading }>([
        {
            case: "the object literal Camunda Modeler plugins export",
            text: `'use strict';
module.exports = {
  name: 'Resize Tasks',
  script: './dist/client.js',
  style: "./style/style.css",
  menu: './menu.js'
};`,
            reading: {
                kind: "manifest",
                manifest: {
                    name: "Resize Tasks",
                    script: "dist/client.js",
                    style: "style/style.css",
                },
            },
        },
        {
            case: "a script named by an expression it would have to run",
            text: "module.exports = { name: 'x', script: path.join(__dirname, 'client.js') };",
            reading: {
                kind: "unreadable",
                reason: "index.js does not name its script as a string literal; add a plugin.json",
            },
        },
    ])("reads $case from index.js without running it", ({ text, reading }) => {
        expect(readPluginManifest("index.js", text, "folder")).toEqual(reading);
    });

    it.each([
        ["../outside.js", "a path that leaves the plugin folder"],
        ["dist/../../outside.js", "a path that leaves it further down"],
        ["/etc/client.js", "an absolute path"],
        ["C:/client.js", "a drive path"],
        ["https://example.com/client.js", "a URL"],
    ])("refuses %s, %s", (script) => {
        expect(readPluginManifest("plugin.json", JSON.stringify({ script }), "x")).toEqual({
            kind: "unreadable",
            reason: `"${script}" is not a path inside the plugin folder`,
        });
    });

    it("refuses a style path that leaves the plugin folder", () => {
        const text = JSON.stringify({ script: "client.js", style: "../theme.css" });

        expect(readPluginManifest("plugin.json", text, "x")).toEqual({
            kind: "unreadable",
            reason: '"../theme.css" is not a path inside the plugin folder',
        });
    });
});
