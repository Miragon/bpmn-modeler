import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STANDALONE_APP_NAME, hostRunsElementXmlMergeEditor } from "./mergeEditorHost";

const VS_CODE = { appName: "Visual Studio Code", uriScheme: "vscode", listsMergeEditor: true };

describe("hostRunsElementXmlMergeEditor", () => {
    it.each([
        ["VS Code with the merge editor command", VS_CODE, true],
        ["VS Code Insiders", { ...VS_CODE, uriScheme: "vscode-insiders" }, true],
        ["VSCodium", { ...VS_CODE, appName: "VSCodium", uriScheme: "vscodium" }, true],
        ["a host without the merge editor command", { ...VS_CODE, listsMergeEditor: false }, false],
        [
            "the standalone app",
            { appName: STANDALONE_APP_NAME, uriScheme: "theia", listsMergeEditor: true },
            false,
        ],
        [
            "another Theia app",
            { appName: "Eclipse Theia", uriScheme: "theia", listsMergeEditor: true },
            false,
        ],
        [
            "the standalone app with a scheme of its own",
            { appName: STANDALONE_APP_NAME, uriScheme: "miragon", listsMergeEditor: true },
            false,
        ],
    ])("%s: %s", (_case, host, expected) => {
        expect(hostRunsElementXmlMergeEditor(host)).toBe(expected);
    });

    // Theia's plugin host reports `theia.frontend.config.applicationName` as `env.appName`.
    it("names the standalone app as its Theia config does", () => {
        const standalone = JSON.parse(
            readFileSync(resolve(__dirname, "../../../../../apps/standalone/package.json"), "utf8"),
        ) as { theia: { frontend: { config: { applicationName: string } } } };

        expect(standalone.theia.frontend.config.applicationName).toBe(STANDALONE_APP_NAME);
    });
});
