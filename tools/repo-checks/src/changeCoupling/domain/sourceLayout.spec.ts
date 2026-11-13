import { describe, expect, it } from "vitest";

import { compositionRoots, measuredFiles, type SourceLayout } from "./sourceLayout";

const WORKSPACES: SourceLayout["workspaces"] = [
    {
        dir: "apps/vscode-plugin",
        compositionFiles: ["apps/vscode-plugin/src/composition/main.ts"],
        namedPaths: ["apps/vscode-plugin/src/extension.ts"],
        contributesToHost: true,
    },
    { dir: "apps/intellij-plugin", compositionFiles: [], namedPaths: [], contributesToHost: false },
    {
        dir: "libs/i18n",
        compositionFiles: [],
        namedPaths: ["libs/i18n/tools/build-overlay.mjs"],
        contributesToHost: false,
    },
    { dir: "libs/shared", compositionFiles: [], namedPaths: [], contributesToHost: false },
];

function layoutOf(
    files: readonly string[],
    { barrels = [], generatedFiles = [] }: Partial<SourceLayout> = {},
): SourceLayout {
    return { files, barrels, generatedFiles, links: [], workspaces: WORKSPACES };
}

describe("the files change coupling reads", () => {
    it.each([
        { path: "apps/vscode-plugin/src/feature/Service.ts", read: true },
        { path: "apps/vscode-plugin/src/view/Panel.tsx", read: true },
        { path: "apps/intellij-plugin/src/main/kotlin/io/x/Editor.kt", read: true },
        { path: "libs/i18n/tools/build-overlay.mjs", read: true },
        { path: "libs/shared/src/lib/targets.schema.json", read: true },
        { path: "libs/shared/src/lib/messages.cases.json", read: true },
        { path: "apps/vscode-plugin/src/protocol/protocol.json", read: true },
        { path: "libs/shared/src/themes/dark.json", read: true },
        { path: "libs/i18n/src/languages/de.ts", read: true },
        { path: "apps/vscode-plugin/package.json", read: true },
        { path: "libs/shared/package.json", read: false },
        { path: "apps/vscode-plugin/src/feature/Service.spec.ts", read: false },
        { path: "apps/vscode-plugin/src/feature/view.browser.spec.tsx", read: false },
        { path: "apps/vscode-plugin/scripts/check.test.mjs", read: false },
        { path: "apps/vscode-plugin/src/__fixtures__/fakeHost.ts", read: false },
        { path: "apps/intellij-plugin/src/test/kotlin/io/x/EditorTest.kt", read: false },
        { path: "apps/vscode-plugin/src/__fixtures__/settings.json", read: false },
        { path: "apps/vscode-plugin/tsconfig.json", read: false },
        { path: "libs/i18n/tools/harvested.json", read: false },
        { path: "apps/vscode-plugin/test/smoke/run-in-container.mjs", read: false },
        { path: "libs/shared/stryker.config.mjs", read: false },
        { path: "apps/vscode-plugin/vitest.config.ts", read: false },
        { path: "apps/vscode-plugin/src/types.d.ts", read: false },
        { path: "apps/vscode-plugin/scripts/bundle.ts", read: false },
        { path: "scripts/perf/bench-webview.mjs", read: false },
    ])("$path: $read", ({ path, read }) => {
        expect(measuredFiles(layoutOf([path])).has(path)).toBe(read);
    });

    it("leaves a barrel out, wherever it sits", () => {
        const barrel = "libs/shared/src/lib/index.ts";

        expect(measuredFiles(layoutOf([barrel], { barrels: [barrel] })).has(barrel)).toBe(false);
    });

    it.each([
        "libs/i18n/src/languages/de.ts",
        "libs/shared/src/lib/generated.schema.json",
        "apps/intellij-plugin/src/main/kotlin/io/x/Generated.kt",
    ])("leaves %s out when it is declared generated", (generated) => {
        expect(
            measuredFiles(layoutOf([generated], { generatedFiles: [generated] })).has(generated),
        ).toBe(false);
    });
});

describe("the composition roots", () => {
    it("are composition/ files, the entries a manifest or build config names, and a host manifest", () => {
        expect([...compositionRoots(layoutOf([]))].sort()).toEqual([
            "apps/vscode-plugin/package.json",
            "apps/vscode-plugin/src/composition/main.ts",
            "apps/vscode-plugin/src/extension.ts",
            "libs/i18n/tools/build-overlay.mjs",
        ]);
    });
});
