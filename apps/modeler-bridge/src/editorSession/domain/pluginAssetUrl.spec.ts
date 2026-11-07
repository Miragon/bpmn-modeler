import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { cachedPluginFiles } from "@miragon/bpmn-modeler-core";

import { pluginAssetUrlOf } from "./pluginAssetUrl";

interface UnmappedCase {
    readonly cacheRoot: string;
    readonly path: string;
}

interface MappedCase extends UnmappedCase {
    readonly url: string;
}

/** Shared with the IntelliJ host's `WebviewRouteTest`, which serves each mapped URL and refuses the others. */
const CASES = JSON.parse(readFileSync(resolve(__dirname, "pluginAssetUrl.cases.json"), "utf8")) as {
    mapped: MappedCase[];
    unmapped: UnmappedCase[];
};

const HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("pluginAssetUrlOf", () => {
    it.each(CASES.mapped)("maps $path to $url", ({ cacheRoot, path, url }) => {
        expect(pluginAssetUrlOf(cacheRoot, path)).toBe(url);
    });

    it.each(CASES.unmapped)("maps no URL for $path", ({ cacheRoot, path }) => {
        expect(pluginAssetUrlOf(cacheRoot, path)).toBeUndefined();
    });

    it.each([
        { cacheRoot: "/cache/bpmn-plugins", style: true },
        { cacheRoot: "C:\\cache\\bpmn-plugins", style: true },
        { cacheRoot: "/cache/bpmn-plugins/", style: false },
    ])(
        "maps every file the core caches below $cacheRoot (style: $style)",
        ({ cacheRoot, style }) => {
            const files = cachedPluginFiles(cacheRoot, {
                id: "/ws/.camunda/plugins/resize-tasks",
                name: "Resize Tasks",
                scriptPath: "/ws/.camunda/plugins/resize-tasks/client.js",
                ...(style ? { stylePath: "/ws/.camunda/plugins/resize-tasks/style.css" } : {}),
                contentHash: HASH,
            });

            expect(
                [files.script, files.style].map(
                    (path) => path && pluginAssetUrlOf(cacheRoot, path),
                ),
            ).toEqual([
                `/bpmn-plugins/${HASH}/plugin.js`,
                style ? `/bpmn-plugins/${HASH}/plugin.css` : undefined,
            ]);
        },
    );
});
