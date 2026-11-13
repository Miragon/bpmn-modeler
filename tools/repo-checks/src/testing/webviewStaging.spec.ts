import { describe, expect, it } from "vitest";

import { stagingFolders, viteStagingFolder } from "./webviewStaging";

describe("webview staging parsers", () => {
    it("read the first folder below dist/webview-staging in each literal, comments skipped", () => {
        const buildFile = {
            path: "apps/host/build.gradle.kts",
            text: `// copies "../../dist/webview-staging/commented-webview"
 * also "dist/webview-staging/doc-webview"
val one = dir("../../dist/webview-staging/one-webview")
val two =
    dir("../../dist/webview-staging/two-webview")
from: path.resolve(__dirname, '../../dist/webview-staging/one-webview/licenses'),
`,
        };

        expect(stagingFolders(buildFile)).toEqual(["one-webview", "two-webview"]);
    });

    it("fails on a build file that copies no staging folder", () => {
        expect(() => stagingFolders({ path: "apps/host/webpack.config.js", text: "" })).toThrow(
            "apps/host/webpack.config.js copies no dist/webview-staging/<folder>",
        );
    });

    it.each([
        ['outDir: "../../dist/webview-staging/one-webview",', "one-webview"],
        ['outDir: "dist",', undefined],
    ])("reads the staging folder a Vite build writes: %s", (line, folder) => {
        expect(viteStagingFolder({ path: "apps/one/vite.config.mts", text: line })).toBe(folder);
    });
});
